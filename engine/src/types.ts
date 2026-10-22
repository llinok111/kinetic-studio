/**
 * Public + internal type surface for the kinetic engine.
 *
 * Design note: every unit crossing a public boundary is documented, because the
 * single most common integration bug in gesture engines is a unit mismatch
 * (px/ms vs px/s). See `docs/UNITS.md`.
 */

export interface Vec2 {
  x: number
  y: number
}

/** Interaction phases owned by `InteractionMachine`. */
export type Phase =
  | 'idle'
  | 'hover'
  | 'press'
  | 'drag'
  | 'inertia'
  | 'settle'
  | 'cancelled'
  | 'blocked'

/** Device frame-rate tier produced by the shared frame loop. */
export type QualityTier = 'high' | 'mid' | 'low'

/** `auto` follows the OS setting, `reduce`/`full` are explicit overrides. */
export type MotionPreference = 'auto' | 'reduce' | 'full'

export interface Capabilities {
  /** `(pointer: fine)` — true for mouse / trackpad / stylus. */
  finePointer: boolean
  /** `(pointer: coarse)` — true for finger-driven devices. */
  coarsePointer: boolean
  /** `(hover: hover)` — the primary input can hover. */
  hover: boolean
  /** A touch screen is present (`maxTouchPoints > 0`). */
  touch: boolean
  maxTouchPoints: number
  /** `(prefers-reduced-motion: reduce)`. */
  reducedMotion: boolean
  devicePixelRatio: number
  /** `navigator.hardwareConcurrency`, `null` when unavailable. */
  cores: number | null
  /** `navigator.connection.saveData`. */
  saveData: boolean
}

/** Payload handed to every frame subscriber. */
export interface FrameInfo {
  /** `performance.now()`-based timestamp of the frame. */
  time: number
  /** Clamped delta in milliseconds. */
  dt: number
  /** Clamped delta in seconds — the value physics integrators must use. */
  dtSec: number
  /** Smoothed frames per second. */
  fps: number
  /** Monotonic frame counter since the loop started. */
  frame: number
  /** Current adaptive quality tier. */
  tier: QualityTier
}

export interface SpringConfig {
  /** Hooke constant. Higher = snappier. Default 170. */
  stiffness?: number
  /** Viscous damping. Lower = bouncier. Default 20. */
  damping?: number
  /** Default 1. */
  mass?: number
}

export interface Bounds {
  min: number
  max: number
}

export interface KineticOptions {
  /** Motion preference override. Default `auto` (follow the OS). */
  motion?: MotionPreference
  /** Quality tier override. Default `auto` (adaptive). */
  quality?: 'auto' | QualityTier
  /** Root element used for global listeners. Default `document`. */
  root?: HTMLElement | Document
  /** Enables diagnostic counters and the leak report. Default `false`. */
  debug?: boolean
}

/** Everything the engine creates implements this. */
export interface Disposable {
  destroy(): void
}

export interface PhaseChange {
  from: Phase
  to: Phase
  reason: string
  /** ms since the previous transition. */
  duration: number
  time: number
}

export interface PointerSample {
  x: number
  y: number
  time: number
  /** Coalesced samples carry the sub-frame history of a single `pointermove`. */
  coalesced: boolean
}

/** Resolved, frozen motion policy. */
export interface MotionPolicy {
  reduced: boolean
  /** Multiplier applied to every engine-owned duration. 0 when reduced. */
  durationScale: number
  /** Post-release inertia / momentum. */
  allowInertia: boolean
  /** Pointer-attracted displacement of controls. */
  allowMagnetism: boolean
  /** Decorative pointer trail. */
  allowTrail: boolean
  /** Springy overscroll release. */
  allowOverscrollRelease: boolean
  /** Snap to the nearest target without an animated transition. */
  snapImmediately: boolean
}

/** Diagnostic counters — used by tests to assert cleanup, not by production code. */
export interface Diagnostics {
  listenersBound: number
  listenersReleased: number
  timeoutsCreated: number
  timeoutsCleared: number
  framesScheduled: number
  rejectedTransitions: number
  abortedGestures: number
}
