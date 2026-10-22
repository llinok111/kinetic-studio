import type { Disposable, SpringConfig } from '../types'
import type { EngineContext } from '../core/context'
import { Disposer } from '../core/disposer'
import { MotionWriter } from '../core/motion-writer'
import { Spring, SPRING_PRESETS } from '../core/spring'
import { distance, easeOutQuad } from '../core/math'
import { InteractionMachine } from '../interaction/machine'

/**
 * Magnetic controls: the element leans toward the pointer while it is inside an
 * attraction radius, and springs back when the pointer leaves.
 *
 * The non-obvious part is the *hit region*. The intuitive implementation listens
 * on the element itself and measures `pointer - elementCenter`. But the element
 * moves as it leans, so the pointer can cross the element's trailing edge, the
 * element springs back, the pointer is inside again — and the control vibrates
 * at frame rate. That artefact is common in "magnetic button" demos and it gets
 * worse the stronger the pull is.
 *
 * The fix used here: measure against the element's **rest rect** (its position
 * with the engine offset subtracted) and listen on `window`. The trigger region
 * is therefore fixed in space and independent of the element's own animation.
 */

export interface MagneticOptions {
  /** Attraction radius in px. `'auto'` derives it from the element size. */
  radius?: number | 'auto'
  /** Peak displacement as a fraction of the pointer offset. 0..1. Default 0.34. */
  strength?: number
  /** Hard cap on displacement in px. Default 22. */
  maxOffset?: number
  axis?: 'x' | 'y' | 'both'
  /** Hover scale, composed with `transform`. Default 1 (off). */
  scale?: number
  spring?: SpringConfig
  releaseSpring?: SpringConfig
  /** Disable without destroying (e.g. while a modal is open). */
  disabled?: boolean
}

interface RestRect {
  cx: number
  cy: number
  w: number
  h: number
}

export class Magnetic implements Disposable {
  private el: HTMLElement
  private ctx: EngineContext
  private scope = new Disposer('magnetic')
  private writer: MotionWriter
  private sx: Spring
  private sy: Spring
  private machine = new InteractionMachine()
  private rest: RestRect = { cx: 0, cy: 0, w: 0, h: 0 }
  private pointer = { x: 0, y: 0, valid: false }
  private engaged = false
  private removeFrame: (() => void) | null = null
  private opts: Required<Omit<MagneticOptions, 'spring' | 'releaseSpring'>> & {
    spring: SpringConfig
    releaseSpring: SpringConfig
  }
  private reduceListener: () => void

  constructor(el: HTMLElement, options: MagneticOptions, ctx: EngineContext) {
    this.el = el
    this.ctx = ctx
    this.writer = new MotionWriter(el)

    this.opts = {
      radius: options.radius ?? 'auto',
      strength: clamp01(options.strength ?? 0.34),
      maxOffset: options.maxOffset ?? 22,
      axis: options.axis ?? 'both',
      scale: options.scale ?? 1,
      disabled: options.disabled ?? false,
      spring: options.spring ?? SPRING_PRESETS.tight,
      releaseSpring: options.releaseSpring ?? SPRING_PRESETS.balanced
    }

    this.sx = new Spring(0, this.opts.spring)
    this.sy = new Spring(0, this.opts.spring)

    this.measure()
    this.bind()

    this.reduceListener = ctx.motion.subscribe(() => this.applyMotionMode())
    this.applyMotionMode()
  }

  /** Current phase — `hover` while pulled, `idle` otherwise. */
  get phase() {
    return this.machine.phase
  }

  setDisabled(disabled: boolean): void {
    this.opts.disabled = disabled
    if (disabled) this.release('disabled')
  }

  /** Recompute the rest rect (call after layout changes you cause yourself). */
  measure(): void {
    const rect = this.el.getBoundingClientRect()
    this.rest = {
      cx: rect.left + rect.width / 2 - this.sx.value,
      cy: rect.top + rect.height / 2 - this.sy.value,
      w: rect.width,
      h: rect.height
    }
  }

  private get radius(): number {
    if (this.opts.radius !== 'auto') return this.opts.radius
    return Math.max(this.rest.w, this.rest.h) * 0.55 + 24
  }

