import { expect, test } from '@playwright/test'
import { centerOf } from './helpers'

/** Read the number the engine wrote through the independent `translate` property. */
async function translateOf(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement
    const value = getComputedStyle(el).translate
    if (!value || value === 'none') return { x: 0, y: 0 }
    const [x, y] = value.split(' ').map((part) => Number.parseFloat(part))
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
  }, selector)
}

test.describe('magnetic', () => {
  test('leans toward a pointer near its edge and returns on leave', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    // Enter near the right edge so the displacement is unambiguous (at the centre
    // the offset is zero by definition and would prove nothing).
    const { box } = await centerOf(page, '.mag--primary')
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2)

    await expect
      .poll(async () => (await translateOf(page, '.mag--primary')).x, { timeout: 4000 })
      .toBeGreaterThan(2)

    const phase = await page.evaluate(() => window.__kinetic.magnets.get(document.querySelector('.mag--primary'))?.phase)
    expect(phase).toBe('hover')

    // Leave the radius: the spring returns to the rest position.
    await page.mouse.move(5, 5)
    await expect
      .poll(async () => Math.abs((await translateOf(page, '.mag--primary')).x), { timeout: 4000 })
      .toBeLessThan(0.6)
  })

  test('does not move while a button is held', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { box } = await centerOf(page, '.mag--primary')
    await page.mouse.move(box.x + box.width - 6, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 10, box.y + box.height / 2)
    await expect
      .poll(async () => Math.abs((await translateOf(page, '.mag--primary')).x), { timeout: 3000 })
      .toBeLessThan(0.6)
    await page.mouse.up()
  })

  test('writes through `translate`, leaving the author transform intact', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { box } = await centerOf(page, '.mag:nth-of-type(2)')
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2)
    await expect.poll(async () => (await translateOf(page, '.mag')).x, { timeout: 4000 }).not.toBeNaN()
    const style = await page.evaluate(() => {
      const el = document.querySelectorAll('.mag')[1] as HTMLElement
      return { inlineTransform: el.style.transform, inlineTranslate: el.style.translate }
    })
    // The engine must not have stamped a transform over the element's own styles.
    expect(style.inlineTransform).toBe('')
    expect(style.inlineTranslate).not.toBe('')
  })
})
