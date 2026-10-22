import type { Bounds, Disposable, SpringConfig } from '../types'
import type { EngineContext } from '../core/context'
import { Disposer } from '../core/disposer'
import { MotionWriter } from '../core/motion-writer'
import { Spring, SPRING_PRESETS, clampMomentum, rubberbandPosition, Decay } from '../core/spring'
import { clamp, nearest, perMsToPerSec, sign } from '../core/math'
import { applyTouchAction, suppressClick, type DragAxis } from '../core/touch'
import { PRIORITY } from '../interaction/arbiter'
import { InteractionMachine } from '../interaction/machine'
import { GestureHost } from './host'

/**
 * Elastic drag with momentum and snapping.
 *
 * Direct manipulation is **1:1**: while the pointer is down the element follows
 * exactly, with no spring lag. Introducing smoothing during the drag is the most
 * common mistake in "physics" drag implementations — it reads as input latency,
 * not as physics. Physics only applies to what happens *after* release.
 *
 * Beyond the bounds the displacement is compressed with a rubber band curve, so
 * the user gets resistance feedback instead of a hard wall.
 *
 * Velocity units: upstream reports `state.velocity` as an **unsigned magnitude in
 * px/ms**; the sign lives in `state.direction`. Composing them is mandatory —
 * using `state.velocity` alone makes every fling go right and down.
 */

export interface ElasticDragOptions {
  axis?: DragAxis
  bounds?: { x?: Bounds; y?: Bounds }
  /** Rubber band constant. 0 = hard clamp. Default 0.15 (upstream default). */
  overscroll?: number
  /** Exponential friction in e-folds/second. Higher stops sooner. Default 5. */
  friction?: number
  /** Minimum speed (px/s) that triggers momentum. Default 260. */
  flingThreshold?: number
  snap?: { x?: number[]; y?: number[] }
  /** Distance (px) within which a snap point captures the release. Default 60. */
  snapThreshold?: number
  /** Spring used for the overscroll return. Default `loose`. */
  returnSpring?: SpringConfig
  /** Scale applied while dragging, composed with `transform`. Default 1. */
  scaleWhileDrag?: number
  /** Movement (px) before the drag is considered intentional. Default 3. */
  threshold?: number
  disabled?: boolean
  onStart?: (pos: { x: number; y: number }) => void
  onMove?: (pos: { x: number; y: number; phase: string }) => void
  onEnd?: (result: { x: number; y: number; vx: number; vy: number; flung: boolean }) => void
  onCancel?: (reason: string) => void
}

type Mode = 'idle' | 'drag' | 'inertia' | 'settle'

export class ElasticDrag implements Disposable {
  private el: HTMLElement
  private engine: EngineContext
  private scope = new Disposer('elastic-drag')
  private writer: MotionWriter
  private host: GestureHost | null = null
  private machine = new InteractionMachine()
  private opts: Required<Omit<ElasticDragOptions, 'bounds' | 'snap' | 'onStart' | 'onMove' | 'onEnd' | 'onCancel' | 'returnSpring'>> & {
    bounds: { x?: Bounds; y?: Bounds }
    snap?: { x?: number[]; y?: number[] }
    returnSpring: SpringConfig
    onStart?: ElasticDragOptions['onStart']
    onMove?: ElasticDragOptions['onMove']
    onEnd?: ElasticDragOptions['onEnd']
    onCancel?: ElasticDragOptions['onCancel']
  }

  private pos = { x: 0, y: 0 }
  private startPos = { x: 0, y: 0 }
  private vel = { x: 0, y: 0 }
  private springX: Spring
  private springY: Spring
  private decayX: Decay | null = null
  private decayY: Decay | null = null
  private mode: Mode = 'idle'
  private removeFrame: (() => void) | null = null
  private owner: string
  private activePointer: number | null = null
  private offRevoke: (() => void) | null = null

