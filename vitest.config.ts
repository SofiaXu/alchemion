import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/alchemion/src/**/__tests__/**/*.test.ts'],
    maxWorkers: 4,
    retry: 0
  }
})
