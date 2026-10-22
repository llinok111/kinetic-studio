import { expect, type Page } from '@playwright/test'

/**
 * Return the centre of an element, scrolling it into view first.
 *
 * `page.mouse.*` uses viewport coordinates and does not auto-scroll, unlike
 * `locator.click()`. Taking a `boundingBox()` for an element below the fold and
 * feeding those numbers to the mouse silently targets empty page — every gesture
 * test then fails with "nothing happened", which looks like a library bug.
 * Two of the failures in the first run of this suite were exactly that.
 */
export async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number; box: NonNullable<Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>> }> {
  const locator = page.locator(selector).first()
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box, `no bounding box for ${selector}`).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, box: box! }
}

/** Parse a computed `translate` value into numbers. */
export function parseTranslate(value: string): { x: number; y: number } {
  if (!value || value === 'none') return { x: 0, y: 0 }
  const parts = value.split(/\s+/).map((part) => Number.parseFloat(part))
  return { x: Number.isFinite(parts[0]) ? parts[0] : 0, y: Number.isFinite(parts[1]) ? parts[1] : 0 }
}
