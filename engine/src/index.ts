import type { Capabilities, Diagnostics, KineticOptions, MotionPolicy } from './types'
import { EngineContext } from './core/context'
import { counters, liveListenerCount } from './core/disposer'
import { Magnetic, type MagneticOptions } from './effects/magnetic'
import { Trail, type TrailOptions } from './effects/trail'
import { ElasticDrag, type ElasticDragOptions } from './effects/elastic-drag'
import { InertialScroll, type InertialScrollOptions } from './effects/inertial-scroll'
import { GestureRecognizer, type GestureOptions } from './effects/gestures'

export type { KineticOptions, Capabilities, MotionPolicy, Phase, QualityTier, FrameInfo, Diagnostics } from './types'
export type { MagneticOptions } from './effects/magnetic'
export type { TrailOptions } from './effects/trail'
export type { ElasticDragOptions } from './effects/elastic-drag'
export type { InertialScrollOptions } from './effects/inertial-scroll'
export type { GestureOptions, SwipeInfo, PinchInfo } from './effects/gestures'

export { FrameLoop, frameLoop } from './core/frame-loop'
export { Spring, Decay, SPRING_PRESETS, momentumDistance, clampMomentum, rubberbandPosition } from './core/spring'
export { InteractionMachine } from './interaction/machine'
export { Arbiter, PRIORITY } from './interaction/arbiter'
export { Disposer, counters, liveListenerCount, resetCounters } from './core/disposer'
export { readCapabilities } from './core/capability'
export { MotionController } from './core/motion'

/**
 * Engine facade.
 *
 * One engine instance == one shared kernel (capabilities, motion policy, frame
 * loop, arbiter) + N effects. Cheap to create, but there should be one per page:
 * two instances would each run their own clock and their own arbitration, which
 * is exactly the inconsistency the kernel exists to prevent.
 */
export class Kinetic {
  readonly ctx: EngineContext
  private effects = new Set<{ destroy(): void }>()
  private disposed = false

  constructor(options: KineticOptions = {}) {
    this.ctx = new EngineContext(options)
  }

  get capabilities(): Capabilities {
    return this.ctx.caps
  }

  get motionPolicy(): MotionPolicy {
    return this.ctx.motion.policy
  }

  /** Change the motion preference at runtime (`auto` follows the OS). */
  setMotion(preference: 'auto' | 'reduce' | 'full'): void {
    this.ctx.motion.set(preference)
  }

  /** Force a quality tier instead of the adaptive one. `null` = adaptive. */
  setQuality(tier: 'high' | 'mid' | 'low' | null): void {
    this.ctx.loop.forceTier(tier)
  }

  magnetic(el: HTMLElement, options: MagneticOptions = {}): Magnetic {
    return this.track(new Magnetic(el, options, this.ctx))
  }

  trail(canvas: HTMLCanvasElement, options: TrailOptions = {}): Trail {
    return this.track(new Trail(canvas, options, this.ctx))
  }

  elasticDrag(el: HTMLElement, options: ElasticDragOptions = {}): ElasticDrag {
    return this.track(new ElasticDrag(el, options, this.ctx))
  }

  inertialScroll(
    container: HTMLElement,
    content: HTMLElement,
    options: InertialScrollOptions = {}
  ): InertialScroll {
    return this.track(new InertialScroll(container, content, options, this.ctx))
  }

  gestures(el: HTMLElement, options: GestureOptions = {}): GestureRecognizer {
    return this.track(new GestureRecognizer(el, options, this.ctx))
  }

  /** Counters used by the leak tests and the demo's diagnostics panel. */
  diagnostics(): Diagnostics {
    return {
      listenersBound: counters.listenersBound,
      listenersReleased: counters.listenersReleased,
      timeoutsCreated: counters.timeoutsCreated,
      timeoutsCleared: counters.timeoutsCleared,
      framesScheduled: counters.framesScheduled,
      rejectedTransitions: 0,
      abortedGestures: 0
    }
  }

  get liveListeners(): number {
    return liveListenerCount()
  }

  get effectCount(): number {
    return this.effects.size
  }

  private track<T extends { destroy(): void }>(effect: T): T {
    if (this.disposed) {
      effect.destroy()
      return effect
    }
    this.effects.add(effect)
    const originalDestroy = effect.destroy.bind(effect)
    effect.destroy = () => {
      this.effects.delete(effect)
      originalDestroy()
    }
    return effect
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    for (const effect of Array.from(this.effects)) effect.destroy()
    this.effects.clear()
    this.ctx.scope.dispose()
    this.ctx.arbiter.releaseAll()
  }
}

export function createKinetic(options: KineticOptions = {}): Kinetic {
  return new Kinetic(options)
}

export default createKinetic
