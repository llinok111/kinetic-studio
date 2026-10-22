import type { Capabilities } from '../types'

/**
 * Device / preference probing.
 *
 * Two rules drive this module:
 *
 * 1. Never assume `matchMedia` exists — it is absent in SSR and in some embedded
 *    webviews. Every read is guarded so importing the engine on a server is safe.
 * 2. Never assume `addEventListener` on a `MediaQueryList` exists. Safari below
 *    14 only has the deprecated `addListener`, and *mixing* the two leaks the
 *    subscription silently. `onMediaChange` pairs the right remover with the
 *    right adder.
 */

type MediaListener = (event: { matches: boolean }) => void

interface MediaQueryListLike {
  matches: boolean
  addEventListener?: (type: 'change', cb: MediaListener) => void
  removeEventListener?: (type: 'change', cb: MediaListener) => void
  addListener?: (cb: MediaListener) => void
  removeListener?: (cb: MediaListener) => void
}

export const hasWindow = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined'

export const matches = (query: string): boolean => {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

export const QUERIES = {
  fine: '(pointer: fine)',
  coarse: '(pointer: coarse)',
  hover: '(hover: hover)',
  reduce: '(prefers-reduced-motion: reduce)'
} as const

export function readCapabilities(): Capabilities {
  if (!hasWindow()) {
    return {
      finePointer: false,
      coarsePointer: false,
      hover: false,
      touch: false,
      maxTouchPoints: 0,
      reducedMotion: false,
      devicePixelRatio: 1,
      cores: null,
      saveData: false
    }
  }

  const nav = navigator as Navigator & {
    hardwareConcurrency?: number
    connection?: { saveData?: boolean }
  }

  const maxTouchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0

  return {
    finePointer: matches(QUERIES.fine),
    coarsePointer: matches(QUERIES.coarse),
    hover: matches(QUERIES.hover),
    touch: maxTouchPoints > 0,
    maxTouchPoints,
    reducedMotion: matches(QUERIES.reduce),
    devicePixelRatio: window.devicePixelRatio || 1,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    saveData: nav.connection?.saveData === true
  }
}

/**
 * Subscribe to a media query, returning an idempotent unsubscriber that uses the
 * *same* API it subscribed with.
 */
export function onMediaChange(query: string, cb: (isMatch: boolean) => void): () => void {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return () => {}
  let mql: MediaQueryListLike
  try {
    mql = window.matchMedia(query) as unknown as MediaQueryListLike
  } catch {
    return () => {}
  }

  const handler: MediaListener = (event) => cb(event.matches)

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener?.('change', handler)
  }
  if (typeof mql.addListener === 'function') {
    mql.addListener(handler)
    return () => mql.removeListener?.(handler)
  }
  return () => {}
}

/**
 * Watch the capabilities that can change at runtime without a reload:
 * pointer type (mouse ↔ touch), hover, and the motion preference.
 * A change in any of them invalidates cached decisions inside the engine.
 */
export function watchCapabilities(cb: (caps: Capabilities) => void): () => void {
  const offs = [
    onMediaChange(QUERIES.fine, () => cb(readCapabilities())),
    onMediaChange(QUERIES.coarse, () => cb(readCapabilities())),
    onMediaChange(QUERIES.hover, () => cb(readCapabilities())),
    onMediaChange(QUERIES.reduce, () => cb(readCapabilities()))
  ]
  return () => {
    for (const off of offs) off()
  }
}
