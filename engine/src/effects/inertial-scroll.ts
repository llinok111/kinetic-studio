import type { Disposable } from '../types'
import type { EngineContext } from '../core/context'
import { Disposer } from '../core/disposer'
import { Spring, SPRING_PRESETS, Decay, rubberbandPosition } from '../core/spring'
import { clamp, normalizeWheel } from '../core/math'
import { applyTouchAction } from '../core/touch'
import { GestureHost } from './host'

/**
 * Inertial scrolling, in two deliberately separate modes.
 *
 * `native` (default) never hijacks the wheel. It only *assists*: after the
 * browser's own scrolling settles, the container animates to the nearest snap
 * point. Native momentum, keyboard scrolling, `PageDown`, screen-reader paging,
 * `scrollIntoView`, anchor links and find-in-page all keep working, because the
 * native scroll position remains the single source of truth.
 *
 * `virtual` takes over the wheel and touch. It is what produces the "weighted"
 * feel, but it also breaks every native affordance unless they are rebuilt —
 * which this mode does: keyboard paging, focus-into-view, and anchor resolution
 * are re-implemented below. It must be opted into explicitly, and it degrades to
 * `native` under reduced motion.
 *
 * Most smooth-scroll libraries only ship the second mode and silently break
 * accessibility on every page that uses them. Making `native` the default is the
 * point.
 */

export interface InertialScrollOptions {
  mode?: 'native' | 'virtual'
  /** Exponential friction, e-folds/second. Default 6. */
  friction?: number
  wheelMultiplier?: number
  /** CSS selector for snap targets inside the content, or absolute offsets. */
  snap?: string | number[]
  /**
   * `mandatory` always lands on the nearest snap point (CSS `scroll-snap-type:
   * y mandatory`); `proximity` only snaps when the release is already close.
   */
  snapMode?: 'mandatory' | 'proximity'
  /** Distance (px) within which `proximity` mode snaps. Default 48. */
  snapThreshold?: number
  enabled?: boolean
  onScroll?: (info: { position: number; max: number; phase: string }) => void
}

export class InertialScroll implements Disposable {
  private container: HTMLElement
  private content: HTMLElement
  private engine: EngineContext
  private scope = new Disposer('inertial-scroll')
  private opts: Required<Omit<InertialScrollOptions, 'snap' | 'onScroll'>> & {
    snap?: string | number[]
    onScroll?: InertialScrollOptions['onScroll']
  }

  private mode: 'native' | 'virtual'
  private pos = 0
  private target = 0
  private spring: Spring
  private decay: Decay | null = null
  private max = 0
  private removeFrame: (() => void) | null = null
  private host: GestureHost | null = null
  private dragging = false
  private dragStart = 0
  private dragStartPos = 0
  private snapPoints: number[] = []
  private snapTimer: (() => void) | null = null
  /**
   * Snap only after a user-driven scroll settles. Programmatic scrolls (the
   * `scrollTo` API and focus-into-view) must be allowed to land between snap
   * points — otherwise mandatory snapping drags a focused field straight back
   * off screen and the caret becomes invisible.
   */
  private snapAfterSettle = false
  private modeScope = new Disposer('scroll-mode')

  constructor(container: HTMLElement, content: HTMLElement, options: InertialScrollOptions, ctx: EngineContext) {
    this.container = container
    this.content = content
    this.engine = ctx
    this.opts = {
      mode: options.mode ?? 'native',
      friction: options.friction ?? 6,
      wheelMultiplier: options.wheelMultiplier ?? 1,
      snapMode: options.snapMode ?? 'mandatory',
      snapThreshold: options.snapThreshold ?? 48,
      enabled: options.enabled ?? true,
      snap: options.snap,
      onScroll: options.onScroll
    }
    this.mode = this.opts.mode === 'virtual' && !ctx.reduced ? 'virtual' : 'native'
    this.spring = new Spring(0, SPRING_PRESETS.crisp)

    this.measure()
    this.bind()
    this.applyMode()

    ctx.motion.subscribe(() => {
      // Flipping to reduced motion while a virtual scroll is running must hand
      // control back to the browser, not freeze the container.
      const next = this.opts.mode === 'virtual' && !ctx.reduced ? 'virtual' : 'native'
      if (next !== this.mode) {
        this.mode = next
        this.applyMode()
      }
    })
  }

