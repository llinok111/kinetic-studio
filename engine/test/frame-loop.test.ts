import { describe, expect, it, vi } from 'vitest'
import { FrameLoop } from '../src/core/frame-loop'

function makeLoop() {
  const loop = new FrameLoop()
  return loop
}

describe('FrameLoop', () => {
  it('clamps a huge delta instead of teleporting simulators', () => {
    const loop = makeLoop()
    const dt: number[] = []
    loop.add((info) => dt.push(info.dt))
    loop.stop()
    loop.step(0)
    loop.step(16.7)
    // 3 seconds later (tab was hidden): a naive integrator would receive 3000 ms.
    loop.step(3016.7)
    expect(dt[1]).toBeCloseTo(16.7, 1)
    expect(dt[2]).toBe(64)
  })

  it('measures a smoothed frame rate', () => {
    const loop = makeLoop()
    loop.add(() => {})
    loop.stop()
    let t = 0
    for (let i = 0; i < 120; i++) {
      t += 33.34
      loop.step(t)
    }
    expect(loop.fps).toBeGreaterThan(26)
    expect(loop.fps).toBeLessThan(34)
  })

  it('downgrades quality after sustained slow frames and needs many fast frames to recover', () => {
    const loop = makeLoop()
    const changes: string[] = []
    loop.onQualityChange((tier) => changes.push(tier))
    loop.add(() => {})
    loop.stop()
    let t = 0
    const slowFrame = () => {
      t += 40
      loop.step(t)
    }
    const fastFrame = () => {
      t += 8
      loop.step(t)
    }

    expect(loop.tier).toBe('high')
    for (let i = 0; i < 20; i++) slowFrame()
    expect(loop.tier).toBe('mid')
    for (let i = 0; i < 40; i++) slowFrame()
    expect(loop.tier).toBe('low')
    expect(changes).toEqual(['mid', 'low'])

    // Hysteresis: 40 fast frames is not enough to climb back.
    for (let i = 0; i < 40; i++) fastFrame()
    expect(loop.tier).toBe('low')
    for (let i = 0; i < 120; i++) fastFrame()
    expect(loop.tier).toBe('mid')
  })

  it('honours a forced tier and stops adapting', () => {
    const loop = makeLoop()
    loop.add(() => {})
    loop.stop()
    loop.forceTier('low')
    let t = 0
    for (let i = 0; i < 200; i++) {
      t += 8
      loop.step(t)
    }
    expect(loop.tier).toBe('low')
    loop.forceTier(null)
    for (let i = 0; i < 200; i++) {
      t += 8
      loop.step(t)
    }
    expect(loop.tier).toBe('high')
  })

  it('isolates a throwing subscriber', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loop = makeLoop()
    const ok = vi.fn()
    loop.add(() => {
      throw new Error('boom')
    })
    loop.add(ok)
    loop.stop()
    expect(() => loop.step(16)).not.toThrow()
    expect(ok).toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it('stops when the last subscriber leaves', () => {
    const loop = makeLoop()
    const off = loop.add(() => {})
    expect(loop.size).toBe(1)
    off()
    expect(loop.size).toBe(0)
    expect(loop.running).toBe(false)
  })

  it('runs higher-priority subscribers first', () => {
    const loop = makeLoop()
    const order: string[] = []
    loop.add(() => order.push('low'), 50)
    loop.add(() => order.push('high'), 1)
    loop.stop()
    loop.step(16)
    expect(order).toEqual(['high', 'low'])
  })

  it('increments the frame counter monotonically', () => {
    const loop = makeLoop()
    loop.add(() => {})
    loop.stop()
    const frames: number[] = []
    loop.step(16)
    frames.push(loop.frame)
    loop.step(32)
    frames.push(loop.frame)
    expect(frames[1]).toBe(frames[0] + 1)
  })
})
