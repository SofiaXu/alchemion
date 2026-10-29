import { defineConfig } from '@playwright/test'

// Package validation follows workspace validation in the same delivery. Keep
// their reports separate so the later consumer cannot overwrite the evidence.
const reportKind = process.argv.some((arg) => arg.includes('@package')) ? 'package' : 'browser'

export default defineConfig({
  testDir: './tests',
  testMatch: ['m5.spec.ts', 'package-m5.spec.ts'],
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.M5_BASE_URL ?? 'http://127.0.0.1:4177',
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: ['chromium', 'firefox', 'webkit'].map((browserName) => ({
    name: browserName,
    use: {
      browserName: browserName as 'chromium' | 'firefox' | 'webkit',
      ...(browserName === 'chromium'
        ? {
            channel: 'chromium',
            launchOptions: {
              args: process.env.CI
                ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
                : ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
            }
          }
        : {})
    }
  })),
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: `.tmp/m5-${reportKind}.json` }]
  ]
})
