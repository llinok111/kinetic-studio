/**
 * Visual verification.
 *
 * Two things are checked, because neither alone is enough:
 *
 *  1. **Pixels.** Screenshots are decoded in-process (zlib + PNG row unfiltering,
 *     no image library) and scored per 3×3 block. The metric is *local luminance
 *     dynamic range*, not ink coverage: a block of body text legitimately has 3–5%
 *     ink, which an ink-only check reports as "empty". Range < 12 means the block
 *     really is a flat colour.
 *  2. **DOM.** Geometry and interaction probes: no horizontal overflow, no
 *     zero-sized panels, drag actually moved the card, virtual scroll actually
 *     translated the content.
 *
 * Both run against the same artefact that ships (studio/ + engine/dist).
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
// `here` is engine/scripts: the project root is two levels up, not one.
const root = resolve(here, '..', '..')
const outDir = join(root, 'shots', 'verify')
const BASE = 'http://127.0.0.1:4399'

const CANDIDATES = [
  process.env.KINETIC_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome'
].filter(Boolean)

const executablePath = CANDIDATES.find((candidate) => existsSync(candidate))
if (!executablePath) {
  console.error('no browser found; set KINETIC_BROWSER')
  process.exit(2)
}

// ------------------------------------------------------------------ PNG decoding

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 8
  let colorType = 6
  let interlace = 0
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${bitDepth}, interlace ${interlace})`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0
  if (!channels) throw new Error(`unsupported colour type ${colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const rowIn = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const rowOut = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rowOut[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      let value = rowIn[x]
      switch (filter) {
        case 0: break
        case 1: value += a; break
        case 2: value += b; break
        case 3: value += (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default: throw new Error(`bad filter ${filter}`)
      }
      rowOut[x] = value & 0xff
    }
  }

  return { width, height, channels, pixels }
}

const luminance = (pixels, offset) =>
  0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]

function analyse(buffer) {
  const { width, height, channels, pixels } = decodePng(buffer)
  const stride = width * channels
  const blocks = []
  const colours = new Set()
  let ink = 0
  let total = 0
  let sum = 0

  // Background = the most common corner colour. Dark UIs with gradients would
  // poison a fixed "white is background" assumption.
  const corners = [
    0,
    (width - 1) * channels,
    (height - 1) * stride,
    (height - 1) * stride + (width - 1) * channels
  ]
  const bg = corners
    .map((offset) => luminance(pixels, offset))
    .sort((a, b) => a - b)[1] ?? 0

  const step = Math.max(1, Math.floor(Math.min(width, height) / 420))
  const rows = 3
  const cols = 3
  const ranges = Array.from({ length: rows * cols }, () => ({ min: 255, max: 0, n: 0 }))

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = y * stride + x * channels
      const lum = luminance(pixels, offset)
      total++
      sum += lum
      if (Math.abs(lum - bg) > 8) ink++
      if (colours.size < 4096) {
        colours.add((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2])
      }
      const r = Math.min(rows - 1, Math.floor((y / height) * rows))
      const c = Math.min(cols - 1, Math.floor((x / width) * cols))
      const cell = ranges[r * cols + c]
      if (lum < cell.min) cell.min = lum
      if (lum > cell.max) cell.max = lum
      cell.n++
    }
  }

  ranges.forEach((cell, index) => {
    blocks.push({
      row: Math.floor(index / cols),
      col: index % cols,
      dynamicRange: cell.n ? Math.round(cell.max - cell.min) : 0,
      empty: cell.n > 0 && cell.max - cell.min < 12
    })
  })

  return {
    width,
    height,
    inkRatio: Number((ink / Math.max(1, total)).toFixed(4)),
    meanLuminance: Math.round(sum / Math.max(1, total)),
    distinctColours: colours.size,
    emptyBlocks: blocks.filter((b) => b.empty).map((b) => `${b.row},${b.col}`),
    blocks
  }
}

// ------------------------------------------------------------------ server

function startServer() {
  const child = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs')], {
    env: { ...process.env, PORT: '4399' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return child
}

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('server did not start')
}

// ------------------------------------------------------------------ probes

async function domProbe(page) {
  return page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('main .panel'))
    return {
      panels: panels.length,
      zeroSized: panels.filter((el) => el.getBoundingClientRect().height < 60).length,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      effects: window.__kinetic?.engine.effectCount ?? 0,
      liveListeners: window.__kinetic?.probe.live ?? 0,
      fps: Math.round(window.__kinetic?.frameLoop.fps ?? 0)
    }
  })
}

/**
 * WCAG contrast of real rendered text.
 *
 * The screenshots confirm "something is drawn"; they cannot tell whether the
 * something is legible. Walking the ancestor chain for the first opaque
 * background and computing the ratio catches the classic dark-theme failure
 * (dark grey text that looked fine in the design tool).
 */
