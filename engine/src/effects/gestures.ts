import type { Disposable } from '../types'
import type { EngineContext } from '../core/context'
import { Disposer } from '../core/disposer'
import { applyTouchAction, suppressClick } from '../core/touch'
import { distance } from '../core/math'
import { InteractionMachine } from '../interaction/machine'

/**
 * Discrete gesture recognisers: tap, double-tap, long-press, swipe, pinch.
 *
 * Upstream `@use-gesture` has no recognisers for these. It exposes `state.tap`
 * (a boolean computed at drag end) and `state.swipe` (an array computed at drag
 * end), which is enough for "was this a swipe?" but not for the interactions
 * people actually build: a long press that must cancel the moment the finger
 * moves, a double tap that must not also fire two single taps, a pinch that must
 * not fight the browser's zoom.
 *
 * All timers go through the disposer, so an element removed mid-long-press
 * cannot fire its callback 200 ms later against a detached node.
 */

export interface SwipeInfo {
  direction: 'left' | 'right' | 'up' | 'down'
  /** px/s along the dominant axis. */
  velocity: number
  /** px along the dominant axis. */
  distance: number
}

export interface PinchInfo {
  /** Current distance / initial distance. */
  scale: number
  centerX: number
  centerY: number
}

export interface GestureOptions {
  tap?: (info: { x: number; y: number }) => void
  doubleTap?: (info: { x: number; y: number }) => void
  longPress?: (info: { x: number; y: number }) => void
  swipe?: (info: SwipeInfo) => void
  pinch?: (info: PinchInfo) => void
  tapMaxDistance?: number
  tapMaxDuration?: number
  doubleTapWindow?: number
  longPressDuration?: number
  swipeMinDistance?: number
  swipeMinVelocity?: number
  /** Movement (px) that cancels a pending long press / tap. Default 8. */
  moveCancelThreshold?: number
  /** Capture two-finger gestures. Disables page zoom on this element. */
  capturePinch?: boolean
  disabled?: boolean
}

interface PointerState {
  id: number
  startX: number
  startY: number
  startTime: number
  lastX: number
  lastY: number
  lastTime: number
  moved: boolean
}

export class GestureRecognizer implements Disposable {
  private el: HTMLElement
  private engine: EngineContext
  private scope = new Disposer('gestures')
  private opts: Required<Omit<GestureOptions, 'tap' | 'doubleTap' | 'longPress' | 'swipe' | 'pinch'>> &
    GestureOptions
  private machine = new InteractionMachine()
  private pointers = new Map<number, PointerState>()
  private longPressTimer: (() => void) | null = null
  private tapTimer: (() => void) | null = null
  private lastTap: { time: number; x: number; y: number } | null = null
  private pinchStart = 0
  private pinchActive = false

  constructor(el: HTMLElement, options: GestureOptions, ctx: EngineContext) {
    this.el = el
    this.engine = ctx
    this.opts = {
      tapMaxDistance: options.tapMaxDistance ?? 12,
      tapMaxDuration: options.tapMaxDuration ?? 260,
      doubleTapWindow: options.doubleTapWindow ?? 320,
      longPressDuration: options.longPressDuration ?? 500,
      swipeMinDistance: options.swipeMinDistance ?? 44,
      swipeMinVelocity: options.swipeMinVelocity ?? 320,
      moveCancelThreshold: options.moveCancelThreshold ?? 8,
      capturePinch: options.capturePinch ?? false,
      disabled: options.disabled ?? false,
      tap: options.tap,
      doubleTap: options.doubleTap,
      longPress: options.longPress,
      swipe: options.swipe,
      pinch: options.pinch
    }

    this.bind()
  }

  get phase() {
    return this.machine.phase
  }

  private bind(): void {
    const scope = this.scope
    scope.listen(this.el, 'pointerdown', (event) => this.onDown(event as PointerEvent))
    scope.listen(this.el, 'pointermove', (event) => this.onMove(event as PointerEvent))
    scope.listen(this.el, 'pointerup', (event) => this.onUp(event as PointerEvent))
    // `pointercancel` is the signal that the browser took the pointer away
    // (scroll started, OS gesture, incoming call). Treating it as a normal
    // pointerup is how "tap" fires when the user was scrolling.
    scope.listen(this.el, 'pointercancel', (event) => this.onCancel(event as PointerEvent))
    scope.listen(this.el, 'contextmenu', (event) => {
      if (this.opts.longPress) event.preventDefault()
    })

    if (this.opts.pinch && this.opts.capturePinch) {
      // Explicit opt-in: this element will no longer pan or zoom with the native
      // browser gesture. Documented as an accessibility trade-off.
      applyTouchAction(this.el, 'both', scope, this.engine.caps.touch)
    }
  }

  private onDown(event: PointerEvent): void {
    if (this.opts.disabled) return
    this.pointers.set(event.pointerId, {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      moved: false
    })

    if (this.pointers.size === 2 && this.opts.pinch) {
      this.beginPinch()
      this.cancelLongPress()
      return
    }

    this.machine.to('press', 'pointer-down')

    if (this.opts.longPress) {
      this.cancelLongPress()
      this.longPressTimer = this.scope.timeout(() => {
        this.longPressTimer = null
        if (this.machine.is('press')) {
          this.machine.to('hover', 'long-press')
          this.opts.longPress?.({ x: event.clientX, y: event.clientY })
          this.machine.to('idle', 'long-press-fired')
        }
      }, this.opts.longPressDuration)
    }
  }

