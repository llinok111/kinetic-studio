import { expect, test } from '@playwright/test'
import { centerOf } from './helpers'

function contentTranslate(): string {
  const el = document.querySelector('#scroller-content') as HTMLElement
  return getComputedStyle(el).transform
}

async function scrollOffset(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const el = document.querySelector('#scroller-content') as HTMLElement
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return matrix.m42
  })
}

test.describe('inertial scroll', () => {
  test('native mode leaves the wheel alone and lets the browser scroll', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await expect(page.locator('#scroll-mode-badge')).toHaveText('native')

    const { x, y } = await centerOf(page, '#scroller')
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, 400)

    await expect
      .poll(async () => page.evaluate(() => (document.querySelector('#scroller') as HTMLElement).scrollTop), {
        timeout: 4000
      })
      .toBeGreaterThan(0)
  })

  test('virtual mode takes over the wheel and moves the content', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('[data-scroll-mode="virtual"]')
    await expect(page.locator('#scroll-mode-badge')).toHaveText('virtual')

    const { x, y } = await centerOf(page, '#scroller')
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, 320)

    await expect.poll(async () => scrollOffset(page), { timeout: 5000 }).toBeLessThan(-100)
    expect(await page.evaluate(contentTranslate)).not.toBe('none')
  })

  test('virtual mode snaps to a section boundary', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('[data-scroll-mode="virtual"]')

    const { x, y } = await centerOf(page, '#scroller')
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, 120)

    // Sections are one viewport (280 px) apart; mandatory snapping must land on a
    // multiple of that rather than wherever the accumulated delta stopped.
    await expect
      .poll(async () => {
        const offset = await scrollOffset(page)
        return Math.abs(offset % 280)
      }, { timeout: 6000 })
      .toBeLessThan(2)
  })

  test('keyboard paging still works in virtual mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('[data-scroll-mode="virtual"]')
    await page.locator('#scroller').focus()
    await page.keyboard.press('PageDown')
    await expect.poll(async () => scrollOffset(page), { timeout: 5000 }).toBeLessThan(-200)
  })

  test('focusing an off-screen field brings it into view', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('[data-scroll-mode="virtual"]')
    await page.locator('#scroller').focus()

    // Scroll to the very end first, so the field is guaranteed to be above the
    // viewport. Focusing something that is already visible must not scroll at all,
    // which is why the starting state has to be arranged deliberately.
    await page.keyboard.press('End')
    await expect.poll(async () => scrollOffset(page), { timeout: 5000 }).toBeLessThan(-500)

    await page.evaluate(() => (document.querySelector('#scroller input') as HTMLInputElement).focus())

    await expect
      .poll(async () => page.evaluate(() => {
        const viewport = document.querySelector('#scroller')!.getBoundingClientRect()
        const field = document.querySelector('#scroller input')!.getBoundingClientRect()
        return field.top >= viewport.top - 1 && field.bottom <= viewport.bottom + 1
      }), { timeout: 5000 })
      .toBe(true)
  })

  test('reports the position readout', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('[data-scroll-mode="virtual"]')
    const { x, y } = await centerOf(page, '#scroller')
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, 300)
    await expect(page.locator('#scroll-pos')).not.toHaveText(/^0 \//)
  })
})
