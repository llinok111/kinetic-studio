import { describe, expect, it, vi } from 'vitest'
import { Disposer, liveListenerCount, resetCounters, safeNotify } from '../src/core/disposer'

describe('Disposer', () => {
  it('removes exactly the listeners it added', () => {
    resetCounters()
    const el = document.createElement('div')
    const d = new Disposer()
    const fn = vi.fn()
    d.listen(el, 'click', fn)
    el.dispatchEvent(new Event('click'))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(liveListenerCount()).toBe(1)

    d.dispose()
    el.dispatchEvent(new Event('click'))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(liveListenerCount()).toBe(0)
  })

  it('is idempotent', () => {
    resetCounters()
    const el = document.createElement('div')
    const d = new Disposer()
    d.listen(el, 'click', () => {})
    d.dispose()
    d.dispose()
    d.dispose()
    expect(liveListenerCount()).toBe(0)
  })

  it('returns an idempotent remover', () => {
    resetCounters()
    const el = document.createElement('div')
    const d = new Disposer()
    const remove = d.listen(el, 'click', () => {})
    remove()
    remove()
    expect(liveListenerCount()).toBe(0)
    expect(d.size).toBe(0)
  })

  it('ignores new registrations after dispose', () => {
    const d = new Disposer()
    d.dispose()
    const el = document.createElement('div')
    expect(() => d.listen(el, 'click', () => {})).not.toThrow()
    expect(d.size).toBe(0)
  })

  it('clears pending timeouts', async () => {
    vi.useFakeTimers()
    const d = new Disposer()
    const fn = vi.fn()
    d.timeout(fn, 50)
    d.dispose()
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('fires a timeout that is not disposed', () => {
    vi.useFakeTimers()
    const d = new Disposer()
    const fn = vi.fn()
    d.timeout(fn, 50)
    vi.advanceTimersByTime(60)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('restores the exact previous inline style', () => {
    // `overflow` rather than `touch-action`: jsdom's CSSStyleDeclaration only
    // implements a subset of properties and silently drops unknown ones, which
    // would make this assertion meaningless rather than false.
    const el = document.createElement('div')
    el.style.setProperty('overflow', 'pan-x')
    const d = new Disposer()
    d.style(el, 'overflow', 'hidden')
    expect(el.style.getPropertyValue('overflow')).toBe('hidden')
    d.dispose()
    expect(el.style.getPropertyValue('overflow')).toBe('pan-x')
  })

  it('removes the property when there was no previous value', () => {
    const el = document.createElement('div')
    const d = new Disposer()
    d.style(el, 'will-change', 'transform')
    expect(el.style.getPropertyValue('will-change')).toBe('transform')
    d.dispose()
    expect(el.style.getPropertyValue('will-change')).toBe('')
  })

  it('preserves !important', () => {
    const el = document.createElement('div')
    el.style.setProperty('overflow', 'auto', 'important')
    const d = new Disposer()
    d.style(el, 'overflow', 'hidden')
    d.dispose()
    expect(el.style.getPropertyValue('overflow')).toBe('auto')
    expect(el.style.getPropertyPriority('overflow')).toBe('important')
  })

  it('disposes children with the parent', () => {
    const child = new Disposer()
    const el = document.createElement('div')
    child.listen(el, 'click', () => {})
    const parent = new Disposer()
    parent.adopt(child)
    parent.dispose()
    expect(child.disposed).toBe(true)
  })

  it('runs teardown even when one closer throws', () => {
    const d = new Disposer()
    const later = vi.fn()
    d.onDispose(() => {
      throw new Error('boom')
    })
    d.onDispose(later)
    expect(() => d.dispose()).not.toThrow()
    expect(later).toHaveBeenCalled()
  })
})

describe('safeNotify', () => {
  it('keeps notifying after a subscriber throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const set = new Set<(v: number) => void>()
    const ok = vi.fn()
    set.add(() => {
      throw new Error('boom')
    })
    set.add(ok)
    expect(() => safeNotify(set, 1)).not.toThrow()
    expect(ok).toHaveBeenCalledWith(1)
    expect(error).toHaveBeenCalled()
  })
})