  constructor(el: HTMLElement, options: ElasticDragOptions, ctx: EngineContext) {
    this.el = el
    this.engine = ctx
    this.owner = `drag:${Math.random().toString(36).slice(2, 8)}`
    this.writer = new MotionWriter(el)

    this.opts = {
      axis: options.axis ?? 'both',
      overscroll: options.overscroll ?? 0.15,
      friction: options.friction ?? 5,
      flingThreshold: options.flingThreshold ?? 260,
      snapThreshold: options.snapThreshold ?? 60,
      scaleWhileDrag: options.scaleWhileDrag ?? 1,
      threshold: options.threshold ?? 3,
      disabled: options.disabled ?? false,
      bounds: options.bounds ?? {},
      snap: options.snap,
      returnSpring: options.returnSpring ?? SPRING_PRESETS.loose,
      onStart: options.onStart,
      onMove: options.onMove,
      onEnd: options.onEnd,
      onCancel: options.onCancel
    }

    this.springX = new Spring(0, this.opts.returnSpring)
    this.springY = new Spring(0, this.opts.returnSpring)

    this.createHost()
    this.watchDetachment()
    this.offRevoke = ctx.arbiter.onRevoke(this.owner, () => this.abort('preempted'))
  }

  get phase() {
    return this.machine.phase
  }

  get position() {
    return { ...this.pos }
  }

  /** Transition history, newest last — surfaced by the demo inspector. */
  get history() {
    return this.machine.history
  }

  get rejectedTransitions(): number {
    return this.machine.rejectedTransitions
  }

  private createHost(): void {
    this.host = new GestureHost(
      this.el,
      'drag',
      (state) => this.onDrag(state),
      {
        axis: this.opts.axis === 'lock' ? 'lock' : this.opts.axis === 'both' ? undefined : this.opts.axis,
        // Bounds and rubber band are applied by this engine, not upstream, so
        // that the elasticity is shared with the scroll container. Passing them
        // to upstream as well would compress the overshoot twice.
        threshold: this.opts.threshold,
        filterTaps: true
        // `preventScroll` is deliberately NOT forwarded: it makes upstream call
        // `preventDefault` from a non-passive `touchmove` listener and delays the
        // gesture start by 250 ms on touch. `touch-action` (applied below) is the
        // modern equivalent and costs nothing on the scroll thread.
      }
    )
  }

