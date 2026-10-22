import type { Capabilities, KineticOptions } from '../types'
import { readCapabilities, watchCapabilities } from './capability'
import { Disposer } from './disposer'
import { frameLoop, type FrameLoop } from './frame-loop'
import { MotionController } from './motion'
import { Arbiter } from '../interaction/arbiter'

/**
 * Shared kernel handed to every effect.
 *
 * Effects never create their own clock, capability snapshot or motion
 * controller: two effects disagreeing about whether motion is reduced is a bug
 * that only shows up on a user's machine, never in development.
 */
export class EngineContext {
  readonly caps: Capabilities
  readonly motion: MotionController
  readonly loop: FrameLoop
  readonly arbiter: Arbiter
  readonly scope = new Disposer('engine')
  readonly debug: boolean
  private capsListeners = new Set<(caps: Capabilities) => void>()

  constructor(options: KineticOptions = {}) {
    this.debug = options.debug === true
    this.caps = readCapabilities()
    this.motion = new MotionController(options.motion ?? 'auto')
    this.loop = frameLoop
    this.arbiter = new Arbiter(Math.max(2, this.caps.maxTouchPoints || 2))

    if (options.quality && options.quality !== 'auto') this.loop.forceTier(options.quality)

    this.scope.onDispose(() => this.motion.destroy())

    // Pointer type changes without a reload on hybrid devices (tablet with a
    // trackpad, Surface, iPad with Magic Keyboard). Effects must re-evaluate.
    this.scope.onDispose(
      watchCapabilities((caps) => {
        Object.assign(this.caps, caps)
        for (const fn of Array.from(this.capsListeners)) {
          try {
            fn(caps)
          } catch {
            /* a listener must not break the rest */
          }
        }
      })
    )
  }

  get reduced(): boolean {
    return this.motion.policy.reduced
  }

  /** True when the primary input can hover — gates every pointer-following effect. */
  get canHover(): boolean {
    return this.caps.hover && !this.caps.coarsePointer
  }

  onCapsChange(fn: (caps: Capabilities) => void): () => void {
    this.capsListeners.add(fn)
    return () => this.capsListeners.delete(fn)
  }
}
