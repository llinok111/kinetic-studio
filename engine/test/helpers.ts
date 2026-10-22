import { vi } from 'vitest'
import { QUERIES } from '../src/core/capability'

export interface PointerInit {
  x?: number
  y?: number
  t?: number
  id?: number
  buttons?: number
  pointerType?: string
  target?: EventTarget
}

/**
 * Build a pointer event with a controllable `timeStamp`.
 *
 * `timeStamp` cannot be passed through `PointerEventInit` (it is set by the
 * platform), yet every velocity in the engine depends on it. Defining an own
 * property on the instance shadows the prototype getter, which is the only way to
 * produce a deterministic two-event velocity in jsdom.
 */
export function pointerEvent(type: string, init: PointerInit = {}): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
    pointerId: init.id ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    buttons: init.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    isPrimary: true
  })
  Object.defineProperty(event, 'timeStamp', {
    value: init.t ?? 0,
    configurable: true
  })
  // jsdom's MouseEvent ignores `buttons` from the init dict, so it reads back as
  // 0 — which makes upstream's `pointerButtons` guard reject every pointerdown.
  // Defining it on the instance is the only reliable way to emulate a held button.
  const buttons = init.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1)
  Object.defineProperty(event, 'buttons', { value: buttons, configurable: true })
  return event
}

export function rect(el: HTMLElement, left: number, top: number, width: number, height: number): void {
  ;(el as any).__rect = { left, top, width, height }
}

interface Caps {
  hover?: boolean
  coarse?: boolean
  fine?: boolean
  reduce?: boolean
}

/**
 * Stub `matchMedia` so capability probing is deterministic. Returns the handler
 * registry so a test can flip a query at runtime.
 */
export function stubCaps(caps: Caps = {}) {
  const handlers = new Map<string, Array<(e: { matches: boolean }) => void>>()
  const state: Record<string, boolean> = {
    [QUERIES.hover]: caps.hover ?? true,
    [QUERIES.coarse]: caps.coarse ?? false,
    [QUERIES.fine]: caps.fine ?? true,
    [QUERIES.reduce]: caps.reduce ?? false
  }

  window.matchMedia = ((query: string) => ({
    get matches() {
      return state[query] ?? false
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      const list = handlers.get(query) ?? []
      list.push(cb)
      handlers.set(query, list)
    },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      const list = handlers.get(query) ?? []
      handlers.set(
        query,
        list.filter((h) => h !== cb)
      )
    },
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia

  return {
    flip(query: string, matches: boolean) {
      state[query] = matches
      for (const cb of handlers.get(query) ?? []) cb({ matches })
    },
    spy: vi.fn()
  }
}

/**
 * Walk a pointer sequence and stop with the button still held.
 *
 * Moves are dispatched on the element, not on `window`, because upstream binds
 * `pointermove` to the gesture target whenever pointer capture is enabled (the
 * default). Dispatching on `window` looks like it works — the events fire — but
 * never reaches the controller, which reads as "the library is broken".
 */
export function dragHold(
  target: HTMLElement,
  points: Array<{ x: number; y: number; t: number }>
): void {
  const [first, ...rest] = points
  target.dispatchEvent(pointerEvent('pointerdown', { ...first, buttons: 1 }))
  for (const point of rest) {
    target.dispatchEvent(pointerEvent('pointermove', { ...point, buttons: 1 }))
  }
}

/** Same as `dragHold`, then release at the final coordinate. */
export function dragSequence(
  target: HTMLElement,
  points: Array<{ x: number; y: number; t: number }>
): void {
  dragHold(target, points)
  const last = points[points.length - 1]
  target.dispatchEvent(pointerEvent('pointerup', { ...last, t: last.t + 16, buttons: 0 }))
}

/** Advance the shared frame loop deterministically without starting rAF. */
export function tickFrames(loop: { step: (t?: number) => unknown; stop: () => void }, count: number, dtMs = 16): void {
  loop.stop()
  let t = 1000
  for (let i = 0; i < count; i++) {
    t += dtMs
    loop.step(t)
  }
}

/**
 * Count *real* DOM listeners, including the ones upstream `@use-gesture` binds
 * through its own `EventStore` (which bypasses this engine's `Disposer`).
 *
 * Asserting only on the engine's own counter would prove nothing about the
 * listeners that actually leak in production.
 */
export function installListenerProbe() {
  const buckets = new WeakMap<EventTarget, Map<string, Set<unknown>>>()
  let live = 0

  const originalAdd = EventTarget.prototype.addEventListener
  const originalRemove = EventTarget.prototype.removeEventListener

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (listener) {
      let byType = buckets.get(this)
      if (!byType) {
        byType = new Map()
        buckets.set(this, byType)
      }
      let set = byType.get(type)
      if (!set) {
        set = new Set()
        byType.set(type, set)
      }
      if (!set.has(listener)) {
        set.add(listener)
        live++
      }
    }
    return originalAdd.call(this, type, listener, options)
  } as typeof EventTarget.prototype.addEventListener

  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (listener) {
      const set = buckets.get(this)?.get(type)
      if (set?.delete(listener)) live--
    }
    return originalRemove.call(this, type, listener, options)
  } as typeof EventTarget.prototype.removeEventListener

  return {
    get live() {
      return live
    },
    restore() {
      EventTarget.prototype.addEventListener = originalAdd
      EventTarget.prototype.removeEventListener = originalRemove
    }
  }
}

