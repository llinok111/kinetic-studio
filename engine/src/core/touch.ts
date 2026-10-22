import type { Disposer } from './disposer'

/**
 * Touch-device correctness.
 *
 * Upstream `@use-gesture` detects the problem and only prints a warning:
 *
 *   DragEngine.setupPointer() →
 *     if (getComputedStyle(target).touchAction === 'auto')
 *       console.warn("The drag target has its `touch-action` style property set
 *                     to `auto`. It is recommended to add `touch-action: 'none'`…")
 *
 * It does not fix it, because a gesture library cannot know whether the element
 * lives inside a vertically scrolling page. The engine *can*, because it is told
 * the axis. So this module applies the correct value and — more importantly —
 * restores the author's exact previous value on teardown.
 *
 * Why it matters: with `touch-action: auto` the browser starts a native scroll
 * as soon as the finger moves ~8 px and fires `pointercancel`, killing the drag.
 * The user perceives a drag that "randomly stops working on phones".
 */

export type DragAxis = 'x' | 'y' | 'both' | 'lock'

const TOUCH_ACTION: Record<DragAxis, string> = {
  // Horizontal-only drag: vertical panning must stay native, otherwise a card
  // carousel blocks the page from scrolling on a phone.
  x: 'pan-y',
  y: 'pan-x',
  both: 'none',
  lock: 'none'
}

export function touchActionFor(axis: DragAxis): string {
  return TOUCH_ACTION[axis] ?? 'none'
}

/**
 * Apply `touch-action` for a drag surface and register the restore.
 * Returns `false` when it was skipped (no touch capability).
 */
export function applyTouchAction(
  el: HTMLElement,
  axis: DragAxis,
  disposer: Disposer,
  enabled = true
): boolean {
  if (!enabled) return false
  if (typeof getComputedStyle === 'function') {
    try {
      const current = getComputedStyle(el).touchAction
      // Already correct: do not touch the inline style at all, so we never
      // overwrite a class-based value with an inline one.
      if (current === TOUCH_ACTION[axis]) return false
    } catch {
      /* detached element */
    }
  }
  disposer.style(el, 'touch-action', TOUCH_ACTION[axis])
  return true
}

/**
 * Suppress the synthetic `click` that browsers emit after a drag or swipe.
 *
 * `@use-gesture` handles this for taps through `filterTaps` + `pointerClick`,
 * but that only covers the `click` that fires on the *same* element. A drag that
 * ends over a different element, or a swipe inside a scroll container, still
 * produces a click on the common ancestor. A one-shot capture listener on
 * `document` is the only reliable place.
 *
 * The listener is removed on the first click **or** after `window` ms, because
 * Safari does not emit a click at all when `touchstart` was prevented.
 */
export function suppressClick(
  disposer: Disposer,
  window = 400
): void {
  const target = document
  const handler = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    cleanup()
  }
  let timer: (() => void) | null = null

  const cleanup = () => {
    target.removeEventListener('click', handler, true)
    if (timer) timer()
    timer = null
  }

  target.addEventListener('click', handler, true)
  timer = disposer.timeout(cleanup, window)

  // The listener above is not registered through the disposer (it must be
  // capture-phase and self-removing), so make dispose() safe regardless.
  disposer.onDispose(() => target.removeEventListener('click', handler, true))
}
