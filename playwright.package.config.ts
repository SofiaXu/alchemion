import { defineConfig } from '@playwright/test'
import { browserProjects, reporters } from './tests/shared/playwright'

export default defineConfig({
  testDir: './tests',
  testMatch: 'package.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: 'test-results/package-browser',
  use: {
    baseURL: process.env.ALCHEMION_TEST_BASE_URL ?? 'http://127.0.0.1:4179/installed/nested/',
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: browserProjects(true),
  reporter: reporters('package-browser')
})