  private onMove(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId)
    if (!pointer) return
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY
    pointer.lastTime = event.timeStamp

    const moved = distance(event.clientX, event.clientY, pointer.startX, pointer.startY)
    if (moved > this.opts.moveCancelThreshold) {
      pointer.moved = true
      this.cancelLongPress()
      if (this.machine.is('press')) this.machine.to('drag', 'moved')
    }

    if (this.pinchActive && this.pointers.size >= 2) this.updatePinch()
  }

  private onUp(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId)
    if (!pointer) return
    this.pointers.delete(event.pointerId)
    this.cancelLongPress()

    if (this.pinchActive) {
      if (this.pointers.size < 2) {
        this.pinchActive = false
        this.pinchStart = 0
      }
      if (this.pointers.size === 0) this.machine.to('idle', 'pinch-end')
      return
    }

    const elapsed = event.timeStamp - pointer.startTime
    const moved = distance(event.clientX, event.clientY, pointer.startX, pointer.startY)
    const dx = event.clientX - pointer.startX
    const dy = event.clientY - pointer.startY
    const dt = Math.max(1, event.timeStamp - pointer.startTime)
    const vx = (dx / dt) * 1000
    const vy = (dy / dt) * 1000

    const isSwipe =
      this.opts.swipe &&
      Math.max(Math.abs(dx), Math.abs(dy)) >= this.opts.swipeMinDistance &&
      Math.max(Math.abs(vx), Math.abs(vy)) >= this.opts.swipeMinVelocity

    if (isSwipe) {
      const horizontal = Math.abs(dx) > Math.abs(dy)
      this.opts.swipe?.({
        direction: horizontal ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
        velocity: horizontal ? vx : vy,
        distance: horizontal ? dx : dy
      })
      // The browser will still emit a click after a swipe; a swipe is not a click.
      suppressClick(this.scope)
      this.machine.to('idle', 'swipe')
      return
    }

    if (moved <= this.opts.tapMaxDistance && elapsed <= this.opts.tapMaxDuration) {
      this.handleTap(event)
      return
    }

    this.machine.to('idle', 'no-gesture')
  }

  private handleTap(event: PointerEvent): void {
    const now = event.timeStamp
    const previous = this.lastTap

    if (
      previous &&
      this.opts.doubleTap &&
      now - previous.time <= this.opts.doubleTapWindow &&
      distance(event.clientX, event.clientY, previous.x, previous.y) <= 32
    ) {
      // The single tap of this pair must not fire — cancel the pending one.
      this.tapTimer?.()
      this.tapTimer = null
      this.lastTap = null
      this.machine.to('idle', 'double-tap')
      this.opts.doubleTap({ x: event.clientX, y: event.clientY })
      return
    }

    if (!this.opts.tap && !this.opts.doubleTap) {
      this.machine.to('idle', 'tap')
      return
    }

    this.lastTap = { time: now, x: event.clientX, y: event.clientY }

    if (this.opts.doubleTap) {
      // Delay the single tap so a second tap can still promote it.
      this.tapTimer?.()
      this.tapTimer = this.scope.timeout(() => {
        this.tapTimer = null
        this.lastTap = null
        this.machine.to('idle', 'tap')
        this.opts.tap?.({ x: event.clientX, y: event.clientY })
      }, this.opts.doubleTapWindow)
    } else {
      this.machine.to('idle', 'tap')
      this.opts.tap?.({ x: event.clientX, y: event.clientY })
    }
  }

  private onCancel(event: PointerEvent): void {
    this.pointers.delete(event.pointerId)
    this.cancelLongPress()
    this.pinchActive = false
    this.pinchStart = 0
    if (!this.machine.is('idle')) this.machine.to('cancelled', 'pointer-cancel')
    this.machine.to('idle', 'cancelled')
  }

  private beginPinch(): void {
    const [a, b] = Array.from(this.pointers.values())
    this.pinchStart = distance(a.startX, a.startY, b.startX, b.startY) || 1
    this.pinchActive = true
    this.machine.to('drag', 'pinch-start')
  }

  private updatePinch(): void {
    const [a, b] = Array.from(this.pointers.values())
    const d = distance(a.lastX, a.lastY, b.lastX, b.lastY)
    this.opts.pinch?.({
      scale: d / this.pinchStart,
      centerX: (a.lastX + b.lastX) / 2,
      centerY: (a.lastY + b.lastY) / 2
    })
  }

  private cancelLongPress(): void {
    this.longPressTimer?.()
    this.longPressTimer = null
  }

  setDisabled(disabled: boolean): void {
    this.opts.disabled = disabled
    if (disabled) this.onCancel({ pointerId: -1 } as PointerEvent)
  }

  destroy(): void {
    this.cancelLongPress()
    this.tapTimer?.()
    this.tapTimer = null
    this.pointers.clear()
    this.scope.dispose()
  }
}
