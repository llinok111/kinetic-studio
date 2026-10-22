import { expect, test } from '@playwright/test'
import { centerOf } from './helpers'

async function cardBox(page: import('@playwright/test').Page) {
  const { box } = await centerOf(page, '#drag-card')
  return box
}

async function injectedDrag(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.__kinetic.drag?.position ?? { x: 0, y: 0 })
}

test.describe('elastic drag', () => {
  test('follows the pointer 1:1 and reports the drag phase', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    const { x: startX, y: startY } = await centerOf(page, '#drag-card')

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 60, startY + 10, { steps: 6 })
    await page.mouse.move(startX + 96, startY + 22, { steps: 6 })

    expect(await page.evaluate(() => window.__kinetic.drag.phase)).toBe('drag')
    const during = await injectedDrag(page)
    expect(during.x).toBeGreaterThan(60)

    await page.mouse.up()
    await expect.poll(async () => page.evaluate(() => window.__kinetic.drag.phase), { timeout: 6000 }).toBe('idle')
  })

  test('shows a live position readout', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { x: cx, y: cy } = await centerOf(page, '#drag-card')
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 70, cy, { steps: 8 })
    await expect(page.locator('#drag-pos')).not.toHaveText('x 0 · y 0')
    await page.mouse.up()
  })

  test('rubber-bands past the stage edge instead of passing through it', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { x: cx, y: cy } = await centerOf(page, '#drag-card')
    const stageBox = await page.locator('#drag-stage').boundingBox()

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    // Push far past the right edge of the stage.
    await page.mouse.move(stageBox!.x + stageBox!.width + 200, cy, { steps: 12 })
    const position = await injectedDrag(page)
    // Compressed by the rubber band: it moved, but nowhere near the pointer travel.
    expect(position.x).toBeGreaterThan(10)
    expect(position.x).toBeLessThan(400)
    await page.mouse.up()
  })

  test('returns to centre on demand', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { x: cx, y: cy } = await centerOf(page, '#drag-card')
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 80, cy + 20, { steps: 8 })
    await page.mouse.up()
    await page.click('#drag-reset')
    await expect
      .poll(async () => {
        const pos = await injectedDrag(page)
        return Math.abs(pos.x) + Math.abs(pos.y)
      }, { timeout: 6000 })
      .toBeLessThan(1.5)
  })

  test('aborts cleanly when the element disappears mid-drag', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { x: cx, y: cy } = await centerOf(page, '#drag-card')
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 80, cy + 40, { steps: 5 })
    expect(await page.evaluate(() => window.__kinetic.drag.phase)).toBe('drag')

    // The element is removed programmatically rather than by clicking a button:
    // a real click while the pointer is captured by the drag is suppressed on
    // purpose (a drag must not end as a click), so the button would never fire.
    await page.evaluate(() => document.querySelector('#drag-card')?.remove())
    await expect.poll(async () => page.evaluate(() => window.__kinetic.drag.phase)).toBe('idle')
    await expect(page.locator('#transition-log')).toContainText('detached')

    await page.mouse.up()
    await page.click('#drag-restore')
    await expect(page.locator('#drag-card')).toBeVisible()
  })
})
