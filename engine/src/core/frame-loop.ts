import type { FrameInfo, QualityTier } from '../types'
import { counters, safeNotify } from './disposer'
import { hasWindow } from './capability'

/**
 * One rAF loop for the whole engine.
 *
 * Why a shared loop instead of "each effect runs its own rAF":
 *  - 12 independent rAF callbacks do not cost 12× the work, but they do cost 12×
 *    the layout/paint interleaving, because each callback can force style reads.
 *  - Adaptive quality needs *aggregate* frame timing. Per-effect loops cannot
 *    know that the page as a whole is at 24 fps.
 *  - A single clock gives every effect the same `dt`, so a spring, an inertia
 *    integrator and a trail sample the same instant. Two loops drift apart and
 *    produce visible desynchronisation between a dragged card and its trail.
 *
 * Low-frame-rate handling: `dt` is clamped. After a tab switch or a long GC the
 * first frame can carry `dt = 30 000 ms`; feeding that into an Euler integrator
 * teleports elements off screen. Clamping to `MAX_DT` makes a dropped frame
 * behave like a single slow frame instead of an explosion.
 */

const MAX_DT = 64
const HIGH_FPS = 52
const MID_FPS = 34
const DOWNGRADE_FRAMES = 18
const UPGRADE_FRAMES = 90

const TIER_NAME: QualityTier[] = ['low', 'mid', 'high']

export type FrameSubscriber = (info: FrameInfo) => void

interface Entry {
  id: number
  fn: FrameSubscriber
  priority: number
}

export class FrameLoop {
  private entries: Entry[] = []
  private nextId = 1
  private rafId: number | null = null
  private last = 0
  private _fps = 60
  private _frame = 0
  private started = false
  private tierLevel = 2
  private overBudget = 0
  private underBudget = 0
  private qualityListeners = new Set<(tier: QualityTier) => void>()
  private visibilityBound = false
  private forcedTier: QualityTier | null = null

  get fps(): number {
    return this._fps
  }

  get frame(): number {
    return this._frame
  }

  get tier(): QualityTier {
    return this.forcedTier ?? TIER_NAME[this.tierLevel]
  }

  get running(): boolean {
    return this.started
  }

  get size(): number {
    return this.entries.length
  }

  /**
   * Subscribe. Lower numbers run first; effects that write to the DOM should use
   * a higher priority than effects that only measure it.
   * Returns an idempotent unsubscriber.
   */
  add(fn: FrameSubscriber, priority = 0): () => void {
    const entry: Entry = { id: this.nextId++, fn, priority }
    this.entries.push(entry)
    this.entries.sort((a, b) => a.priority - b.priority || a.id - b.id)
    this.start()
    return () => this.remove(entry.id)
  }

  remove(id: number): void {
    const i = this.entries.findIndex((e) => e.id === id)
    if (i >= 0) this.entries.splice(i, 1)
    if (this.entries.length === 0) this.stop()
  }

  /** Force a tier (tests + the demo's degradation switch). `null` = adaptive. */
  forceTier(tier: QualityTier | null): void {
    this.forcedTier = tier
    if (tier) {
      this.tierLevel = TIER_NAME.indexOf(tier)
      safeNotify(this.qualityListeners, tier)
    }
  }

  onQualityChange(fn: (tier: QualityTier) => void): () => void {
    this.qualityListeners.add(fn)
    return () => this.qualityListeners.delete(fn)
  }

  start(): void {
    if (this.started || !hasWindow()) return
    this.started = true
    this.last = 0
    this.bindVisibility()
    this.schedule()
  }

  stop(): void {
    if (this.rafId !== null && hasWindow()) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.started = false
  }

  /**
   * Deterministic single frame. The test suite drives the loop with this so that
   * physics assertions never depend on wall-clock timing.
   */
  step(now = performance.now()): FrameInfo {
    const info = this.compute(now)
    for (const entry of this.entries.slice()) {
      try {
        entry.fn(info)
      } catch (error) {
        console.error('[kinetic] frame subscriber failed', error)
      }
    }
    return info
  }

  private compute(now: number): FrameInfo {
    const rawDt = this.last === 0 ? 16.6667 : now - this.last
    this.last = now
    const dt = rawDt > 0 ? Math.min(rawDt, MAX_DT) : 16.6667
    const dtSec = dt / 1000

    // EMA on the *instantaneous* fps keeps the number responsive enough to react
    // within a few frames, while ignoring a single isolated spike.
    const instant = dt > 0 ? 1000 / dt : 60
    this._fps = this._fps * 0.88 + instant * 0.12
    this._frame++
    this.adapt(rawDt, dt)

    return { time: now, dt, dtSec, fps: this._fps, frame: this._frame, tier: this.tier }
  }

  /**
   * Hysteresis matters more than the thresholds: without it a page sitting on a
   * boundary flips tier every frame, and every flip re-allocates buffers in the
   * trail renderer. Downgrade fast (18 frames), upgrade slowly (90 frames).
   */
  private adapt(rawDt: number, clampedDt: number): void {
    if (this.forcedTier) return
    // A clamped frame means we were suspended; that is not a slow page.
    const usable = rawDt <= MAX_DT ? rawDt : clampedDt
    const fps = 1000 / usable

    const target = fps >= HIGH_FPS ? 2 : fps >= MID_FPS ? 1 : 0

    if (target < this.tierLevel) {
      this.overBudget++
      this.underBudget = 0
      if (this.overBudget >= DOWNGRADE_FRAMES && this.tierLevel > target) {
        this.tierLevel--
        this.overBudget = 0
        safeNotify(this.qualityListeners, this.tier)
      }
    } else if (target > this.tierLevel) {
      this.underBudget++
      this.overBudget = 0
      if (this.underBudget >= UPGRADE_FRAMES && this.tierLevel < target) {
        this.tierLevel++
        this.underBudget = 0
        safeNotify(this.qualityListeners, this.tier)
      }
    } else {
      this.overBudget = 0
      this.underBudget = 0
    }
  }

  private schedule(): void {
    if (!hasWindow()) return
    this.rafId = requestAnimationFrame((now) => {
      this.rafId = null
      counters.framesScheduled++
      if (!this.started) return
      this.step(now)
      this.schedule()
    })
  }

  /**
   * A hidden tab stops rAF entirely; on return the first timestamp is far in the
   * future. Resetting `last` here (rather than relying on the dt clamp alone)
   * also prevents the EMA from being poisoned by a 20-second "frame".
   */
  private bindVisibility(): void {
    if (this.visibilityBound || !hasWindow()) return
    this.visibilityBound = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop()
      } else if (this.entries.length > 0) {
        this.last = 0
        this.start()
      }
    })
  }
}

/** Shared instance — the engine's single clock. */
export const frameLoop = new FrameLoop()
