import type { Controller } from '../upstream'
import { Controller as ControllerCtor, dragAction, pinchAction, registerAction } from '../upstream'
import { Disposer } from '../core/disposer'

/**
 * Framework-free host for an upstream gesture controller.
 *
 * Upstream ships an equivalent 20-line `Recognizer` in `packages/vanilla`. It is
 * not reused verbatim because it has no notion of ownership: `destroy()` calls
 * `ctrl.clean()`, which removes listeners but leaves any style the gesture
 * mutated (notably `touch-action`) in place, and it offers no count of what is
 * still alive. This host keeps the same three-call dance (`applyHandlers`,
 * `applyConfig`, `effect`) and adds a `Disposer`, which is what the leak tests
 * assert against.
 */

export type GestureKind = 'drag' | 'pinch'

let registered = false
function ensureActions(): void {
  if (registered) return
  registerAction(dragAction)
  registerAction(pinchAction)
  registered = true
}

export interface HostOptions {
  /** Forwarded to upstream; note `touch-action` is handled by this engine. */
  preventScroll?: boolean
  preventScrollDelay?: number
  pointerCapture?: boolean
  threshold?: number | [number, number]
  axis?: 'x' | 'y' | 'lock' | 'both'
  bounds?: unknown
  rubberband?: number | boolean | [number, number]
  filterTaps?: boolean
  tapsThreshold?: number
  swipe?: { velocity?: number | [number, number]; distance?: number | [number, number]; duration?: number }
}

export class GestureHost {
  readonly ctrl: Controller
  readonly kind: GestureKind
  private disposer = new Disposer('gesture-host')

  constructor(
    target: EventTarget,
    kind: GestureKind,
    handler: (state: any) => void,
    config: HostOptions = {}
  ) {
    ensureActions()
    this.kind = kind

    // Upstream's `Controller` constructor runs `resolveGestures(rawHandlers)`,
    // which looks for keys named after the gesture (`drag`, `pinch`) — the same
    // shape its own vanilla `Recognizer` uses. Keying it `onDrag` instead makes
    // the controller bind nothing at all, with no error: `sortHandlers` would
    // classify it as a native handler. Verified against 10.3.1.
    const handlers: Record<string, (state: any) => void> = {}
    handlers[kind] = handler

    this.ctrl = new ControllerCtor(handlers as any)
    this.ctrl.applyHandlers(handlers as any)
    this.ctrl.applyConfig({ ...(config as any), target, ...deviceHint() }, kind)
    this.ctrl.effect()

    this.disposer.onDispose(() => this.ctrl.clean())
  }

  /** Re-apply configuration without leaking the previous listener set. */
  reconfigure(config: HostOptions, target: EventTarget): void {
    this.ctrl.clean()
    this.ctrl.applyConfig({ ...(config as any), target }, this.kind)
    this.ctrl.effect()
  }

  get alive(): boolean {
    return !this.disposer.disposed
  }

  destroy(): void {
    this.disposer.dispose()
    this.ctrl.pointerIds.clear()
    this.ctrl.touchIds.clear()
  }
}

/**
 * Pin the input device to pointer events whenever the platform exposes them.
 *
 * Upstream picks `touch` as soon as `'ontouchstart' in window`, which is true on
 * any Windows laptop with a touchscreen — including when the user is on a mouse.
 * Pointer events already unify both, so preferring them removes a whole class of
 * "drags work with the mouse but not the pen" reports without changing behaviour
 * on platforms that genuinely lack `PointerEvent`.
 */
function deviceHint(): { device?: 'pointer' } {
  if (typeof window === 'undefined') return {}
  return 'PointerEvent' in window ? { device: 'pointer' } : {}
}
