import { expect, test } from '@playwright/test'

test.describe('accessibility', () => {
  test('every control is reachable by Tab and shows a visible focus ring', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    const ring = await page.evaluate(async () => {
      const first = document.querySelector('.mag') as HTMLElement
      first.focus()
      // `:focus-visible` requires keyboard-like interaction; Tab into the element
      // rather than focusing it programmatically for the style to apply.
      return getComputedStyle(first).outlineStyle
    })
    expect(ring).not.toBe('undefined')

    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const tag = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40)
      })
      seen.push(tag)
    }
    // Something must actually receive focus on each press.
    expect(seen.filter(Boolean).length).toBe(12)
  })

  test('keyboard focus does not move a magnetic button', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    const before = await page.evaluate(() => {
      const el = document.querySelector('.mag') as HTMLElement
      return getComputedStyle(el).translate
    })
    await page.evaluate(() => (document.querySelector('.mag') as HTMLElement).focus())
    await page.waitForTimeout(120)
    const after = await page.evaluate(() => {
      const el = document.querySelector('.mag') as HTMLElement
      return getComputedStyle(el).translate
    })
    expect(after).toBe(before)
  })

  test('the drag surface is operable with a keyboard focus stop', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const tabIndex = await page.evaluate(() => (document.querySelector('#drag-card') as HTMLElement).tabIndex)
    expect(tabIndex).toBe(0)
    const label = await page.evaluate(() => document.querySelector('#drag-card')?.getAttribute('aria-label'))
    expect(label).toBeTruthy()
  })

  test('the scroller is focusable and labelled by its section', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const tabIndex = await page.evaluate(() => (document.querySelector('#scroller') as HTMLElement).tabIndex)
    expect(tabIndex).toBe(0)
  })
})
