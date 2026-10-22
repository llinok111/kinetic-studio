import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameLoop } from '../src/core/frame-loop'
import { EngineContext } from '../src/core/context'
import { Trail } from '../src/effects/trail'
import { pointerEvent, rect, stubCaps } from './helpers'

const recorder = () => (globalThis as any).__canvasRecorder as { calls: string[]; reset(): void }

function step(n = 1): void {
  frameLoop.stop()
  let t = 4000
  for (let i = 0; i < n; i++) {
    t += 16
    frameLoop.step(t)
  }
}

describe('Trail', () => {
  let canvas: HTMLCanvasElement

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    rect(canvas, 0, 0, 800, 600)
  })

  afterEach(() => {
    canvas.remove()
    frameLoop.stop()
    vi.unstubAllGlobals()
  })

  it('sizes the backing store in device pixels', () => {
    stubCaps({ hover: true })
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const ctx = new EngineContext({ motion: 'full' })
    const trail = new Trail(canvas, {}, ctx)
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(1200)
    trail.destroy()
  })

  it('draws a tail after pointer movement', () => {
    stubCaps({ hover: true })
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
    const ctx = new EngineContext({ motion: 'full' })
    const trail = new Trail(canvas, {}, ctx)
    recorder().reset()
    // Timestamps must sit on the same clock as the frame loop: the trail drops its
    // buffer when the pointer has been idle for 3× `fade`, and a stale timestamp
    // would look like minutes of inactivity.
    window.dispatchEvent(pointerEvent('pointermove', { x: 10, y: 10, t: 3990, buttons: 0 }))
    window.dispatchEvent(pointerEvent('pointermove', { x: 40, y: 30, t: 4000, buttons: 0 }))
    window.dispatchEvent(pointerEvent('pointermove', { x: 80, y: 60, t: 4008, buttons: 0 }))
    step(1)
    expect(recorder().calls).toContain('stroke(0)')
    expect(recorder().calls).toContain('clearRect(4)')
    trail.destroy()
  })

  it('ignores movement while a button is held', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const trail = new Trail(canvas, {}, ctx)
    window.dispatchEvent(pointerEvent('pointermove', { x: 10, y: 10, t: 0, buttons: 1 }))
    recorder().reset()
    step(1)
    const strokes = recorder().calls.filter((c) => c.startsWith('stroke'))
    expect(strokes).toHaveLength(0)
    trail.destroy()
  })

  it('is disabled entirely under reduced motion', () => {
    stubCaps({ hover: true, reduce: true })
    const ctx = new EngineContext({ motion: 'auto' })
    const trail = new Trail(canvas, {}, ctx)
    expect(trail.enabled).toBe(false)
    recorder().reset()
    window.dispatchEvent(pointerEvent('pointermove', { x: 10, y: 10, t: 0, buttons: 0 }))
    step(1)
    const strokes = recorder().calls.filter((c) => c.startsWith('stroke'))
    expect(strokes).toHaveLength(0)
    trail.destroy()
  })

  it('is disabled on touch-only devices', () => {
    stubCaps({ hover: false, coarse: true })
    const ctx = new EngineContext({ motion: 'full' })
    const trail = new Trail(canvas, {}, ctx)
    expect(trail.enabled).toBe(false)
    trail.destroy()
  })

  it('drops the buffer when the pointer leaves the window', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const trail = new Trail(canvas, {}, ctx)
    window.dispatchEvent(pointerEvent('pointermove', { x: 10, y: 10, t: 0, buttons: 0 }))
    window.dispatchEvent(pointerEvent('pointermove', { x: 30, y: 30, t: 16, buttons: 0 }))
    const out = pointerEvent('pointerout', { x: 900, y: 900, t: 32, buttons: 0 })
    Object.defineProperty(out, 'relatedTarget', { value: null, configurable: true })
    window.dispatchEvent(out)
    recorder().reset()
    step(1)
    const strokes = recorder().calls.filter((c) => c.startsWith('stroke'))
    expect(strokes).toHaveLength(0)
    trail.destroy()
  })
})
