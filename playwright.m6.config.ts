import { defineConfig } from '@playwright/test'

const kind = process.env.M6_REPORT_KIND ?? 'browser'
export default defineConfig({
  testDir: './tests',
  testMatch: ['m6.spec.ts', 'package-m6.spec.ts'],
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: `test-results/m6-${kind}`,
  use: {
    baseURL: process.env.M6_BASE_URL ?? 'http://127.0.0.1:4178/',
    viewport: { width: 1440, height: 1000 },
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
    ['html', { open: 'never', outputFolder: `playwright-report/m6-${kind}` }],
    ['json', { outputFile: `.tmp/m6-${kind}.json` }]
  ]
})