async function contrastProbe(page) {
  return page.evaluate(() => {
    const parse = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number)
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
    }
    const lum = ({ r, g, b }) => {
      const channel = (v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const ratio = (a, b) => {
      const l1 = lum(a)
      const l2 = lum(b)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }
    // A gradient is a `background-image`, so `backgroundColor` is transparent and
    // walking up to an opaque ancestor measures the wrong surface entirely — that
    // produced a false 1.06:1 "failure" on the amber primary button, which in
    // reality has dark text on a light gradient. Averaging the gradient's colour
    // stops is the closest thing to the rendered surface that is still exact.
    const gradientAverage = (image) => {
      if (!image || image === 'none' || !image.includes('gradient')) return null
      const stops = []
      const pattern = /rgba?\(([^)]+)\)/g
      let match
      while ((match = pattern.exec(image))) {
        const parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number)
        if (parts.length >= 3) stops.push({ r: parts[0], g: parts[1], b: parts[2], a: 1 })
      }
      if (stops.length === 0) return null
      const mean = (key) => Math.round(stops.reduce((sum, stop) => sum + stop[key], 0) / stops.length)
      return { r: mean('r'), g: mean('g'), b: mean('b'), a: 1 }
    }

    const backgroundOf = (el) => {
      let node = el
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node)
        const gradient = gradientAverage(style.backgroundImage)
        if (gradient) return gradient
        const bg = parse(style.backgroundColor)
        if (bg && bg.a >= 0.9) return bg
        node = node.parentElement
      }
      return { r: 20, g: 16, b: 13, a: 1 }
    }

    const selectors = ['h1', '.lede', '.panel__head p', '.mag', '.card__hint', '.footnotes li', '.mono', '.kicker']
    return selectors.map((selector) => {
      const el = document.querySelector(selector)
      if (!el) return { selector, missing: true }
      const fg = parse(getComputedStyle(el).color)
      const ratioValue = fg ? ratio(fg, backgroundOf(el)) : 0
      return { selector, ratio: Number(ratioValue.toFixed(2)), size: getComputedStyle(el).fontSize }
    })
  })
}

async function interactionProbe(page) {
  const card = page.locator('#drag-card')
  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 90, cy + 30, { steps: 8 })
  const phase = await page.evaluate(() => window.__kinetic.drag.phase)
  const pos = await page.evaluate(() => window.__kinetic.drag.position)
  await page.mouse.up()
  await page.waitForTimeout(900)

  await page.locator('[data-scroll-mode="virtual"]').click()
  const scroller = page.locator('#scroller')
  await scroller.scrollIntoViewIfNeeded()
  const sbox = await scroller.boundingBox()
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2)
  await page.mouse.wheel(0, 360)
  await page.waitForTimeout(700)
  const scrollPos = await page.evaluate(() => window.__kinetic.scroll.position)

  return {
    dragPhaseDuringMove: phase,
    dragOffsetX: Math.round(pos.x),
    virtualScrollPosition: Math.round(scrollPos)
  }
}

// ------------------------------------------------------------------ main

await mkdir(outDir, { recursive: true })
const server = startServer()
const report = { generatedAt: new Date().toISOString(), browser: executablePath, shots: [], probes: {}, failures: [] }