  private onDrag(state: any): void {
    if (this.opts.disabled) return

    if (state.first) {
      const id = state.event?.pointerId ?? 0
      // Nested draggables: the innermost surface claims the pointer first and the
      // parent is denied, which is what users expect.
      if (!this.engine.arbiter.claim(id, this.owner, PRIORITY.drag)) return
      this.activePointer = id
      // The browser only respects the drag when `touch-action` allows it; upstream
      // warns about this and leaves the fix to the caller (see core/touch.ts).
      applyTouchAction(this.el, this.opts.axis, this.scope, this.engine.caps.touch)
      this.el.setAttribute('data-kinetic-drag', 'active')

      // `offset` is upstream's accumulated movement since the gesture started, so
      // the absolute position is simply "where we were" plus that movement.
      this.startPos = { ...this.pos }
      this.mode = 'drag'
      this.machine.to('press', 'pointer-down')
      this.machine.to('drag', 'threshold-passed')
      this.writer.write(this.pos.x, this.pos.y, this.opts.scaleWhileDrag)
      this.opts.onStart?.({ ...this.pos })
    }

    if (!this.machine.is('drag')) return

    const rawX = this.startPos.x + state.offset[0]
    const rawY = this.startPos.y + state.offset[1]
    const bx = this.boundsFor('x')
    const by = this.boundsFor('y')

    this.pos.x = rubberbandPosition(rawX, bx.min, bx.max, this.opts.overscroll)
    this.pos.y = rubberbandPosition(rawY, by.min, by.max, this.opts.overscroll)

    if (this.opts.axis === 'x') this.pos.y = this.startPos.y
    if (this.opts.axis === 'y') this.pos.x = this.startPos.x

    // A NaN reaching `translate` silently freezes the element for the rest of the
    // session, so it is caught here rather than at the DOM boundary.
    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y)) {
      this.pos = { ...this.startPos }
      this.abort('non-finite-position')
      return
    }

    this.writer.write(this.pos.x, this.pos.y, this.opts.scaleWhileDrag)
    this.opts.onMove?.({ ...this.pos, phase: this.machine.phase })

    if (state.last) this.onRelease(state)
  }

  private onRelease(state: any): void {
    // Upstream quirk: `velocity` is unsigned px/ms, `direction` carries the sign.
    const vx = perMsToPerSec(state.velocity[0]) * sign(state.direction[0] || 0)
    const vy = perMsToPerSec(state.velocity[1]) * sign(state.direction[1] || 0)
    this.vel = { x: vx, y: vy }

    this.el.removeAttribute('data-kinetic-drag')
    if (this.activePointer !== null) this.engine.arbiter.release(this.activePointer, this.owner)
    this.activePointer = null

    this.writer.write(this.pos.x, this.pos.y, 1)

    const policy = this.engine.motion.policy

    if (!policy.allowInertia) {
      // Reduced motion: land on the final position now. The *result* is
      // identical to the end of the momentum run, only the animation is removed.
      this.settleNow()
      this.finish(false)
      this.machine.to('settle', 'reduced-motion')
      this.machine.to('idle', 'settled')
      return
    }

    const outX = this.pos.x < this.boundsFor('x').min || this.pos.x > this.boundsFor('x').max
    const outY = this.pos.y < this.boundsFor('y').min || this.pos.y > this.boundsFor('y').max
    const fastX = Math.abs(vx) > this.opts.flingThreshold
    const fastY = Math.abs(vy) > this.opts.flingThreshold

    if (outX || outY) {
      // Returning from an overscroll always wins over momentum: the user pulled
      // past the edge, they did not throw the card.
      this.beginSpring()
      this.machine.to('settle', 'overscroll-return')
      suppressClick(this.scope)
      return
    }

    if (fastX || fastY) {
      const projected = clampMomentum(this.pos.x, vx, this.boundsFor('x').min, this.boundsFor('x').max, this.opts.friction)
      this.decayX = new Decay(projected.velocity, this.opts.friction)
      this.vel.x = projected.velocity
      const projectedY = clampMomentum(this.pos.y, vy, this.boundsFor('y').min, this.boundsFor('y').max, this.opts.friction)
      this.decayY = new Decay(projectedY.velocity, this.opts.friction)
      this.vel.y = projectedY.velocity
      this.mode = 'inertia'
      this.machine.to('inertia', 'fling')
      this.ensureFrame()
      suppressClick(this.scope)
      return
    }

    if (this.opts.snap) {
      this.beginSpring()
      this.machine.to('settle', 'snap')
      suppressClick(this.scope)
      return
    }

    // No momentum, no snap: stay where released.
    this.finish(false)
    this.machine.to('idle', 'rest')
  }

  private beginSpring(): void {
    this.mode = 'settle'
    const bx = this.boundsFor('x')
    const by = this.boundsFor('y')
    const targetX = this.snapTarget('x', clamp(this.pos.x, bx.min, bx.max))
    const targetY = this.snapTarget('y', clamp(this.pos.y, by.min, by.max))
    this.springX.jump(this.pos.x)
    this.springY.jump(this.pos.y)
    this.springX.setTarget(targetX)
    this.springY.setTarget(targetY)
    this.ensureFrame()
  }

  private snapTarget(axis: 'x' | 'y', fallback: number): number {
    const points = this.opts.snap?.[axis]
    if (!points || points.length === 0) return fallback
    const value = axis === 'x' ? this.pos.x : this.pos.y
    const candidate = nearest(value, points)
    return Math.abs(candidate - value) <= this.opts.snapThreshold ? candidate : fallback
  }

  private settleNow(): void {
    const bx = this.boundsFor('x')
    const by = this.boundsFor('y')
    this.pos.x = this.snapTarget('x', clamp(this.pos.x, bx.min, bx.max))
    this.pos.y = this.snapTarget('y', clamp(this.pos.y, by.min, by.max))
    this.writer.write(this.pos.x, this.pos.y, 1)
    this.mode = 'idle'
    this.stopFrame()
  }

  private ensureFrame(): void {
    if (this.removeFrame) return
    this.removeFrame = this.engine.loop.add((info) => this.tick(info.dtSec), 5)
  }

  private stopFrame(): void {
    this.removeFrame?.()
    this.removeFrame = null
  }

  private tick(dtSec: number): void {
    if (this.mode === 'inertia') {
      const dx = this.decayX?.step(dtSec) ?? 0
      const dy = this.decayY?.step(dtSec) ?? 0
      const bx = this.boundsFor('x')
      const by = this.boundsFor('y')

      this.pos.x = clamp(this.pos.x + dx, bx.min, bx.max)
      this.pos.y = clamp(this.pos.y + dy, by.min, by.max)
      this.writer.write(this.pos.x, this.pos.y, 1)

      const doneX = !this.decayX || this.decayX.done
      const doneY = !this.decayY || this.decayY.done
      const atEdgeX = this.pos.x === bx.min || this.pos.x === bx.max
      const atEdgeY = this.pos.y === by.min || this.pos.y === by.max

      if ((doneX || atEdgeX) && (doneY || atEdgeY)) {
        this.decayX = null
        this.decayY = null
        if (this.opts.snap) {
          this.beginSpring()
          this.machine.to('settle', 'post-inertia-snap')
        } else {
          this.finish(true)
          this.machine.to('idle', 'inertia-end')
        }
      }
      return
    }

    if (this.mode === 'settle') {
      this.pos.x = this.springX.step(dtSec)
      this.pos.y = this.springY.step(dtSec)
      this.writer.write(this.pos.x, this.pos.y, 1)
      if (this.springX.settled && this.springY.settled) {
        this.finish(false)
        this.machine.to('idle', 'settled')
      }
    }
  }

  private finish(flung: boolean): void {
    this.mode = 'idle'
    this.stopFrame()
    this.opts.onEnd?.({ ...this.pos, vx: this.vel.x, vy: this.vel.y, flung })
    this.vel = { x: 0, y: 0 }
  }

  /** Abort without momentum — used for pointercancel, revoke, detach, teardown. */
  abort(reason: string): void {
    if (this.machine.is('idle')) return
    this.machine.to('cancelled', reason)
    this.mode = 'idle'
    this.decayX = null
    this.decayY = null
    this.stopFrame()
    this.el.removeAttribute('data-kinetic-drag')
    if (this.activePointer !== null) this.engine.arbiter.release(this.activePointer, this.owner)
    this.activePointer = null
    this.settleNow()
    this.opts.onCancel?.(reason)
    this.machine.to('idle', 'aborted')
  }

  /**
   * A component that unmounts while its element is being dragged never receives
   * `pointerup`. Upstream keeps running because it has no liveness check; here the
   * element is watched and the drag is aborted the moment it leaves the document.
   */
  private watchDetachment(): void {
    if (typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(() => {
      if (!this.el.isConnected && !this.machine.is('idle')) this.abort('detached')
    })
    mo.observe(document.documentElement, { childList: true, subtree: true })
    this.scope.onDispose(() => mo.disconnect())
  }

  private boundsFor(axis: 'x' | 'y'): Bounds {
    const b = this.opts.bounds[axis]
    return b ?? { min: -Infinity, max: Infinity }
  }

  /**
   * Replace the movement bounds — needed whenever the stage resizes, since bounds
   * are expressed in the element's own offset space and a responsive layout
   * changes that space without the engine noticing.
   */
  setBounds(bounds: { x?: Bounds; y?: Bounds }): void {
    this.opts.bounds = bounds
    const bx = this.boundsFor('x')
    const by = this.boundsFor('y')
    this.pos.x = Math.min(Math.max(this.pos.x, bx.min), bx.max)
    this.pos.y = Math.min(Math.max(this.pos.y, by.min), by.max)
    this.writer.write(this.pos.x, this.pos.y, 1)
  }

  setDisabled(disabled: boolean): void {
    this.opts.disabled = disabled
    if (disabled) this.abort('disabled')
  }

  /** Programmatic move (used by the demo's "reset" button). */
  moveTo(x: number, y: number, animate = true): void {
    if (!animate || this.engine.reduced) {
      this.pos = { x, y }
      this.writer.write(x, y, 1)
      return
    }
    this.springX.jump(this.pos.x)
    this.springY.jump(this.pos.y)
    this.springX.setTarget(x)
    this.springY.setTarget(y)
    this.mode = 'settle'
    this.machine.to('settle', 'programmatic')
    this.ensureFrame()
  }

  destroy(): void {
    this.abort('destroy')
    this.offRevoke?.()
    this.host?.destroy()
    this.stopFrame()
    this.scope.dispose()
    this.writer.reset()
    this.el.removeAttribute('data-kinetic-drag')
  }
}
