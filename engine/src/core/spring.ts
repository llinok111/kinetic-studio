import type { SpringConfig } from '../types'
import { clamp, decayStep } from './math'

/**
 * Physics primitives.
 *
 * Two decisions worth documenting:
 *
 * 1. **Sub-stepping.** A spring integrated with semi-implicit Euler is only
 *    stable while `dt * sqrt(k/m) < ~0.5`. On a 5 fps device `dt = 0.2 s` and a
 *    k = 170 spring has `dt * ω ≈ 2.6` — the value diverges to Infinity within
 *    three frames and the element flies off screen. Clamping `dt` is not enough
 *    (it changes the *speed* of the animation); sub-stepping the integrator into
 *    fixed 1/240 s slices keeps the same physical behaviour at any frame rate.
 *
 * 2. **Units.** Value and velocity are in px and px/s. `@use-gesture` reports
 *    velocity in px/ms; converting at the boundary (see `perMsToPerSec`) is the
 *    only place that conversion happens.
 */

const MAX_SUBSTEP = 1 / 240

export const SPRING_PRESETS = {
  /** Follows the pointer closely, no visible lag. */
  tight: { stiffness: 420, damping: 32, mass: 1 },
  /** The default: a little overshoot on release. */
  balanced: { stiffness: 170, damping: 20, mass: 1 },
  /** Loose, long settle — used for the elastic-drag return. */
  loose: { stiffness: 90, damping: 16, mass: 1 },
  /** Critically damped-ish, used for scroll snapping. */
  crisp: { stiffness: 260, damping: 30, mass: 1 }
} satisfies Record<string, Required<SpringConfig>>

export class Spring {
  value: number
  velocity: number
  target: number
  stiffness: number
  damping: number
  mass: number
  /** Guards against NaN propagating into a transform string. */
  private poisoned = false

  constructor(value = 0, config: SpringConfig = {}) {
    this.value = value
    this.target = value
    this.velocity = 0
    const preset = SPRING_PRESETS.balanced
    this.stiffness = config.stiffness ?? preset.stiffness
    this.damping = config.damping ?? preset.damping
    this.mass = config.mass ?? preset.mass
  }

  setTarget(target: number): void {
    this.target = target
  }

  /** Teleport: value and target move, velocity is zeroed. */
  jump(value: number): void {
    this.value = value
    this.target = value
    this.velocity = 0
    this.poisoned = false
  }

  /** Inject momentum (px/s) without moving the value. */
  impulse(velocity: number): void {
    this.velocity += velocity
  }

  get settled(): boolean {
    return Math.abs(this.target - this.value) < 0.05 && Math.abs(this.velocity) < 0.05
  }

  step(dtSec: number): number {
    if (!(dtSec > 0)) return this.value
    const total = Math.min(dtSec, 0.25)
    let remaining = total
    while (remaining > 0) {
      const h = Math.min(remaining, MAX_SUBSTEP)
      const accel = (-this.stiffness * (this.value - this.target) - this.damping * this.velocity) / this.mass
      this.velocity += accel * h
      this.value += this.velocity * h
      remaining -= h
    }
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      // Never let a numerical blow-up reach the DOM: freeze at the target.
      if (!this.poisoned) this.poisoned = true
      this.value = this.target
      this.velocity = 0
    }
    if (this.settled) {
      this.value = this.target
      this.velocity = 0
    }
    return this.value
  }
}

/**
 * Exponential decay with an analytic stop.
 *
 * `done` is computed from the projected remaining travel, not from a frame
 * counter, so the stopping point is identical at 30 fps and 120 fps.
 */
export class Decay {
  velocity: number
  friction: number
  private travelled = 0

  constructor(velocity: number, friction = 6) {
    this.velocity = velocity
    this.friction = Math.max(0.01, friction)
  }

  get done(): boolean {
    return Math.abs(this.velocity) < 2
  }

  step(dtSec: number): number {
    if (this.done) {
      this.velocity = 0
      return 0
    }
    const before = this.velocity
    this.velocity = decayStep(this.velocity, this.friction, dtSec)
    // Exact integral of the exponential over the step, so the displacement does
    // not depend on how the interval was sliced.
    const k = this.friction
    const delta = (before - this.velocity) / k
    this.travelled += delta
    return delta
  }

  get distance(): number {
    return this.travelled
  }
}

/** Total travel remaining if released now. */
export function momentumDistance(velocity: number, friction: number): number {
  return friction <= 0 ? 0 : velocity / friction
}

/**
 * Rubber band a position past its bounds.
 * Mirrors `@use-gesture`'s curve (see `upstream.ts`) so a draggable element does
 * not change its feel when it gains elasticity from this engine.
 */
export function rubberbandPosition(
  position: number,
  min: number,
  max: number,
  constant = 0.15
): number {
  if (constant === 0) return clamp(position, min, max)
  if (position < min) {
    const overshoot = min - position
    return min - (overshoot * (max - min) * constant) / (max - min + constant * overshoot)
  }
  if (position > max) {
    const overshoot = position - max
    return max + (overshoot * (max - min) * constant) / (max - min + constant * overshoot)
  }
  return position
}

/**
 * Clamp a projected landing point inside bounds.
 *
 * Deliberately returns the *original* velocity: an earlier version rescaled the
 * velocity so that the projected distance exactly matched the distance to the
 * wall. Algebraically that reduces to `v = friction × distance`, which is the
 * same number for every launch speed — a 20 000 px/s fling and a 600 px/s nudge
 * would hit the wall with identical residual energy. Leaving the velocity alone
 * and clamping the position per frame keeps the difference the user actually
 * perceives: a fast fling hits the wall in milliseconds, a slow one takes a third
 * of a second.
 */
export function clampMomentum(
  position: number,
  velocity: number,
  min: number,
  max: number,
  friction: number
): { position: number; velocity: number; hitsEdge: boolean } {
  const projected = position + momentumDistance(velocity, friction)
  return { position, velocity, hitsEdge: projected < min || projected > max }
}
