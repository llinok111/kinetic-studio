import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameLoop } from '../src/core/frame-loop'
import { EngineContext } from '../src/core/context'
import { Magnetic } from '../src/effects/magnetic'
import { pointerEvent, rect, stubCaps } from './helpers'

function style(el: HTMLElement): string {
  return el.style.transform || el.style.translate
}

function step(n = 1): void {
  frameLoop.stop()
  let t = 2000
  for (let i = 0; i < n; i++) {
    t += 16
    frameLoop.step(t)
  }
}

describe('Magnetic', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    el = document.createElement('div')
    document.body.appendChild(el)
    // Rest rect: 100×100 at the origin, so the centre is (50, 50).
    rect(el, 0, 0, 100, 100)
  })

  afterEach(() => {
    el.remove()
    frameLoop.stop()
    vi.unstubAllGlobals()
  })

  it('pulls toward a pointer inside the radius', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    window.dispatchEvent(pointerEvent('pointermove', { x: 90, y: 50, t: 10, buttons: 0 }))
    expect(mag.phase).toBe('hover')
    expect(el.getAttribute('data-kinetic-magnetic')).toBe('engaged')
    step(6)
    expect(style(el)).toContain('translate3d')
    // Pulled toward the pointer, i.e. positive x.
    expect(Number(style(el).match(/-?[\d.]+/)?.[0])).toBeGreaterThan(0)
    mag.destroy()
  })

  it('ignores a pointer outside the radius', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    window.dispatchEvent(pointerEvent('pointermove', { x: 900, y: 900, t: 10, buttons: 0 }))
    expect(mag.phase).toBe('idle')
    expect(style(el)).toBe('')
    mag.destroy()
  })

  it('does not fight a held button', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    window.dispatchEvent(pointerEvent('pointermove', { x: 55, y: 55, t: 10, buttons: 1 }))
    expect(mag.phase).toBe('idle')
    mag.destroy()
  })

  it('never engages when motion is reduced, but leaves an affordance', () => {
    stubCaps({ hover: true, reduce: true })
    const ctx = new EngineContext({ motion: 'auto' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    expect(el.getAttribute('data-kinetic-magnetic')).toBe('reduced')
    window.dispatchEvent(pointerEvent('pointermove', { x: 60, y: 60, t: 10, buttons: 0 }))
    step(4)
    expect(style(el)).toBe('')
    expect(mag.phase).toBe('idle')
    mag.destroy()
  })

  it('skips touch-only devices', () => {
    stubCaps({ hover: false, coarse: true })
    const ctx = new EngineContext({ motion: 'full' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    window.dispatchEvent(pointerEvent('pointermove', { x: 60, y: 60, t: 10, buttons: 0 }))
    expect(mag.phase).toBe('idle')
    mag.destroy()
  })

  it('releases when the pointer leaves the window', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    window.dispatchEvent(pointerEvent('pointermove', { x: 80, y: 50, t: 10, buttons: 0 }))
    expect(mag.phase).toBe('hover')
    const out = pointerEvent('pointerout', { x: 400, y: 400, t: 20, buttons: 0 })
    Object.defineProperty(out, 'relatedTarget', { value: null, configurable: true })
    window.dispatchEvent(out)
    expect(mag.phase).toBe('idle')
    expect(el.hasAttribute('data-kinetic-magnetic')).toBe(false)
    mag.destroy()
  })

  it('can be disabled without being destroyed', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    mag.setDisabled(true)
    window.dispatchEvent(pointerEvent('pointermove', { x: 60, y: 60, t: 10, buttons: 0 }))
    expect(mag.phase).toBe('idle')
    mag.destroy()
  })

  it('restores inline styles on destroy', () => {
    stubCaps({ hover: true })
    el.style.transform = 'scale(1.02)'
    const ctx = new EngineContext({ motion: 'full' })
    const mag = new Magnetic(el, {}, ctx)
    mag.measure()
    window.dispatchEvent(pointerEvent('pointermove', { x: 70, y: 50, t: 10, buttons: 0 }))
    step(6)
    expect(style(el)).toContain('scale(1.02)')
    mag.destroy()
    expect(el.style.transform).toBe('scale(1.02)')
    expect(el.style.willChange).toBe('')
  })
})
