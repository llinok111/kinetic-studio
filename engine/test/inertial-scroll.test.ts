import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameLoop } from '../src/core/frame-loop'
import { EngineContext } from '../src/core/context'
import { InertialScroll } from '../src/effects/inertial-scroll'
import { rect, stubCaps } from './helpers'

function sizes(el: HTMLElement, clientHeight: number, scrollHeight: number): void {
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
}

function step(n: number): void {
  frameLoop.stop()
  let t = 3000
  for (let i = 0; i < n; i++) {
    t += 16
    frameLoop.step(t)
  }
}

function wheel(el: HTMLElement, deltaY: number, deltaMode = 0): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, deltaMode, bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

function translateOf(el: HTMLElement): number {
  const match = el.style.transform.match(/translate3d\(0(?:px)?,\s*(-?[\d.]+)px/)
  return match ? Number(match[1]) : 0
}

describe('InertialScroll', () => {
  let container: HTMLDivElement
  let content: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    container = document.createElement('div')
    content = document.createElement('div')
    container.appendChild(content)
    document.body.appendChild(container)
    sizes(container, 400, 1600)
    sizes(content, 1600, 1600)
    let scrollTop = 0
    Object.defineProperty(container, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v
      },
      configurable: true
    })
  })

  afterEach(() => {
    container.remove()
    frameLoop.stop()
    vi.unstubAllGlobals()
  })

  it('defaults to native mode and never swallows the wheel', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, {}, ctx)
    expect(scroll.currentMode).toBe('native')
    const event = wheel(container, 240)
    expect(event.defaultPrevented).toBe(false)
    expect(scroll.maxScroll).toBe(1200)
    scroll.destroy()
  })

  it('takes over the wheel in virtual mode', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    expect(scroll.currentMode).toBe('virtual')

    const event = wheel(container, 240)
    expect(event.defaultPrevented).toBe(true)
    step(40)
    expect(translateOf(content)).toBeCloseTo(-240, 0)
    scroll.destroy()
  })

  it('normalizes line-mode wheel deltas', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    // deltaMode 1 = lines; 3 lines at 16 px/line = 48 px, not 3 px.
    wheel(container, 3, 1)
    step(40)
    expect(translateOf(content)).toBeCloseTo(-48, 0)
    scroll.destroy()
  })

  it('refuses to hijack when motion is reduced', () => {
    stubCaps({ hover: true, reduce: true })
    const ctx = new EngineContext({ motion: 'auto' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    expect(scroll.currentMode).toBe('native')
    const event = wheel(container, 200)
    expect(event.defaultPrevented).toBe(false)
    scroll.destroy()
  })

  it('clamps at the end of the content', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    wheel(container, 5000)
    step(200)
    expect(translateOf(content)).toBeCloseTo(-1200, 0)
    scroll.destroy()
  })

  it('handles keyboard paging in virtual mode', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
    step(60)
    expect(translateOf(content)).toBeCloseTo(-360, 0)
    scroll.destroy()
  })

  it('jumps to the end with End', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    step(200)
    expect(translateOf(content)).toBeCloseTo(-1200, 0)
    scroll.destroy()
  })

  it('keeps a focused field visible in virtual mode', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const field = document.createElement('input')
    content.appendChild(field)
    // Field sits 900–940 px inside the content; the viewport is 400 px tall.
    rect(field, 0, 900, 300, 40)
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    step(200)
    expect(translateOf(content)).toBeLessThan(-400)
    scroll.destroy()
  })

  it('does not drag a focused field back to a snap point', () => {
    // Regression: with mandatory snapping, the post-settle snap ran after a
    // programmatic scroll too, so focusing an off-screen input scrolled to it and
    // immediately returned to the previous snap point — caret permanently hidden.
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const section = document.createElement('section')
    const field = document.createElement('input')
    section.appendChild(field)
    content.appendChild(section)
    rect(section, 0, 0, 300, 280)
    // Field sits 700 px down the content: below the 400 px viewport and far
    // enough that a wrong snap to the 0 px section would be obvious.
    rect(field, 0, 700, 200, 30)

    const scroll = new InertialScroll(container, content, { mode: 'virtual', snap: 'section' }, ctx)
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    step(260)
    expect(translateOf(content)).toBeLessThan(-150)
    scroll.destroy()
  })

  it('resolves snap points from a selector', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const a = document.createElement('section')
    const b = document.createElement('section')
    content.append(a, b)
    rect(a, 0, 0, 300, 400)
    rect(b, 0, 500, 300, 400)
    const scroll = new InertialScroll(container, content, { mode: 'virtual', snap: 'section' }, ctx)
    wheel(container, 420)
    step(300)
    expect(translateOf(content)).toBeCloseTo(-500, 0)
    scroll.destroy()
  })

  it('restores the container styles on destroy', () => {
    stubCaps({ hover: true })
    container.style.overflow = 'auto'
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    scroll.destroy()
    expect(container.style.overflow).toBe('auto')
  })

  it('switches back to native on demand', () => {
    stubCaps({ hover: true })
    const ctx = new EngineContext({ motion: 'full' })
    const scroll = new InertialScroll(container, content, { mode: 'virtual' }, ctx)
    scroll.setMode('native')
    expect(scroll.currentMode).toBe('native')
    const event = wheel(container, 200)
    expect(event.defaultPrevented).toBe(false)
    scroll.destroy()
  })
})