try {
  await waitForServer(BASE)
  const browser = await chromium.launch({ executablePath, headless: true })

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const page = await desktop.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(BASE + '/')
  await page.waitForFunction(() => Boolean(window.__kinetic))
  await page.waitForTimeout(500)

  report.probes.desktop = await domProbe(page)
  report.probes.contrast = await contrastProbe(page)
  for (const entry of report.probes.contrast) {
    if (entry.missing) continue
    // 4.5:1 for normal text, 3:1 for large text (WCAG AA).
    const large = Number.parseFloat(entry.size) >= 18.66
    const minimum = large ? 3 : 4.5
    if (entry.ratio < minimum) {
      report.failures.push(`contrast ${entry.selector} = ${entry.ratio} (needs ${minimum})`)
    }
  }
  if (errors.length) report.failures.push(...errors.map((e) => `console: ${e}`))

  const shots = [
    { name: '01-desktop-full', fullPage: true },
    { name: '02-magnetic', clip: '#panel-magnetic' },
    { name: '03-drag', clip: '#panel-drag' },
    { name: '04-scroll', clip: '#panel-scroll' },
    { name: '05-machine', clip: '#panel-machine' }
  ]

  for (const shot of shots) {
    const buffer = shot.clip
      ? await page.locator(shot.clip).screenshot()
      : await page.screenshot({ fullPage: shot.fullPage === true })
    const file = join(outDir, `${shot.name}.png`)
    await writeFile(file, buffer)
    const stats = analyse(buffer)
    report.shots.push({ name: shot.name, bytes: buffer.length, ...stats })
    if (stats.emptyBlocks.length === 5) report.failures.push(`${shot.name}: 5+ empty blocks, likely blank`)
  }

  report.probes.interaction = await interactionProbe(page)
  if (report.probes.interaction.dragPhaseDuringMove !== 'drag') {
    report.failures.push(`drag did not enter "drag" phase (got ${report.probes.interaction.dragPhaseDuringMove})`)
  }
  if (Math.abs(report.probes.interaction.dragOffsetX) < 40) {
    report.failures.push(`drag barely moved (${report.probes.interaction.dragOffsetX}px)`)
  }
  if (report.probes.interaction.virtualScrollPosition < 100) {
    report.failures.push(`virtual scroll did not move (${report.probes.interaction.virtualScrollPosition}px)`)
  }

  await page.screenshot({ path: join(outDir, '06-drag-mid.png') })
  report.shots.push({ name: '06-drag-mid', ...analyse(await page.screenshot()) })

  // Mobile pass: 390×844, touch emulation.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2
  })
  const mpage = await mobile.newPage()
  await mpage.goto(BASE + '/')
  await mpage.waitForFunction(() => Boolean(window.__kinetic))
  await mpage.waitForTimeout(500)
  report.probes.mobile = await domProbe(mpage)
  const mobileShot = await mpage.screenshot({ fullPage: true })
  await writeFile(join(outDir, '07-mobile-full.png'), mobileShot)
  report.shots.push({ name: '07-mobile-full', bytes: mobileShot.length, ...analyse(mobileShot) })
  if (report.probes.mobile.horizontalOverflow > 1) {
    report.failures.push(`mobile horizontal overflow: ${report.probes.mobile.horizontalOverflow}px`)
  }

  // Reduced motion pass.
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const rpage = await reduced.newPage()
  await rpage.goto(BASE + '/')
  await rpage.waitForFunction(() => Boolean(window.__kinetic))
  const policy = await rpage.evaluate(() => window.__kinetic.engine.motionPolicy)
  report.probes.reducedMotion = policy
  if (policy.allowInertia || policy.allowMagnetism || policy.allowTrail) {
    report.failures.push('reduced motion policy did not disable automatic movement')
  }
  const rShot = await rpage.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 900 } })
  await writeFile(join(outDir, '08-reduced-motion.png'), rShot)
  report.shots.push({ name: '08-reduced-motion', bytes: rShot.length, ...analyse(rShot) })

  await browser.close()
} finally {
  server.kill()
}

await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')

console.log('shots →', outDir)
for (const shot of report.shots) {
  console.log(
    `  ${shot.name.padEnd(20)} ${String(shot.width).padStart(5)}×${String(shot.height).padEnd(5)} ` +
      `ink ${(shot.inkRatio * 100).toFixed(1)}%  colours ${String(shot.distinctColours).padStart(4)}  ` +
      `empty ${shot.emptyBlocks.length}`
  )
}
console.log('probes →', JSON.stringify(report.probes, null, 2))
if (report.failures.length) {
  console.error('FAILURES:')
  for (const failure of report.failures) console.error('  -', failure)
  process.exit(1)
}
console.log('visual verification OK')
