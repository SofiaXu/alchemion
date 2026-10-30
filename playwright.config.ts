import { defineConfig } from '@playwright/test'
import { browserProjects, reporters } from './tests/shared/playwright'

const kind = process.env.ALCHEMION_REPORT_KIND ?? 'browser'
if (!['browser', 'dev'].includes(kind)) throw new Error(`Unsupported demo report kind: ${kind}`)

export default defineConfig({
  testDir: './tests',
  testMatch: 'demo.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: `test-results/demo-${kind}`,
  use: {
    baseURL: process.env.ALCHEMION_TEST_BASE_URL ?? 'http://127.0.0.1:4178/',
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: browserProjects(true),
  reporter: reporters(`demo-${kind}`)
})
