import type { Disposable } from '../types'
import type { EngineContext } from '../core/context'
import { Disposer } from '../core/disposer'

/**
 * Pointer trail rendered into a 2D canvas.
 *
 * Three things separate this from the typical "push point, draw line" demo:
 *
 * 1. **Coalesced events.** A 240 Hz mouse fires several `pointermove`s per
 *    frame. Sampling only the dispatched event produces a polyline with visible
 *    corners on fast strokes. `getCoalescedEvents()` exposes the sub-frame
 *    history; this module consumes it, capped per frame so a stalled tab cannot
 *    dump 300 samples at once.
 * 2. **Device pixel ratio.** Without scaling the backing store, the line is
 *    blurred on every retina display. The canvas is sized in device pixels and
 *    the context is pre-scaled, so callers pass CSS pixels.
 * 3. **Stale buffer on return.** After `visibilitychange` the pointer may have
 *    moved thousands of pixels. Keeping the buffer draws a straight line across
 *    the page. The buffer is dropped on hide/blur/leave.
 */

export interface TrailOptions {
  /** Maximum samples kept. More = longer tail. Default 26. */
  length?: number
  /** Stroke width in CSS px at the newest sample. Default 7. */
  width?: number
  color?: string
  mode?: 'comet' | 'dots'
  /** Fade the tail out over this many ms of inactivity. Default 180. */
  fade?: number
  /** Optional element the canvas covers; defaults to the viewport. */
  host?: HTMLElement
}

interface Sample {
  x: number
  y: number
  t: number
}

export class Trail implements Disposable {
  private canvas: HTMLCanvasElement
  private ctx2d: CanvasRenderingContext2D | null
  private engine: EngineContext
  private scope = new Disposer('trail')
  private samples: Sample[] = []
  private opts: Required<Omit<TrailOptions, 'host'>>
  private removeFrame: (() => void) | null = null
  private dpr = 1
  private lastMove = 0
  private lastDraw = 0
  private active = false
  private disabled = false
  private reduceUnsub: () => void

  constructor(canvas: HTMLCanvasElement, options: TrailOptions, ctx: EngineContext) {
    this.canvas = canvas
    this.engine = ctx
    this.opts = {
      length: Math.max(2, options.length ?? 26),
      width: Math.max(1, options.width ?? 7),
      color: options.color ?? '#e2703a',
      mode: options.mode ?? 'comet',
      fade: options.fade ?? 180
    }

    this.ctx2d = canvas.getContext('2d')
    this.resize()
    this.bind(options.host)

    // Trail is decorative. Reduced motion removes it entirely rather than
    // shortening it — a fast-moving line is exactly the vestibular trigger the
    // preference exists for.
    this.reduceUnsub = ctx.motion.subscribe(() => this.applyMotionMode())
    this.applyMotionMode()
  }

  get enabled(): boolean {
    return this.active && !this.disabled
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled
    if (disabled) this.clear()
    else this.applyMotionMode()
  }

  private applyMotionMode(): void {
    const allowed = this.engine.motion.policy.allowTrail && this.engine.caps.hover
    this.active = allowed
    if (!allowed) this.clear()
  }

  private bind(host?: HTMLElement): void {
    const scope = this.scope
    const target: HTMLElement | Window = host ?? window

    scope.listen(target as Window, 'pointermove', (event) => this.onMove(event as PointerEvent), {
      passive: true
    })
    scope.listen(window, 'pointerout', (event) => {
      if (!(event as PointerEvent).relatedTarget) this.clear()
    })
    scope.listen(window, 'blur', () => this.clear())
    scope.listen(document, 'visibilitychange', () => this.clear())

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resize())
      ro.observe(host ?? document.documentElement)
      scope.onDispose(() => ro.disconnect())
    }

    scope.listen(window, 'resize', () => this.resize(), { passive: true })
  }

  private onMove(event: PointerEvent): void {
    if (!this.enabled) return
    if (event.buttons !== 0) {
      // A drag owns the pointer; a trail behind a dragged element reads as lag.
      this.clear()
      return
    }

    const now = event.timeStamp || performance.now()
    const coalesced =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []

    if (coalesced.length > 1) {
      // Cap the batch: a resumed tab can hand us hundreds of samples.
      const stride = Math.max(1, Math.ceil(coalesced.length / 8))
      for (let i = 0; i < coalesced.length; i += stride) {
        const e = coalesced[i]
        this.push(e.clientX, e.clientY, e.timeStamp || now)
      }
    } else {
      this.push(event.clientX, event.clientY, now)
    }

    this.lastMove = now
    this.ensureFrame()
  }

  private push(x: number, y: number, t: number): void {
    const last = this.samples[this.samples.length - 1]
    if (last && Math.abs(last.x - x) < 0.4 && Math.abs(last.y - y) < 0.4) return
    this.samples.push({ x, y, t })
    const max = this.engine.loop.tier === 'low' ? Math.max(4, Math.floor(this.opts.length * 0.4)) : this.opts.length
    while (this.samples.length > max) this.samples.shift()
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const w = rect.width || this.canvas.clientWidth || window.innerWidth
    const h = rect.height || this.canvas.clientHeight || window.innerHeight
    // Read DPR on every resize: dragging a window between monitors changes it.
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.max(1, Math.round(w * this.dpr))
    this.canvas.height = Math.max(1, Math.round(h * this.dpr))
    if (this.ctx2d) this.ctx2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private ensureFrame(): void {
    if (this.removeFrame) return
    this.removeFrame = this.engine.loop.add((info) => this.draw(info.time), 20)
  }

  private draw(now: number): void {
    const ctx = this.ctx2d
    if (!ctx) return
    const w = this.canvas.width / this.dpr
    const h = this.canvas.height / this.dpr

    // Low tier: halve the paint rate. The tail still reads as a trail because
    // the sample buffer is what carries the shape, not the frame rate.
    if (this.engine.loop.tier === 'low' && now - this.lastDraw < 32) return
    this.lastDraw = now

    ctx.clearRect(0, 0, w, h)

    const idle = now - this.lastMove
    if (this.samples.length < 2 || idle > this.opts.fade * 3) {
      this.samples.length = 0
      this.removeFrame?.()
      this.removeFrame = null
      return
    }

    const fadeT = idle <= this.opts.fade ? 1 : Math.max(0, 1 - (idle - this.opts.fade) / (this.opts.fade * 2))
    const n = this.samples.length
    // `globalAlpha` is the portable way to fade an arbitrary CSS colour: building
    // an `rgba()` string would require parsing every accepted colour syntax.
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = this.opts.color
    ctx.fillStyle = this.opts.color

    for (let i = 1; i < n; i++) {
      const t = i / (n - 1)
      const a = this.samples[i - 1]
      const b = this.samples[i]
      const alpha = t * 0.55 * fadeT
      if (alpha <= 0.005) continue
      ctx.globalAlpha = alpha

      if (this.opts.mode === 'dots') {
        ctx.beginPath()
        ctx.arc(b.x, b.y, Math.max(0.6, this.opts.width * 0.5 * t), 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.lineWidth = Math.max(0.5, this.opts.width * t)
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  clear(): void {
    this.samples.length = 0
    if (this.ctx2d) {
      const { width, height } = this.canvas
      this.ctx2d.clearRect(0, 0, width, height)
    }
  }

  destroy(): void {
    this.removeFrame?.()
    this.removeFrame = null
    this.reduceUnsub()
    this.scope.dispose()
    this.clear()
  }
}
