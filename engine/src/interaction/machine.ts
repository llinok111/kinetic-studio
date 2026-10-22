import type { Phase, PhaseChange } from '../types'
import { safeNotify } from '../core/disposer'

/**
 * Interaction state machine.
 *
 * The reason this exists as a real machine instead of a handful of booleans:
 * a page with magnetism + drag + inertia + gestures has ~15 boolean flags, of
 * which only a few combinations are legal. Bugs show up as impossible states —
 * an element that is simultaneously "dragging" and "in inertia", a hover effect
 * that fires during a scroll, a tap that also moved the card.
 *
 * Illegal transitions are **rejected and counted**, not coerced. Coercion hides
 * the bug; counting it makes it visible in the demo's inspector and assertable
 * in tests.
 */

const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  idle: ['hover', 'press', 'drag', 'inertia', 'settle', 'blocked'],
  hover: ['press', 'idle', 'blocked'],
  press: ['drag', 'idle', 'hover', 'cancelled'],
  drag: ['inertia', 'settle', 'cancelled', 'idle'],
  inertia: ['settle', 'drag', 'idle', 'cancelled'],
  settle: ['idle', 'hover', 'drag', 'cancelled'],
  cancelled: ['idle'],
  blocked: ['idle', 'hover']
}

const HISTORY_LIMIT = 48

export interface MachineSnapshot {
  phase: Phase
  previous: Phase
  reason: string
  /** ms spent in the current phase. */
  elapsed: number
}

export class InteractionMachine {
  private _phase: Phase = 'idle'
  private _previous: Phase = 'idle'
  private _reason = 'init'
  private _since = 0
  private listeners = new Set<(change: PhaseChange) => void>()
  private _history: PhaseChange[] = []
  private _rejected = 0
  private clock: () => number

  constructor(clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.clock = clock
    this._since = this.clock()
  }

  get phase(): Phase {
    return this._phase
  }

  get previous(): Phase {
    return this._previous
  }

  get reason(): string {
    return this._reason
  }

  get rejectedTransitions(): number {
    return this._rejected
  }

  get history(): readonly PhaseChange[] {
    return this._history
  }

  snapshot(): MachineSnapshot {
    return {
      phase: this._phase,
      previous: this._previous,
      reason: this._reason,
      elapsed: this.clock() - this._since
    }
  }

  is(...phases: Phase[]): boolean {
    return phases.includes(this._phase)
  }

  /** True when the transition is legal from the current phase. */
  can(next: Phase): boolean {
    return TRANSITIONS[this._phase].includes(next)
  }

  /**
   * Attempt a transition. Returns `true` when applied.
   * A no-op request (`next === phase`) is treated as success and restarts the
   * timer, because "drag again while dragging" is a legitimate refresh.
   */
  to(next: Phase, reason = ''): boolean {
    if (next === this._phase) {
      this._reason = reason || this._reason
      this._since = this.clock()
      return true
    }
    if (!this.can(next)) {
      this._rejected++
      return false
    }
    const now = this.clock()
    const change: PhaseChange = {
      from: this._phase,
      to: next,
      reason,
      duration: now - this._since,
      time: now
    }
    this._previous = this._phase
    this._phase = next
    this._reason = reason
    this._since = now
    this._history.push(change)
    if (this._history.length > HISTORY_LIMIT) this._history.shift()
    safeNotify(this.listeners, change)
    return true
  }

  /** Convenience: transition only when currently in one of `from`. */
  from(phases: Phase | Phase[], next: Phase, reason = ''): boolean {
    const list = Array.isArray(phases) ? phases : [phases]
    if (!list.includes(this._phase)) {
      this._rejected++
      return false
    }
    return this.to(next, reason)
  }

  on(fn: (change: PhaseChange) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  reset(): void {
    this._phase = 'idle'
    this._previous = 'idle'
    this._reason = 'reset'
    this._since = this.clock()
    this._history.length = 0
    this._rejected = 0
  }
}
