import { afterEach, describe, expect, it, vi } from 'vitest'
import { MotionController } from '../src/core/motion'
import { QUERIES } from '../src/core/capability'

const original = window.matchMedia

afterEach(() => {
  window.matchMedia = original
})

function setSystemReduced(reduced: boolean) {
  let handler: ((e: { matches: boolean }) => void) | null = null
  window.matchMedia = ((query: string) => ({
    matches: query === QUERIES.reduce ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      handler = cb
    },
    removeEventListener: vi.fn(),
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
  return {
    flip(next: boolean) {
      handler?.({ matches: next })
    }
  }
}

describe('MotionController', () => {
  it('follows the OS setting in auto mode', () => {
    setSystemReduced(true)
    const motion = new MotionController('auto')
    expect(motion.policy.reduced).toBe(true)
    expect(motion.policy.allowInertia).toBe(false)
    expect(motion.policy.allowMagnetism).toBe(false)
    expect(motion.policy.allowTrail).toBe(false)
    expect(motion.duration(320)).toBe(0)
    motion.destroy()
  })

  it('keeps every motion class in full mode', () => {
    setSystemReduced(false)
    const motion = new MotionController('auto')
    expect(motion.policy.reduced).toBe(false)
    expect(motion.policy.allowInertia).toBe(true)
    expect(motion.duration(320)).toBe(320)
    motion.destroy()
  })

  it('lets an explicit preference override the OS', () => {
    setSystemReduced(true)
    const motion = new MotionController('full')
    expect(motion.policy.reduced).toBe(false)
    motion.set('reduce')
    expect(motion.policy.reduced).toBe(true)
    motion.destroy()
  })

  it('reacts to a live OS change', () => {
    const system = setSystemReduced(false)
    const motion = new MotionController('auto')
    const seen: boolean[] = []
    motion.subscribe((p) => seen.push(p.reduced))
    system.flip(true)
    expect(motion.policy.reduced).toBe(true)
    expect(seen).toEqual([true])
    motion.destroy()
  })

  it('keeps direct manipulation available in reduced mode', () => {
    // The policy has to distinguish "moves with my finger" from "moves on its
    // own"; only the latter is removed.
    setSystemReduced(true)
    const motion = new MotionController('auto')
    expect(motion.policy.snapImmediately).toBe(true)
    expect(motion.policy.allowOverscrollRelease).toBe(false)
    motion.destroy()
  })
})