  get position(): number {
    return this.mode === 'virtual' ? this.pos : this.container.scrollTop
  }

  get maxScroll(): number {
    return this.max
  }

  get currentMode(): 'native' | 'virtual' {
    return this.mode
  }

  private measure(): void {
    const contentHeight = this.content.scrollHeight || this.content.getBoundingClientRect().height
    const viewport = this.container.clientHeight
    this.max = Math.max(0, contentHeight - viewport)
    this.resolveSnapPoints()
  }

  private resolveSnapPoints(): void {
    const snap = this.opts.snap
    if (!snap) {
      this.snapPoints = []
      return
    }
    if (Array.isArray(snap)) {
      this.snapPoints = snap.slice().sort((a, b) => a - b)
      return
    }
    // Offsets are measured from the container's scroll origin, so the snap list
    // must be recomputed whenever layout changes — a hard-coded list goes stale
    // the moment a font loads.
    const containerTop = this.container.getBoundingClientRect().top
    this.snapPoints = Array.from(this.content.querySelectorAll<HTMLElement>(snap))
      .map((el) => el.getBoundingClientRect().top - containerTop + this.position)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)
  }

  private bind(): void {
    const scope = this.scope

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        this.measure()
        if (this.mode === 'virtual') this.clampTarget()
      })
      ro.observe(this.content)
      ro.observe(this.container)
      scope.onDispose(() => ro.disconnect())
    }

    // Native mode: snap assist only. Listening passively means zero interference
    // with the browser's scrolling.
    scope.listen(this.container, 'scroll', () => {
      if (this.mode !== 'native') return
      this.opts.onScroll?.({ position: this.container.scrollTop, max: this.max, phase: 'scroll' })
      this.scheduleNativeSnap()
    }, { passive: true })

    scope.listen(this.container, 'wheel', (event) => this.onWheel(event as WheelEvent), { passive: false })
    scope.listen(this.container, 'keydown', (event) => this.onKey(event as KeyboardEvent))
    scope.listen(this.container, 'focusin', (event) => this.onFocusIn(event as FocusEvent))
  }

  private applyMode(): void {
    // Mode-scoped styles live in their own disposer: switching between native and
    // virtual must restore the author's `overflow` exactly, not leave whichever
    // value the engine wrote last.
    this.modeScope.dispose()
    this.modeScope = new Disposer('scroll-mode')

    if (this.mode === 'virtual') {
      // Capture the native position *before* hiding the overflow: setting
      // `overflow: hidden` makes the browser clamp `scrollTop` to 0, so reading it
      // afterwards silently throws away the user's position on every mode switch.
      const nativePosition = this.container.scrollTop
      this.modeScope.style(this.container, 'overflow', 'hidden')
      this.modeScope.style(this.container, 'overscroll-behavior', 'contain')
      applyTouchAction(this.container, 'y', this.modeScope, this.engine.caps.touch)
      this.modeScope.style(this.content, 'will-change', 'transform')
      this.pos = Math.min(nativePosition, this.max)
      this.target = this.pos
      this.spring.jump(this.pos)
      this.write()
      this.createDragHost()
    } else {
      this.teardownDragHost()
      this.content.style.removeProperty('transform')
      this.content.style.removeProperty('will-change')
    }
  }

  private createDragHost(): void {
    if (this.host) return
    this.host = new GestureHost(
      this.container,
      'drag',
      (state) => this.onDrag(state),
      { axis: 'y', threshold: 2, filterTaps: true, preventScroll: true }
    )
  }

  private teardownDragHost(): void {
    this.host?.destroy()
    this.host = null
  }

  private onWheel(event: WheelEvent): void {
    if (this.mode !== 'virtual' || !this.opts.enabled) return
    const unit = normalizeWheel(event.deltaY, event.deltaMode, this.container.clientHeight)
    if (unit === 0) return
    event.preventDefault()
    this.decay = null
    this.target += unit * this.opts.wheelMultiplier
    this.snapAfterSettle = true
    this.clampTarget()
    this.ensureFrame()
  }

  private onDrag(state: any): void {
    if (this.mode !== 'virtual') return
    if (!this.opts.enabled) return
    if (state.first) {
      this.dragging = true
      this.decay = null
      this.dragStart = state.event?.clientY ?? 0
      this.dragStartPos = this.pos
      return
    }
    if (!this.dragging) return

    const dy = (state.event?.clientY ?? this.dragStart) - this.dragStart
    const raw = this.dragStartPos - dy
    // Resistance past both ends, same curve as the draggable cards.
    this.pos = rubberbandPosition(raw, 0, this.max, 0.2)
    this.target = this.pos
    this.write()

    if (state.last) {
      this.dragging = false
      const v = (-(state.velocity?.[1] ?? 0) * 1000) * Math.sign(state.direction?.[1] ?? 0)
      if (this.engine.motion.policy.allowInertia && Math.abs(v) > 80) {
        this.decay = new Decay(v, this.opts.friction)
        this.ensureFrame()
      } else {
        this.settleToSnap()
      }
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (this.mode !== 'virtual') return
    const page = this.container.clientHeight * 0.9
    let next: number | null = null
    switch (event.key) {
      case 'ArrowDown':
        next = this.target + 48
        break
      case 'ArrowUp':
        next = this.target - 48
        break
      case 'PageDown':
        next = this.target + page
        break
      case 'PageUp':
        next = this.target - page
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = this.max
        break
      default:
        next = null
    }
    if (next === null) return
    event.preventDefault()
    this.target = next
    this.clampTarget()
    this.ensureFrame()
  }

  /**
   * Virtual scrolling has no native `scrollIntoView`, so tabbing into an
   * off-screen field would leave the caret invisible. Focus is the one case
   * where silently broken scrolling becomes an accessibility failure.
   */
  private onFocusIn(event: FocusEvent): void {
    if (this.mode !== 'virtual') return
    const el = event.target as HTMLElement | null
    if (!el || !this.content.contains(el)) return
    const containerTop = this.container.getBoundingClientRect().top
    const rect = el.getBoundingClientRect()
    const top = rect.top - containerTop + this.pos
    const bottom = top + rect.height
    if (top < this.pos) {
      this.target = top
    } else if (bottom > this.pos + this.container.clientHeight) {
      this.target = bottom - this.container.clientHeight
    } else {
      return
    }
    this.clampTarget()
    this.ensureFrame()
  }

  private clampTarget(): void {
    this.target = clamp(this.target, 0, this.max)
  }

  private ensureFrame(): void {
    if (this.removeFrame) return
    this.removeFrame = this.engine.loop.add((info) => this.tick(info.dtSec), 5)
  }

  private tick(dtSec: number): void {
    if (this.dragging) {
      this.write()
      return
    }

    if (this.decay) {
      const delta = this.decay.step(dtSec)
      this.pos += delta
      if (this.pos <= 0 || this.pos >= this.max) {
        this.pos = clamp(this.pos, 0, this.max)
        this.decay = null
        this.settleToSnap()
      } else if (this.decay.done) {
        this.decay = null
        this.settleToSnap()
      }
      this.target = this.pos
      this.write()
      return
    }

    this.spring.setTarget(this.target)
    this.pos = this.spring.step(dtSec)
    this.write()
    if (this.spring.settled) {
      this.pos = this.target
      this.write()
      // A wheel gesture that ends between two snap points must still land on one;
      // otherwise the container stops wherever the accumulated delta happened to
      // end, which is exactly what scroll snapping exists to prevent.
      const snapped = this.snapAfterSettle ? this.snapPointFor(this.pos) : null
      if (snapped !== null && Math.abs(snapped - this.pos) > 0.5) {
        this.target = snapped
        return
      }
      this.snapAfterSettle = false
      this.removeFrame?.()
      this.removeFrame = null
    }
  }

  private settleToSnap(): void {
    this.snapAfterSettle = false
    if (this.snapPoints.length === 0) {
      this.target = clamp(this.pos, 0, this.max)
    } else {
      let best = this.pos
      let bestD = Infinity
      for (const p of this.snapPoints) {
        const d = Math.abs(p - this.pos)
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      const within = this.opts.snapMode === 'mandatory' || bestD <= this.opts.snapThreshold
      this.target = within ? best : clamp(this.pos, 0, this.max)
    }
    if (this.engine.reduced) {
      this.pos = this.target
      this.write()
      return
    }
    this.ensureFrame()
  }

  private snapPointFor(position: number): number | null {
    if (this.snapPoints.length === 0) return null
    let best: number | null = null
    let bestD = Infinity
    for (const p of this.snapPoints) {
      const d = Math.abs(p - position)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    if (best === null) return null
    if (this.opts.snapMode === 'mandatory') return clamp(best, 0, this.max)
    return bestD <= this.opts.snapThreshold ? clamp(best, 0, this.max) : null
  }

  private write(): void {
    this.content.style.transform = `translate3d(0, ${-Math.round(this.pos * 100) / 100}px, 0)`
    this.opts.onScroll?.({ position: this.pos, max: this.max, phase: this.dragging ? 'drag' : this.decay ? 'inertia' : 'settle' })
  }

  /**
   * Native-mode snap assist. Debounced instead of using `scrollend`, which is
   * still missing in Safari; the debounce is also what makes it work for
   * trackpad inertia, where `scrollend` fires once per gesture but the event
   * stream pauses mid-flick.
   */
  private scheduleNativeSnap(): void {
    if (!this.opts.snap || this.snapPoints.length === 0) return
    this.snapTimer?.()
    this.snapTimer = this.scope.timeout(() => {
      const current = this.container.scrollTop
      let best = current
      let bestD = Infinity
      for (const p of this.snapPoints) {
        const d = Math.abs(p - current)
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      if (bestD > 4 && bestD <= this.opts.snapThreshold) {
        this.container.scrollTo({
          top: clamp(best, 0, this.max),
          behavior: this.engine.reduced ? 'auto' : 'smooth'
        })
      }
    }, 140)
  }

  scrollTo(position: number, immediate = false): void {
    const next = clamp(position, 0, this.max)
    if (this.mode === 'native') {
      this.container.scrollTo({ top: next, behavior: immediate || this.engine.reduced ? 'auto' : 'smooth' })
      return
    }
    this.target = next
    if (immediate) {
      this.pos = next
      this.spring.jump(next)
      this.write()
      return
    }
    this.ensureFrame()
  }

  setMode(mode: 'native' | 'virtual'): void {
    this.opts.mode = mode
    this.mode = mode === 'virtual' && !this.engine.reduced ? 'virtual' : 'native'
    this.applyMode()
  }

  setEnabled(enabled: boolean): void {
    this.opts.enabled = enabled
    this.decay = null
  }

  destroy(): void {
    this.removeFrame?.()
    this.removeFrame = null
    this.teardownDragHost()
    // Disposal order matters: the mode scope restores the author's inline styles,
    // the parent scope restores everything else. Manually calling
    // `removeProperty` afterwards would erase values the author had set inline.
    this.modeScope.dispose()
    this.scope.dispose()
  }
}
