import { describe, expect, it } from 'vitest'
import {
  Decay,
  SPRING_PRESETS,
  Spring,
  clampMomentum,
  momentumDistance,
  rubberbandPosition
} from '../src/core/spring'

describe('Spring', () => {
  it('converges to the target', () => {
    const spring = new Spring(0, SPRING_PRESETS.balanced)
    spring.setTarget(100)
    for (let i = 0; i < 600; i++) spring.step(1 / 60)
    expect(spring.value).toBeCloseTo(100, 1)
    expect(spring.settled).toBe(true)
  })

  it('is stable at 4 fps', () => {
    // The regression this guards: an Euler integrator with dt = 0.25 s and
    // k = 170 diverges to Infinity within three frames.
    const spring = new Spring(0, SPRING_PRESETS.balanced)
    spring.setTarget(100)
    for (let i = 0; i < 40; i++) {
      spring.step(0.25)
      expect(Number.isFinite(spring.value)).toBe(true)
    }
    expect(spring.value).toBeCloseTo(100, 0)
  })

  it('produces the same landing point at 30 fps and 120 fps', () => {
    const slow = new Spring(0, SPRING_PRESETS.balanced)
    const fast = new Spring(0, SPRING_PRESETS.balanced)
    slow.setTarget(200)
    fast.setTarget(200)
    for (let t = 0; t < 1.2; t += 1 / 30) slow.step(1 / 30)
    for (let t = 0; t < 1.2; t += 1 / 120) fast.step(1 / 120)
    expect(Math.abs(slow.value - fast.value)).toBeLessThan(1.5)
  })

  it('jump teleports and clears velocity', () => {
    const spring = new Spring(0)
    spring.impulse(500)
    spring.jump(42)
    expect(spring.value).toBe(42)
    expect(spring.velocity).toBe(0)
    expect(spring.target).toBe(42)
  })

  it('never lets a non-finite value reach the caller', () => {
    const spring = new Spring(0, { stiffness: 1e9, damping: 0 })
    spring.setTarget(10)
    spring.step(0.25)
    expect(Number.isFinite(spring.value)).toBe(true)
  })

  it('ignores a zero or negative dt', () => {
    const spring = new Spring(3)
    expect(spring.step(0)).toBe(3)
    expect(spring.step(-1)).toBe(3)
  })
})

describe('Decay', () => {
  it('travels the projected distance then stops', () => {
    const decay = new Decay(1200, 6)
    let travelled = 0
    for (let i = 0; i < 2000 && !decay.done; i++) travelled += decay.step(1 / 60)
    expect(travelled).toBeCloseTo(momentumDistance(1200, 6), 0)
  })

  it('lands on the same point at different frame rates', () => {
    const a = new Decay(900, 5)
    const b = new Decay(900, 5)
    let da = 0
    let db = 0
    for (let i = 0; i < 1000 && !a.done; i++) da += a.step(1 / 30)
    for (let i = 0; i < 4000 && !b.done; i++) db += b.step(1 / 120)
    expect(Math.abs(da - db)).toBeLessThan(3)
  })

  it('reports done below the velocity floor', () => {
    const decay = new Decay(1, 6)
    expect(decay.done).toBe(true)
    expect(decay.step(1 / 60)).toBe(0)
  })
})

describe('clampMomentum', () => {
  it('leaves an in-bounds projection untouched', () => {
    const result = clampMomentum(0, 100, -1000, 1000, 5)
    expect(result.velocity).toBe(100)
    expect(result.hitsEdge).toBe(false)
  })

  it('flags a projection that would cross the wall', () => {
    const result = clampMomentum(0, 20000, 0, 100, 5)
    expect(result.hitsEdge).toBe(true)
    expect(result.velocity).toBe(20000)
  })

  it('keeps impact speed meaningful: a hard fling reaches the wall sooner', () => {
    // This is the property the naive "rescale the velocity" implementation
    // destroys: it collapses every launch speed onto the same residual energy.
    const framesToWall = (v0: number) => {
      const decay = new Decay(v0, 5)
      let position = 0
      let frames = 0
      while (frames < 600) {
        position += decay.step(1 / 60)
        frames++
        if (position >= 100) return frames
      }
      return Infinity
    }
    const hard = framesToWall(20000)
    const soft = framesToWall(600)
    expect(hard).toBeLessThan(soft)
    expect(soft).toBeLessThan(Infinity)
  })
})

describe('rubberbandPosition', () => {
  it('passes through inside the bounds', () => {
    expect(rubberbandPosition(50, 0, 100)).toBe(50)
  })

  it('compresses overshoot but never reverses direction', () => {
    const past = rubberbandPosition(200, 0, 100, 0.15)
    expect(past).toBeGreaterThan(100)
    expect(past).toBeLessThan(200)
  })

  it('compresses harder with a smaller constant', () => {
    const soft = rubberbandPosition(200, 0, 100, 0.4)
    const stiff = rubberbandPosition(200, 0, 100, 0.05)
    expect(soft).toBeGreaterThan(stiff)
    expect(stiff).toBeGreaterThan(100)
  })

  it('clamps hard when the constant is zero', () => {
    expect(rubberbandPosition(200, 0, 100, 0)).toBe(100)
  })

  it('matches the upstream curve exactly', async () => {
    const { rubberbandIfOutOfBounds } = await import('../src/upstream')
    for (const constant of [0.05, 0.15, 0.3, 0.55]) {
      for (const position of [-80, -10, 0, 50, 100, 130, 400]) {
        expect(rubberbandPosition(position, 0, 100, constant)).toBeCloseTo(
          rubberbandIfOutOfBounds(position, 0, 100, constant),
          10
        )
      }
    }
  })
})
