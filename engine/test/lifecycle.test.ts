import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKinetic } from '../src/index'
import { frameLoop } from '../src/core/frame-loop'
import { installListenerProbe, rect, stubCaps } from './helpers'

/**
 * Lifecycle contract: whatever the engine adds to the DOM, it removes.
 *
 * This is the test that would have caught every real-world "my page gets slower
 * after a few minutes of navigation" report. It counts listeners through the
 * actual `addEventListener` / `removeEventListener` pair, so it includes the ones
 * upstream binds behind the engine's back.
 */
describe('lifecycle / leak contract', () => {
  let probe: ReturnType<typeof installListenerProbe>

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    stubCaps({ hover: true })
    probe = installListenerProbe()
  })

  afterEach(() => {
    frameLoop.stop()
    probe.restore()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('returns the listener count to baseline after a full mount/unmount', () => {
    const host = document.createElement('div')
    const card = document.createElement('button')
    const canvas = document.createElement('canvas')
    const scroller = document.createElement('div')
    const inner = document.createElement('div')
    document.body.append(host, card, canvas, scroller)
    scroller.appendChild(inner)
    rect(host, 0, 0, 120, 48)
    rect(card, 0, 60, 120, 48)

    const engine = createKinetic({ motion: 'full' })
    const mag = engine.magnetic(host, {})
    mag.measure()
    const drag = engine.elasticDrag(card, { bounds: { x: { min: -50, max: 50 } } })
    const trail = engine.trail(canvas, {})
    const scroll = engine.inertialScroll(scroller, inner, { mode: 'virtual' })
    const gestures = engine.gestures(host, { tap: () => {} })

    expect(probe.live).toBeGreaterThan(0)
    expect(engine.effectCount).toBe(5)

    engine.destroy()

    expect(engine.effectCount).toBe(0)
    expect(probe.live).toBe(0)
    // Individual effects are also individually destroyable without exploding.
    expect(() => drag.destroy()).not.toThrow()
    expect(() => trail.destroy()).not.toThrow()
    expect(() => scroll.destroy()).not.toThrow()
    expect(() => gestures.destroy()).not.toThrow()
  })

  it('does not accumulate listeners across 40 mount/unmount cycles', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    rect(el, 0, 0, 100, 100)

    // Warm-up: the shared frame loop binds its visibility listener once, on the
    // first start, and never again. Measuring before it exists would make the
    // first cycle look like a leak.
    createKinetic({ motion: 'full' }).destroy()

    const baseline = probe.live
    for (let i = 0; i < 40; i++) {
      const engine = createKinetic({ motion: 'full' })
      const drag = engine.elasticDrag(el, { bounds: { x: { min: -10, max: 10 } } })
      engine.magnetic(el, {})
      engine.gestures(el, { tap: () => {} })
      drag.moveTo(5, 0, false)
      engine.destroy()
    }
    expect(probe.live).toBe(baseline)
  })

  it('leaves no pending frame subscribers after destroy', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const engine = createKinetic({ motion: 'full' })
    const drag = engine.elasticDrag(el, {})
    drag.moveTo(10, 10, true)
    expect(frameLoop.size).toBe(1)
    engine.destroy()
    expect(frameLoop.size).toBe(0)
    expect(frameLoop.running).toBe(false)
  })

  it('creates an effect inside a destroyed engine without leaking it', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const engine = createKinetic({ motion: 'full' })
    engine.destroy()
    const before = probe.live
    engine.magnetic(el, {})
    expect(probe.live).toBe(before)
  })

  it('is safe to destroy twice', () => {
    const engine = createKinetic({ motion: 'full' })
    engine.destroy()
    expect(() => engine.destroy()).not.toThrow()
  })

  it('reports motion policy and capabilities', () => {
    const engine = createKinetic({ motion: 'reduce' })
    expect(engine.motionPolicy.reduced).toBe(true)
    expect(engine.capabilities.hover).toBe(true)
    engine.setMotion('full')
    expect(engine.motionPolicy.reduced).toBe(false)
    engine.destroy()
  })
})
