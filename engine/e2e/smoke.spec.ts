import { expect, test } from '@playwright/test'

test.describe('workbench smoke', () => {
  test('loads without console errors or page errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('renders all seven panels', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('main .panel')).toHaveCount(7)
    for (const id of ['magnetic', 'trail', 'drag', 'scroll', 'gestures', 'machine', 'edge']) {
      await expect(page.locator(`#panel-${id}`)).toBeVisible()
    }
  })

  test('populates the capability readout', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#cap-pointer')).not.toHaveText('—')
    await expect(page.locator('#cap-dpr')).not.toHaveText('—')
    await expect(page.locator('#cap-fps')).toContainText('fps')
    await expect(page.locator('#cap-listeners')).not.toHaveText('—')
  })

  test('creates exactly one engine instance', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const count = await page.evaluate(() => window.__kinetic.engine.effectCount)
    // magnetic ×6 + trail + drag + scroll + gestures
    expect(count).toBeGreaterThanOrEqual(10)
  })

  test('no horizontal overflow at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
