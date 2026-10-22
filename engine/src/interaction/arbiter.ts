/**
 * Pointer arbitration.
 *
 * Real pages compose several interactions over the same pointer. Without an
 * arbiter you get the classic symptoms:
 *
 *  - a card that keeps following the finger after a native scroll started;
 *  - two nested draggables both moving (child *and* parent);
 *  - a pinch that also drags one of the two touch points;
 *  - a magnetic hover that keeps re-centring a button while the user is
 *    dragging something across it.
 *
 * Ownership is per `pointerId`, with preemption by priority. The losing owner is
 * notified through `onRevoke` so it can cancel its own state instead of being
 * left mid-gesture.
 */

export const PRIORITY = {
  hover: 0,
  scroll: 10,
  drag: 20,
  gesture: 30,
  modal: 40
} as const

export interface Claim {
  pointerId: number
  owner: string
  priority: number
  since: number
}

type RevokeHandler = (claim: Claim) => void

export class Arbiter {
  private claims = new Map<number, Claim>()
  private revokers = new Map<string, RevokeHandler>()
  private _maxPointers: number

  constructor(maxPointers = 2) {
    this._maxPointers = maxPointers
  }

  get maxPointers(): number {
    return this._maxPointers
  }

  setMaxPointers(n: number): void {
    this._maxPointers = Math.max(1, Math.floor(n))
  }

  get activePointers(): number {
    return this.claims.size
  }

  ownerOf(pointerId: number): string | null {
    return this.claims.get(pointerId)?.owner ?? null
  }

  isOwner(pointerId: number, owner: string): boolean {
    return this.claims.get(pointerId)?.owner === owner
  }

  claim(pointerId: number, owner: string, priority: number): boolean {
    const existing = this.claims.get(pointerId)

    if (!existing) {
      if (this.claims.size >= this._maxPointers) return false
      this.claims.set(pointerId, { pointerId, owner, priority, since: now() })
      return true
    }

    if (existing.owner === owner) {
      existing.priority = Math.max(existing.priority, priority)
      return true
    }

    // Preemption: the stronger interaction takes the pointer, and the weaker one
    // is told to cancel cleanly rather than silently losing its events.
    if (priority > existing.priority) {
      const previous = existing.owner
      const claim: Claim = { ...existing }
      this.claims.set(pointerId, { pointerId, owner, priority, since: now() })
      const revoke = this.revokers.get(previous)
      if (revoke) {
        try {
          revoke(claim)
        } catch {
          /* a revoke handler must not break arbitration */
        }
      }
    }
    return this.claims.get(pointerId)?.owner === owner
  }

  release(pointerId: number, owner?: string): void {
    const existing = this.claims.get(pointerId)
    if (!existing) return
    if (owner && existing.owner !== owner) return
    this.claims.delete(pointerId)
  }

  releaseAll(owner?: string): void {
    if (!owner) {
      this.claims.clear()
      return
    }
    for (const [id, claim] of Array.from(this.claims)) {
      if (claim.owner === owner) this.claims.delete(id)
    }
  }

  onRevoke(owner: string, handler: RevokeHandler): () => void {
    this.revokers.set(owner, handler)
    return () => {
      if (this.revokers.get(owner) === handler) this.revokers.delete(owner)
    }
  }

  snapshot(): Claim[] {
    return Array.from(this.claims.values())
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