  private bind(): void {
    const scope = this.scope

    scope.listen(window, 'pointermove', (event) => this.onPointerMove(event), { passive: true })
    // `pointerout` with a null relatedTarget is the only reliable "left the
    // window" signal; `pointerleave` does not fire when the pointer exits the
    // viewport at speed in some Chromium builds.
    scope.listen(window, 'pointerout', (event) => {
      if (!(event as PointerEvent).relatedTarget) this.release('left-window')
    })
    scope.listen(window, 'blur', () => this.release('window-blur'))
    scope.listen(window, 'scroll', () => this.measure(), { passive: true, capture: true })

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.measure())
      ro.observe(this.el)
      scope.onDispose(() => ro.disconnect())
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.opts.disabled) return
    // Never fight a real gesture: magnetism is a zero-button interaction.
    if (event.buttons !== 0) {
      this.release('pointer-down')
      return
    }
    if (this.ctx.reduced || !this.ctx.canHover) return

    const r = this.radius
    const d = distance(event.clientX, event.clientY, this.rest.cx, this.rest.cy)
    this.pointer = { x: event.clientX, y: event.clientY, valid: true }

    if (d > r) {
      if (this.engaged) this.release('out-of-radius')
      return
    }

    if (!this.engaged) {
      this.engaged = true
      this.machine.to('hover', 'enter-radius')
      this.el.setAttribute('data-kinetic-magnetic', 'engaged')
      this.el.style.willChange = 'translate'
    }

    const falloff = easeOutQuad(1 - d / r)
    const dx = (event.clientX - this.rest.cx) * this.opts.strength * falloff
    const dy = (event.clientY - this.rest.cy) * this.opts.strength * falloff
    const cap = this.opts.maxOffset

    if (this.opts.axis !== 'y') this.sx.setTarget(clampAbs(dx, cap))
    if (this.opts.axis !== 'x') this.sy.setTarget(clampAbs(dy, cap))
    this.ensureFrame()
  }

  private release(reason: string): void {
    if (!this.engaged && this.sx.value === 0 && this.sy.value === 0) return
    this.engaged = false
    this.pointer.valid = false
    this.machine.to('idle', reason)
    this.el.removeAttribute('data-kinetic-magnetic')
    this.sx.stiffness = this.opts.releaseSpring.stiffness ?? SPRING_PRESETS.balanced.stiffness
    this.sx.damping = this.opts.releaseSpring.damping ?? SPRING_PRESETS.balanced.damping
    this.sy.stiffness = this.sx.stiffness
    this.sy.damping = this.sx.damping

    if (this.ctx.reduced) {
      // Reduced motion: land immediately, no settle animation.
      this.sx.jump(0)
      this.sy.jump(0)
      this.writer.reset()
      return
    }
    this.sx.setTarget(0)
    this.sy.setTarget(0)
    this.ensureFrame()
  }

  private ensureFrame(): void {
    if (this.removeFrame) return
    this.removeFrame = this.ctx.loop.add((info) => this.tick(info.dtSec), 10)
  }

  private tick(dtSec: number): void {
    const x = this.sx.step(dtSec)
    const y = this.sy.step(dtSec)
    this.writer.write(x, y, this.engaged ? this.opts.scale : 1)

    if (!this.engaged && this.sx.settled && this.sy.settled) {
      this.writer.write(0, 0, 1)
      this.sx.jump(0)
      this.sy.jump(0)
      this.el.style.removeProperty('will-change')
      this.removeFrame?.()
      this.removeFrame = null
    }
  }

  private applyMotionMode(): void {
    if (this.ctx.reduced) {
      this.release('reduced-motion')
      this.writer.reset()
      this.el.setAttribute('data-kinetic-magnetic', 'reduced')
    } else {
      this.el.removeAttribute('data-kinetic-magnetic')
    }
  }

  destroy(): void {
    this.removeFrame?.()
    this.removeFrame = null
    this.reduceListener()
    this.scope.dispose()
    this.writer.reset()
    this.el.removeAttribute('data-kinetic-magnetic')
    this.el.style.removeProperty('will-change')
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function clampAbs(v: number, cap: number): number {
  return v > cap ? cap : v < -cap ? -cap : v
}
