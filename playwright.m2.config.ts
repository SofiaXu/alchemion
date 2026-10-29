import { defineConfig } from '@playwright/test'

const software =
  process.env.M2_FUNCTIONAL_SOFTWARE === '1' || (process.env.CI && process.platform === 'linux')

export default defineConfig({
  testDir: './tests/renderer-selection',
  testMatch: 'm2.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: software ? 300000 : 180000,
  expect: { timeout: software ? 30000 : 5000 },
  use: {
    baseURL: process.env.M2_BASE_URL ?? 'http://127.0.0.1:4175',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    trace: software ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: ['chromium', 'firefox', 'webkit'].map((name) => ({
    name,
    use: {
      browserName: name as 'chromium' | 'firefox' | 'webkit',
      headless: true,
      ...(name === 'chromium'
        ? {
            channel: 'chromium',
            launchOptions: {
              args:
                process.env.M2_FUNCTIONAL_SOFTWARE === '1' ||
                (process.env.CI && process.platform === 'linux')
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
    ['json', { outputFile: '.tmp/m2-correctness.json' }]
  ]
})
