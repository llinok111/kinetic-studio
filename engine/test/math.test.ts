import { describe, expect, it } from 'vitest'
import {
  clamp,
  damp,
  decayStep,
  distance,
  nearest,
  normalizeWheel,
  perMsToPerSec,
  projectDistance,
  sign,
  smoothstep
} from '../src/core/math'

describe('math', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('smoothstep is monotonic and pinned at the edges', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 0)).toBe(0)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6)
    expect(smoothstep(0, 1, 1)).toBe(1)
    expect(smoothstep(0, 1, 2)).toBe(1)
    let previous = -1
    for (let i = 0; i <= 20; i++) {
      const v = smoothstep(0, 1, i / 20)
      expect(v).toBeGreaterThanOrEqual(previous)
      previous = v
    }
  })

  it('smoothstep handles a degenerate range without dividing by zero', () => {
    expect(smoothstep(2, 2, 1)).toBe(0)
    expect(smoothstep(2, 2, 3)).toBe(1)
  })

  it('damp converges toward the target and never overshoots', () => {
    let value = 0
    for (let i = 0; i < 120; i++) value = damp(value, 100, 0.2, 1 / 60)
    expect(value).toBeGreaterThan(95)
    expect(value).toBeLessThanOrEqual(100)
  })

  it('decayStep is frame-rate independent', () => {
    // One 100 ms step must lose the same energy as ten 10 ms steps.
    const single = decayStep(1000, 6, 0.1)
    let many = 1000
    for (let i = 0; i < 10; i++) many = decayStep(many, 6, 0.01)
    expect(single).toBeCloseTo(many, 6)
  })

  it('projectDistance matches the integral of the exponential decay', () => {
    let travelled = 0
    let v = 1000
    for (let i = 0; i < 4000; i++) {
      const before = v
      v = decayStep(v, 6, 0.001)
      travelled += (before - v) / 6
    }
    expect(travelled).toBeCloseTo(projectDistance(1000, 6), 2)
  })

  it('normalizes wheel deltaMode', () => {
    expect(normalizeWheel(3, 0, 800)).toBe(3)
    expect(normalizeWheel(3, 1, 800)).toBe(48)
    expect(normalizeWheel(1, 2, 800)).toBe(800)
  })

  it('nearest picks the closest candidate and falls back to the value', () => {
    expect(nearest(10, [0, 100, 200])).toBe(0)
    expect(nearest(120, [0, 100, 200])).toBe(100)
    expect(nearest(42, [])).toBe(42)
  })

  it('sign does not return negative zero', () => {
    expect(Object.is(sign(-0), 0)).toBe(true)
    expect(sign(-3)).toBe(-1)
    expect(sign(3)).toBe(1)
  })

  it('distance is euclidean', () => {
    expect(distance(0, 0, 3, 4)).toBe(5)
  })

  it('converts per-ms velocity to per-second', () => {
    // 0.5 px/ms is a 500 px/s fling, not a 0.5 px/s one.
    expect(perMsToPerSec(0.5)).toBe(500)
  })
})
