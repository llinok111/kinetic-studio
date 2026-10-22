import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EngineContext } from '../src/core/context'
import { GestureRecognizer } from '../src/effects/gestures'
import { pointerEvent, stubCaps } from './helpers'

function down(el: HTMLElement, x: number, y: number, t: number, id = 1) {
  el.dispatchEvent(pointerEvent('pointerdown', { x, y, t, id, buttons: 1 }))
}
function up(el: HTMLElement, x: number, y: number, t: number, id = 1) {
  el.dispatchEvent(pointerEvent('pointerup', { x, y, t, id, buttons: 0 }))
}
function move(el: HTMLElement, x: number, y: number, t: number, id = 1) {
  el.dispatchEvent(pointerEvent('pointermove', { x, y, t, id, buttons: 1 }))
}

describe('GestureRecognizer', () => {
  let el: HTMLDivElement
  let ctx: EngineContext

  beforeEach(() => {
    stubCaps({ hover: true })
    ctx = new EngineContext({ motion: 'full' })
    el = document.createElement('div')
    document.body.appendChild(el)
  })

  afterEach(() => {
    el.remove()
    ctx.scope.dispose()
    vi.useRealTimers()
  })

  it('fires a tap', () => {
    const tap = vi.fn()
    const g = new GestureRecognizer(el, { tap }, ctx)
    down(el, 10, 10, 0)
    up(el, 12, 11, 80)
    expect(tap).toHaveBeenCalledTimes(1)
    expect(tap.mock.calls[0][0]).toMatchObject({ x: 12, y: 11 })
    g.destroy()
  })

  it('does not fire a tap when the pointer travelled too far', () => {
    const tap = vi.fn()
    const g = new GestureRecognizer(el, { tap }, ctx)
    down(el, 10, 10, 0)
    up(el, 90, 10, 80)
    expect(tap).not.toHaveBeenCalled()
    g.destroy()
  })

  it('does not fire a tap when the press was too long', () => {
    const tap = vi.fn()
    const g = new GestureRecognizer(el, { tap }, ctx)
    down(el, 10, 10, 0)
    up(el, 10, 10, 900)
    expect(tap).not.toHaveBeenCalled()
    g.destroy()
  })

  it('promotes a second tap to doubleTap and withholds the single tap', () => {
    vi.useFakeTimers()
    const tap = vi.fn()
    const doubleTap = vi.fn()
    const g = new GestureRecognizer(el, { tap, doubleTap, doubleTapWindow: 300 }, ctx)
    down(el, 10, 10, 0)
    up(el, 10, 10, 60)
    down(el, 12, 11, 180)
    up(el, 12, 11, 230)
    expect(doubleTap).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(400)
    expect(tap).not.toHaveBeenCalled()
    g.destroy()
  })

  it('fires the single tap once the double-tap window expires', () => {
    vi.useFakeTimers()
    const tap = vi.fn()
    const doubleTap = vi.fn()
    const g = new GestureRecognizer(el, { tap, doubleTap, doubleTapWindow: 300 }, ctx)
    down(el, 10, 10, 0)
    up(el, 10, 10, 60)
    vi.advanceTimersByTime(320)
    expect(tap).toHaveBeenCalledTimes(1)
    expect(doubleTap).not.toHaveBeenCalled()
    g.destroy()
  })

  it('fires a long press and cancels it when the finger moves', () => {
    vi.useFakeTimers()
    const longPress = vi.fn()
    const g = new GestureRecognizer(el, { longPress, longPressDuration: 500 }, ctx)

    down(el, 10, 10, 0)
    vi.advanceTimersByTime(520)
    expect(longPress).toHaveBeenCalledTimes(1)

    longPress.mockClear()
    down(el, 10, 10, 1000)
    move(el, 40, 10, 1100)
    vi.advanceTimersByTime(600)
    expect(longPress).not.toHaveBeenCalled()
    g.destroy()
  })

  it('reports swipe direction, distance and velocity', () => {
    const swipe = vi.fn()
    const g = new GestureRecognizer(el, { swipe }, ctx)
    down(el, 0, 0, 0)
    up(el, 120, 4, 60)
    expect(swipe).toHaveBeenCalledTimes(1)
    expect(swipe.mock.calls[0][0]).toMatchObject({ direction: 'right', distance: 120 })
    expect(swipe.mock.calls[0][0].velocity).toBeGreaterThan(300)
    g.destroy()
  })

  it('maps vertical swipes to up/down', () => {
    const swipe = vi.fn()
    const g = new GestureRecognizer(el, { swipe }, ctx)
    down(el, 0, 200, 0)
    up(el, 2, 60, 50)
    expect(swipe.mock.calls[0][0].direction).toBe('up')
    g.destroy()
  })

  it('treats pointercancel as "no gesture"', () => {
    const tap = vi.fn()
    const g = new GestureRecognizer(el, { tap }, ctx)
    down(el, 10, 10, 0)
    el.dispatchEvent(pointerEvent('pointercancel', { x: 10, y: 10, t: 40, buttons: 0 }))
    expect(tap).not.toHaveBeenCalled()
    expect(g.phase).toBe('idle')
    g.destroy()
  })

  it('tracks pinch scale from two pointers', () => {
    const pinch = vi.fn()
    const g = new GestureRecognizer(el, { pinch, capturePinch: true }, ctx)
    down(el, 0, 0, 0, 1)
    down(el, 100, 0, 10, 2)
    // Distance doubles from 100 to 200.
    move(el, -50, 0, 20, 1)
    move(el, 150, 0, 20, 2)
    expect(pinch).toHaveBeenCalled()
    expect(pinch.mock.calls.at(-1)![0].scale).toBeCloseTo(2, 1)
    g.destroy()
  })

  it('removes every listener on destroy', () => {
    const tap = vi.fn()
    const g = new GestureRecognizer(el, { tap }, ctx)
    g.destroy()
    down(el, 10, 10, 0)
    up(el, 10, 10, 50)
    expect(tap).not.toHaveBeenCalled()
  })

  it('cancels pending timers on destroy', () => {
    vi.useFakeTimers()
    const longPress = vi.fn()
    const g = new GestureRecognizer(el, { longPress, longPressDuration: 400 }, ctx)
    down(el, 10, 10, 0)
    g.destroy()
    vi.advanceTimersByTime(800)
    expect(longPress).not.toHaveBeenCalled()
  })
})
