import { expect, test } from '@playwright/test'
import { centerOf } from './helpers'

test.describe('gestures', () => {
  test('mouse click produces a tap', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.locator('#gesture-pad').click({ position: { x: 60, y: 60 } })
    await expect(page.locator('#gesture-echo')).toHaveText('tap')
  })

  test('long press fires only after the dwell time', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { x: cx, y: cy } = await centerOf(page, '#gesture-pad')

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.waitForTimeout(220)
    await expect(page.locator('#gesture-echo')).not.toHaveText('longPress')
    await page.waitForTimeout(420)
    await expect(page.locator('#gesture-echo')).toHaveText('longPress')
    await page.mouse.up()
  })

  test('a fast horizontal drag reports a swipe, not a tap', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { box } = await centerOf(page, '#gesture-pad')

    await page.mouse.move(box.x + 40, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 84, { steps: 3 })
    await page.mouse.up()

    await expect(page.locator('#gesture-echo')).toContainText('swipe')
    await expect(page.locator('#gesture-echo')).toContainText('right')
  })

  test('logs every recognised gesture', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    await page.locator('#gesture-pad').click({ position: { x: 60, y: 60 } })
    await expect(page.locator('#gesture-echo')).toHaveText('tap')
    await expect(page.locator('#gesture-log li')).toHaveCount(1)

    const { x: cx, y: cy } = await centerOf(page, '#gesture-pad')
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.up()

    await expect(page.locator('#gesture-echo')).toHaveText('longPress')
    await expect(page.locator('#gesture-log li')).toHaveCount(2)
  })

  test('withholds the single tap when a second tap follows', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    // Two pointer pairs dispatched back to back. Playwright's own `dblclick`
    // inserts a round-trip delay between clicks, which can exceed the 320 ms
    // double-tap window on a loaded machine and turn the test into a coin flip.
    await page.evaluate(() => {
      const pad = document.querySelector('#gesture-pad') as HTMLElement
      const fire = (type: string) =>
        pad.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: 70,
            clientY: 70,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            buttons: type === 'pointerup' ? 0 : 1
          })
        )
      for (const pair of [0, 1]) {
        void pair
        fire('pointerdown')
        fire('pointerup')
      }
    })

    await expect(page.locator('#gesture-echo')).toHaveText('doubleTap')
    await expect(page.locator('#gesture-log li')).toHaveCount(1)
  })

  test('pinch is reported as a scale factor', async ({ page, browser }) => {
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 900, height: 900 } })
    const page2 = await context.newPage()
    await page2.goto('/')
    await page2.waitForFunction(() => Boolean(window.__kinetic))

    // Synthesise two-pointer pinch; Playwright has no multi-touch gesture API.
    await page2.evaluate(() => {
      const pad = document.querySelector('#gesture-pad') as HTMLElement
      const rect = pad.getBoundingClientRect()
      const make = (type: string, id: number, x: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 1,
          clientX: x,
          clientY: rect.top + 60,
          buttons: type === 'pointerup' ? 0 : 1
        })
      const base = rect.left + 100
      pad.dispatchEvent(make('pointerdown', 1, base))
      pad.dispatchEvent(make('pointerdown', 2, base + 80))
      pad.dispatchEvent(make('pointermove', 1, base - 60))
      pad.dispatchEvent(make('pointermove', 2, base + 140))
    })
    await expect(page2.locator('#gesture-echo')).toContainText('pinch')
    await context.close()
  })
})
