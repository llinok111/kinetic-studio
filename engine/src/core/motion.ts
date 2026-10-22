import type { MotionPolicy, MotionPreference } from '../types'
import { hasWindow, onMediaChange, QUERIES } from './capability'
import { safeNotify } from './disposer'

/**
 * Reduced-motion policy.
 *
 * The important distinction — and the one almost every library gets wrong — is
 * between *direct manipulation* and *automatic motion*:
 *
 *   - A drag that tracks the pointer 1:1 is **not** covered by
 *     `prefers-reduced-motion`. Removing it would break the control, not the
 *     animation. So dragging stays.
 *   - Everything that moves *after* the user stopped, or that moves without the
 *     user asking (inertia, spring-back, magnetic pull, decorative trails) is
 *     covered by WCAG 2.3.3 "Animation from Interactions" and must be removed.
 *
 * The resolved policy is therefore finer-grained than a single boolean.
 */

const FULL: Omit<MotionPolicy, 'reduced'> = {
  durationScale: 1,
  allowInertia: true,
  allowMagnetism: true,
  allowTrail: true,
  allowOverscrollRelease: true,
  snapImmediately: false
}

const REDUCED: Omit<MotionPolicy, 'reduced'> = {
  durationScale: 0,
  allowInertia: false,
  allowMagnetism: false,
  allowTrail: false,
  // Overscroll *resistance* is still direct manipulation, but the release
  // animation is not — the element snaps back on the same frame.
  allowOverscrollRelease: false,
  snapImmediately: true
}

export class MotionController {
  private preference: MotionPreference
  private systemReduced = false
  private listeners = new Set<(policy: MotionPolicy) => void>()
  private offMedia: (() => void) | null = null
  private _policy: MotionPolicy

  constructor(preference: MotionPreference = 'auto') {
    this.preference = preference
    this.systemReduced = hasWindow() ? safeMatches() : false
    this._policy = this.resolve()
    if (preference === 'auto') this.bind()
  }

  get policy(): MotionPolicy {
    return this._policy
  }

  get resolved(): boolean {
    return this._policy.reduced
  }

  /** `auto` | `reduce` | `full`. Setting a value unbinds the media listener. */
  set(preference: MotionPreference): void {
    if (preference === this.preference) return
    this.preference = preference
    if (preference === 'auto') this.bind()
    else this.unbind()
    this.refresh()
  }

  subscribe(fn: (policy: MotionPolicy) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * Engines call this instead of branching on `reduced` everywhere: an animation
   * that is allowed in full mode collapses to 0 ms in reduced mode without the
   * caller needing to know which mode it is in.
   */
  duration(ms: number): number {
    return this._policy.reduced ? 0 : ms
  }

  destroy(): void {
    this.unbind()
    this.listeners.clear()
  }

  private bind(): void {
    if (this.offMedia) return
    this.offMedia = onMediaChange(QUERIES.reduce, (isMatch) => {
      this.systemReduced = isMatch
      this.refresh()
    })
  }

  private unbind(): void {
    this.offMedia?.()
    this.offMedia = null
  }

  private refresh(): void {
    const next = this.resolve()
    const changed =
      next.reduced !== this._policy.reduced ||
      next.allowInertia !== this._policy.allowInertia ||
      next.allowMagnetism !== this._policy.allowMagnetism ||
      next.allowTrail !== this._policy.allowTrail
    this._policy = next
    if (changed) safeNotify(this.listeners, next)
  }

  private resolve(): MotionPolicy {
    const reduced =
      this.preference === 'reduce' || (this.preference === 'auto' && this.systemReduced)
    return { reduced, ...(reduced ? REDUCED : FULL) }
  }
}

function safeMatches(): boolean {
  try {
    return window.matchMedia(QUERIES.reduce).matches
  } catch {
    return false
  }
}
