/**
 * Writing movement to the DOM without destroying the author's own styles.
 *
 * The naive implementation — `el.style.transform = translate3d(x, y, 0)` — is a
 * silent bug on any element that already uses `transform` for layout, a library
 * animation, or a CSS hover effect: the engine's write wins and the author's
 * transform disappears.
 *
 * Modern browsers expose independent `translate` / `scale` / `rotate`
 * properties that compose *with* `transform`. Use them when available and fall
 * back to prepending to the recorded inline `transform` otherwise (Safari < 14.1,
 * old Android WebViews).
 */

const INDIVIDUAL_TRANSFORMS = (() => {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  try {
    return CSS.supports('translate', '10px') && CSS.supports('scale', '1.5')
  } catch {
    return false
  }
})()

export class MotionWriter {
  private el: HTMLElement
  private baseTransform: string
  private last = ''

  constructor(el: HTMLElement) {
    this.el = el
    this.baseTransform = el.style.transform || ''
  }

  /** Returns true when a write actually happened (lets callers skip layout). */
  write(x: number, y: number, scale = 1): boolean {
    const rounded = `${round(x)}px ${round(y)}px ${round(scale)}`
    if (rounded === this.last) return false
    this.last = rounded

    if (INDIVIDUAL_TRANSFORMS) {
      this.el.style.translate = `${round(x)}px ${round(y)}px`
      if (scale !== 1) this.el.style.scale = String(round(scale))
      else this.el.style.removeProperty('scale')
    } else {
      const prefix = `translate3d(${round(x)}px, ${round(y)}px, 0)`
      const scalePart = scale !== 1 ? ` scale(${round(scale)})` : ''
      this.el.style.transform = `${prefix}${scalePart}${this.baseTransform ? ` ${this.baseTransform}` : ''}`
    }
    return true
  }

  reset(): void {
    this.last = ''
    if (INDIVIDUAL_TRANSFORMS) {
      this.el.style.removeProperty('translate')
      this.el.style.removeProperty('scale')
    } else if (this.baseTransform) {
      this.el.style.transform = this.baseTransform
    } else {
      this.el.style.removeProperty('transform')
    }
  }
}

/** Sub-pixel rounding keeps the compositor from re-rasterising on every frame. */
function round(v: number): number {
  return Math.round(v * 100) / 100
}

export const supportsIndividualTransforms = INDIVIDUAL_TRANSFORMS
