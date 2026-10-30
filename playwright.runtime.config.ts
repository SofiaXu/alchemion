import { defineConfig } from '@playwright/test'
import { browserProjects, reporters } from './tests/shared/playwright'

export default defineConfig({
  testDir: './tests',
  testMatch: 'runtime.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 30000,
  outputDir: 'test-results/runtime-browser',
  use: {
    baseURL: process.env.ALCHEMION_TEST_BASE_URL ?? 'http://127.0.0.1:4176',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: browserProjects(),
  reporter: reporters('runtime-browser')
})
