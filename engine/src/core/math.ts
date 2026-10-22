/**
 * Small, dependency-free numeric helpers.
 *
 * Deliberately duplicated from the upstream maths module in spirit but not in
 * import path: only `rubberbandIfOutOfBounds` is reused verbatim from upstream
 * (see `upstream.ts`), because matching its exact curve is what keeps existing
 * `@use-gesture` drags visually identical after the engine is layered on top.
 */

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Frame-rate independent exponential smoothing. `smoothing` is 0..1 per second. */
export const damp = (a: number, b: number, smoothing: number, dtSec: number): number =>
  lerp(a, b, 1 - Math.pow(1 - clamp(smoothing, 0, 0.9999), dtSec * 60))

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Quadratic ease-out — used for magnetic falloff. */
export const easeOutQuad = (t: number): number => 1 - (1 - clamp(t, 0, 1)) ** 2

export const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay)

/**
 * Exponential velocity decay.
 *
 * `friction` is expressed in "e-folds per second": after 1/friction seconds the
 * velocity is 37% of its initial value. This is frame-rate independent, which
 * the classic `v *= 0.95` per frame is not.
 */
export const decayStep = (velocity: number, friction: number, dtSec: number): number =>
  velocity * Math.exp(-Math.max(0, friction) * dtSec)

/**
 * Total travel of a decaying velocity, integrated to infinity: v0 / friction.
 * This is the number that makes inertia land where the user expects instead of
 * being tuned by trial and error against one specific frame rate.
 */
export const projectDistance = (velocity: number, friction: number): number =>
  friction <= 0 ? 0 : velocity / friction

/**
 * Convert a per-millisecond velocity (the unit `@use-gesture` exposes in
 * `state.velocity`) to per-second. Public options are always per-second so that
 * integrators never have to guess.
 */
export const perMsToPerSec = (v: number): number => v * 1000

/** Snap `value` to the closest point in `points` when within `threshold`. */
export const nearest = (value: number, points: readonly number[]): number => {
  let best = value
  let bestD = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i] - value)
    if (d < bestD) {
      bestD = d
      best = points[i]
    }
  }
  return best
}

/**
 * Normalise a `WheelEvent` delta into pixels.
 *
 * `deltaMode` is 0 = pixel, 1 = line, 2 = page. Ignoring it is the reason wheel
 * scrolling feels 16× too fast in Firefox and near-zero in some Linux builds.
 */
export const normalizeWheel = (
  delta: number,
  deltaMode: number,
  viewport: number,
  lineHeight = 16
): number => {
  if (deltaMode === 1) return delta * lineHeight
  if (deltaMode === 2) return delta * viewport
  return delta
}

/** Sign with 0 preserved (Math.sign keeps -0, which breaks equality checks). */
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0)
