import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameLoop } from '../src/core/frame-loop'
import { resetCounters, liveListenerCount } from '../src/core/disposer'
import { EngineContext } from '../src/core/context'
import { ElasticDrag } from '../src/effects/elastic-drag'
import { dragHold, dragSequence, installListenerProbe, rect, stubCaps } from './helpers'

function makeContext(reduce = false) {
  stubCaps({ hover: true, reduce })
  const ctx = new EngineContext({ motion: reduce ? 'reduce' : 'full' })
  return ctx
}

function transformOf(el: HTMLElement): string {
  return el.style.transform || el.style.translate || ''
}

function px(el: HTMLElement, axis: 'x' | 'y'): number {
  const source = el.style.transform || el.style.translate
  const match = source.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/) || source.match(/(-?[\d.]+)px\s+(-?[\d.]+)px/)
  if (!match) return 0
  return Number(axis === 'x' ? match[1] : match[2])
}

function stepFrames(n: number): void {
  frameLoop.stop()
  let t = 5000
  for (let i = 0; i < n; i++) {
    t += 16
    frameLoop.step(t)
  }
}

describe('ElasticDrag', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    resetCounters()
    el = document.createElement('div')
    document.body.appendChild(el)
    rect(el, 0, 0, 100, 100)
  })

  afterEach(() => {
    el.remove()
    frameLoop.stop()
    vi.unstubAllGlobals()
  })

  it('starts idle', () => {
    const ctx = makeContext()
    const drag = new ElasticDrag(el, {}, ctx)
    expect(drag.phase).toBe('idle')
    drag.destroy()
    ctx.scope.dispose()
  })

  it('follows the pointer one-to-one while dragging', () => {
    const ctx = makeContext()
    const drag = new ElasticDrag(el, {}, ctx)
    dragHold(el, [
      { x: 0, y: 0, t: 0 },
      { x: 60, y: 40, t: 16 }
    ])
    expect(drag.phase).toBe('drag')
    // `threshold: 3` is subtracted from the first movement before anything moves
    // (upstream semantics), so 60 px of pointer travel yields 57 px of motion.
    // That is the documented cost of not firing a drag on a 1 px jitter.
    expect(px(el, 'x')).toBeCloseTo(57, 0)
    expect(px(el, 'y')).toBeCloseTo(37, 0)
    drag.destroy()
  })

  it('compresses the overshoot past the bounds instead of stopping dead', () => {
    const ctx = makeContext()
    const drag = new ElasticDrag(el, { bounds: { x: { min: -20, max: 20 } } }, ctx)
    dragHold(el, [
      { x: 0, y: 0, t: 0 },
      { x: 120, y: 0, t: 16 }
    ])
    const x = px(el, 'x')
    expect(x).toBeGreaterThan(20)
    expect(x).toBeLessThan(120)
    drag.destroy()
  })

  it('enters inertia on a fast release and stops inside the bounds', () => {
    const ctx = makeContext()
    const drag = new ElasticDrag(el, { bounds: { x: { min: -400, max: 400 } }, friction: 6 }, ctx)
    // Release at 87 px (90 − threshold), still inside bounds, moving ~3 px/ms.
    dragSequence(el, [
      { x: 0, y: 0, t: 0 },
      { x: 40, y: 0, t: 16 },
      { x: 90, y: 0, t: 32 }
    ])
    expect(drag.phase).toBe('inertia')
    stepFrames(240)
    expect(drag.phase).toBe('idle')
    const x = px(el, 'x')
    expect(x).toBeLessThanOrEqual(400)
    expect(x).toBe(400)
    drag.destroy()
  })

  it('lands immediately when motion is reduced', () => {
    const ctx = makeContext(true)
    const drag = new ElasticDrag(el, { bounds: { x: { min: -50, max: 50 } } }, ctx)
    dragSequence(el, [
      { x: 0, y: 0, t: 0 },
      { x: 40, y: 0, t: 16 },
      { x: 200, y: 0, t: 32 }
    ])
    // No inertia phase at all: the final position is reached on the same frame.
    expect(drag.phase).toBe('idle')
    expect(px(el, 'x')).toBeCloseTo(50, 0)
    drag.destroy()
  })

  it('snaps to the nearest target on release', () => {
    const ctx = makeContext()
    const drag = new ElasticDrag(el, { snap: { x: [0, 100, 200] }, snapThreshold: 80 }, ctx)
    dragSequence(el, [
      { x: 0, y: 0, t: 0 },
      { x: 130, y: 0, t: 16 }
    ])
    stepFrames(180)
    expect(px(el, 'x')).toBeCloseTo(100, 0)
    drag.destroy()
  })

  it('aborts when the element is removed mid-drag', async () => {
    const ctx = makeContext()
    const onCancel = vi.fn()
    const drag = new ElasticDrag(el, { onCancel }, ctx)
    dragHold(el, [
      { x: 0, y: 0, t: 0 },
      { x: 30, y: 0, t: 16 }
    ])
    expect(drag.phase).toBe('drag')
    el.remove()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onCancel).toHaveBeenCalledWith('detached')
    expect(drag.phase).toBe('idle')
    drag.destroy()
  })

  it('releases every listener it bound, including upstream ones', () => {
    const probe = installListenerProbe()
    try {
      const baseline = probe.live
      const ctx = makeContext()
      const drag = new ElasticDrag(el, {}, ctx)
      expect(probe.live).toBeGreaterThan(baseline)
      drag.destroy()
      ctx.scope.dispose()
      expect(probe.live).toBe(baseline)
      expect(liveListenerCount()).toBe(0)
    } finally {
      probe.restore()
    }
  })

  it('clamps the current position when bounds shrink', () => {
    const ctx = makeContext()
    const drag = new ElasticDrag(el, { bounds: { x: { min: -300, max: 300 } } }, ctx)
    dragSequence(el, [
      { x: 0, y: 0, t: 0 },
      { x: 200, y: 0, t: 16 }
    ])
    expect(px(el, 'x')).toBeGreaterThan(150)
    drag.setBounds({ x: { min: -20, max: 20 } })
    expect(px(el, 'x')).toBe(20)
    drag.destroy()
  })

  it('animates a programmatic move', () => {
    const ctx = makeContext()
    const drag = new ElasticDrag(el, {}, ctx)
    drag.moveTo(120, 0, true)
    stepFrames(200)
    expect(px(el, 'x')).toBeCloseTo(120, 0)
    drag.destroy()
  })

  it('restores the author transform it never owned', () => {
    el.style.transform = 'rotate(3deg)'
    const ctx = makeContext()
    const drag = new ElasticDrag(el, {}, ctx)
    dragHold(el, [
      { x: 0, y: 0, t: 0 },
      { x: 30, y: 0, t: 16 }
    ])
    expect(transformOf(el)).toContain('rotate(3deg)')
    drag.destroy()
    expect(el.style.transform).toBe('rotate(3deg)')
  })
})
