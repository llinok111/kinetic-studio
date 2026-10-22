import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    environmentOptions: {
      jsdom: { pretendToBeVisual: true }
    },
    restoreMocks: true,
    clearMocks: true
  }
})
