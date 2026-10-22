import { describe, expect, it, vi, afterEach } from 'vitest'
import { matches, onMediaChange, QUERIES, readCapabilities } from '../src/core/capability'

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function stubMatchMedia(result: Record<string, boolean>) {
  window.matchMedia = ((query: string) => ({
    matches: result[query] ?? false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
}

describe('capability', () => {
  it('reads pointer and preference queries', () => {
    stubMatchMedia({ [QUERIES.fine]: true, [QUERIES.hover]: true, [QUERIES.reduce]: true })
    const caps = readCapabilities()
    expect(caps.finePointer).toBe(true)
    expect(caps.hover).toBe(true)
    expect(caps.reducedMotion).toBe(true)
    expect(caps.coarsePointer).toBe(false)
  })

  it('does not throw when matchMedia is missing', () => {
    // @ts-expect-error deliberately removing the API
    window.matchMedia = undefined
    expect(() => readCapabilities()).not.toThrow()
    expect(matches(QUERIES.fine)).toBe(false)
  })

  it('does not throw when matchMedia itself throws', () => {
    window.matchMedia = (() => {
      throw new Error('invalid query')
    }) as unknown as typeof window.matchMedia
    expect(matches('(bogus: query)')).toBe(false)
  })

  it('subscribes and unsubscribes with the same API', () => {
    const add = vi.fn()
    const remove = vi.fn()
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: add,
      removeEventListener: remove,
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia

    const off = onMediaChange(QUERIES.reduce, () => {})
    expect(add).toHaveBeenCalledTimes(1)
    off()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('falls back to the legacy addListener API (Safari < 14)', () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener,
      removeListener,
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia

    const off = onMediaChange(QUERIES.reduce, () => {})
    expect(addListener).toHaveBeenCalledTimes(1)
    off()
    // Mixing addEventListener with removeListener leaks the listener; this
    // asserts the pair stays symmetric.
    expect(removeListener).toHaveBeenCalledTimes(1)
  })

  it('calls back with the new value on change', () => {
    let handler: ((e: { matches: boolean }) => void) | null = null
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        handler = cb
      },
      removeEventListener: vi.fn(),
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia

    const cb = vi.fn()
    onMediaChange(QUERIES.reduce, cb)
    handler!({ matches: true })
    expect(cb).toHaveBeenCalledWith(true)
  })
})
