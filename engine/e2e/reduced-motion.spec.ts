import { expect, test } from '@playwright/test'
import { centerOf, parseTranslate } from './helpers'

/**
 * `test.use({ reducedMotion: 'reduce' })` did not reach `window.matchMedia` in
 * this Chromium build (verified with a standalone probe), so the preference is
 * emulated explicitly on the page before every navigation. The assertion below
 * re-checks the media query itself, so a silent no-op cannot pass as a green test.
 */
test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('the emulated media query is actually in effect', async ({ page }) => {
    await page.goto('/')
    const matches = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    expect(matches).toBe(true)
  })

  test('reports the preference and disables decorative motion', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))

    await expect(page.locator('#cap-motion')).toHaveText('减少')

    const policy = await page.evaluate(() => window.__kinetic.engine.motionPolicy)
    expect(policy.reduced).toBe(true)
    expect(policy.allowInertia).toBe(false)
    expect(policy.allowMagnetism).toBe(false)
    expect(policy.allowTrail).toBe(false)

    await expect(page.locator('#trail-state')).toContainText('已关闭')
  })

  test('magnetic buttons do not move, but keep a visible affordance', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { box } = await centerOf(page, '.mag--primary')
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2)

    const state = await page.evaluate(() => {
      const el = document.querySelector('.mag--primary') as HTMLElement
      return {
        translate: getComputedStyle(el).translate,
        attribute: el.getAttribute('data-kinetic-magnetic')
      }
    })
    const offset = parseTranslate(state.translate)
    expect(Math.abs(offset.x) + Math.abs(offset.y)).toBeLessThan(0.5)
    expect(state.attribute).toBe('reduced')
  })

  test('a drag lands immediately instead of coasting', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    const { x: cx, y: cy } = await centerOf(page, '#drag-card')

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 120, cy + 40, { steps: 4 })
    await page.mouse.up()

    const phases = await page.evaluate(async () => {
      const seen: string[] = []
      for (let i = 0; i < 12; i++) {
        seen.push(window.__kinetic.drag.phase)
        await new Promise((r) => setTimeout(r, 16))
      }
      return seen
    })
    expect(phases).not.toContain('inertia')
    expect(phases.at(-1)).toBe('idle')
  })

  test('virtual scrolling is refused and native scroll is used instead', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__kinetic))
    await page.click('[data-scroll-mode="virtual"]')
    await expect(page.locator('#scroll-mode-badge')).toHaveText('native')
  })

  test('the demo stylesheet honours the CSS media query', async ({ page }) => {
    await page.goto('/')
    const duration = await page.evaluate(() => getComputedStyle(document.querySelector('.card')!).transitionDuration)
    // `0.001ms` is serialised as `1e-06s` by Chromium.
    expect(['0s', '0.001ms', '0.0001s', '1e-06s']).toContain(duration)
  })
})
