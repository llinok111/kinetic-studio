import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

/**
 * Browser selection.
 *
 * `channel: 'msedge'` hangs on this machine — Playwright performs a registry
 * lookup that never resolves — so the executable is resolved explicitly instead.
 * `KINETIC_BROWSER` lets CI point at a bundled Chromium without editing this file.
 */
const CANDIDATES = [
  process.env.KINETIC_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean) as string[]

const executablePath = CANDIDATES.find((candidate) => existsSync(candidate))

export default defineConfig({
  testDir: './e2e',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: 'off',
    screenshot: 'off',
    launchOptions: executablePath ? { executablePath } : {}
  },
  webServer: {
    command: 'node ../scripts/serve.mjs',
    url: 'http://127.0.0.1:4321/',
    reuseExistingServer: true,
    timeout: 25_000
  }
})
