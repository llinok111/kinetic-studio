/**
 * jsdom does not implement `PointerEvent`, and several engine paths depend on
 * `pointerId`, `buttons` and `getCoalescedEvents`. Polyfilling here (instead of
 * in every test) keeps the tests focused on behaviour.
 *
 * The polyfill is intentionally minimal and mirrors the parts of the spec the
 * engine reads — it is a test fixture, not a production shim.
 */

class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly isPrimary: boolean
  readonly width: number
  readonly height: number
  readonly pressure: number

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
    this.isPrimary = init.isPrimary ?? true
    this.width = init.width ?? 1
    this.height = init.height ?? 1
    this.pressure = init.pressure ?? 0.5
  }

  getCoalescedEvents(): PointerEvent[] {
    return []
  }
}

if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', {
    value: PointerEventPolyfill,
    configurable: true,
    writable: true
  })
}

/**
 * jsdom resolves every rect to 0×0, which makes geometric code untestable.
 * Tests that care about geometry set `__rect` on the element.
 */
if (typeof Element !== 'undefined') {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
    const custom = (this as any).__rect
    if (custom) {
      return {
        x: custom.left ?? 0,
        y: custom.top ?? 0,
        top: custom.top ?? 0,
        left: custom.left ?? 0,
        width: custom.width ?? 0,
        height: custom.height ?? 0,
        right: (custom.left ?? 0) + (custom.width ?? 0),
        bottom: (custom.top ?? 0) + (custom.height ?? 0),
        toJSON() {
          return this
        }
      } as DOMRect
    }
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      toJSON() {
        return this
      }
    } as DOMRect
  } as typeof Element.prototype.getBoundingClientRect
}

/** jsdom lacks ResizeObserver; the engine guards for it, so a no-op is enough. */
if (typeof globalThis.ResizeObserver === 'undefined') {
  class RO {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as any).ResizeObserver = RO
}

/** Deterministic rAF so `FrameLoop.start()` never depends on wall-clock timing. */
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  let t = 0
  ;(globalThis as any).requestAnimationFrame = (cb: (n: number) => void) => {
    t += 16
    return setTimeout(() => cb(t), 0) as unknown as number
  }
  ;(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as NodeJS.Timeout)
}

/**
 * jsdom has no pointer capture and no scrolling. Upstream `@use-gesture` calls
 * `setPointerCapture` when the device is `pointer`, so without these stubs every
 * drag test would throw inside the library rather than exercising the engine.
 */
if (typeof Element !== 'undefined') {
  const proto = Element.prototype as any
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {}
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {}
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false
  if (!proto.scrollTo) proto.scrollTo = () => {}
}

if (typeof window !== 'undefined' && !(window as any).scrollTo) {
  ;(window as any).scrollTo = () => {}
}

/**
 * Upstream detects pointer support with `'onpointerdown' in window`, not with
 * `'PointerEvent' in window`. jsdom defines neither, so without this the library
 * falls back to TouchEvent listeners and every pointer-driven test silently does
 * nothing — the worst failure mode, because it looks like a passing no-op.
 * Every real browser exposes `onpointerdown`, so defining it is faithful.
 */
if (typeof window !== 'undefined' && !('onpointerdown' in window)) {
  Object.defineProperty(window, 'onpointerdown', {
    value: null,
    writable: true,
    configurable: true
  })
}

/**
 * jsdom has no canvas backend and logs a noisy "Not implemented" for every
 * `getContext` call. A recording stub keeps the suite output readable and lets the
 * trail tests assert on draw calls instead of pixels.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  const recorded = { calls: [] as string[], reset: () => recorded.calls.splice(0) }
  ;(globalThis as any).__canvasRecorder = recorded

  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const noop =
      (name: string) =>
      (...args: unknown[]) => {
        recorded.calls.push(`${name}(${args.length})`)
      }
    return {
      canvas: this,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      strokeStyle: '#000',
      fillStyle: '#000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      setTransform: noop('setTransform'),
      clearRect: noop('clearRect'),
      beginPath: noop('beginPath'),
      arc: noop('arc'),
      moveTo: noop('moveTo'),
      lineTo: noop('lineTo'),
      stroke: noop('stroke'),
      fill: noop('fill'),
      save: noop('save'),
      restore: noop('restore')
    } as unknown as CanvasRenderingContext2D
  } as typeof HTMLCanvasElement.prototype.getContext
}



