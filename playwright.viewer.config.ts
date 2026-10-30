import { defineConfig } from '@playwright/test'
import { browserProjects, reporters } from './tests/shared/playwright'

export default defineConfig({
  testDir: './tests',
  testMatch: 'viewer.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: 'test-results/viewer-browser',
  use: {
    baseURL: process.env.ALCHEMION_TEST_BASE_URL ?? 'http://127.0.0.1:4177',
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: browserProjects(true),
  reporter: reporters('viewer-browser')
})
