import { expect, test } from '@playwright/test'

test.describe('edge cases', () => {
  test('50 mount/unmount cycles leak nothing', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('#edge-cycle')
    await expect(page.locator('#edge-output')).toContainText('无泄漏', { timeout: 20_000 })
  })

  test('pointercancel aborts without inertia', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('#edge-cancel')
    await expect(page.locator('#edge-output')).toContainText('中止且未进入惯性')
  })

  test('three simultaneous pointers do not corrupt the drag', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('#edge-multi')
    await expect(page.locator('#edge-output')).toContainText('pointerId')
    // After the synthetic sequence the machine must be back to a resting state.
    await expect.poll(async () => page.evaluate(() => window.__kinetic.drag.phase)).toBe('idle')
  })

  test('visibilitychange does not wedge the frame loop', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('#edge-hidden')
    await expect(page.locator('#edge-output')).toContainText('frameLoop.running')
  })

  test('the demo still works after the element is detached and restored', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('#drag-detach')
    await page.click('#drag-restore')

    const box = await page.locator('#drag-card').boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + 90, box!.y + 30, { steps: 6 })
    expect(await page.evaluate(() => window.__kinetic.drag.phase)).toBe('drag')
    await page.mouse.up()
  })
})
