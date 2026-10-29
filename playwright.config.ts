import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'm1.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 60000,
  use: {
    baseURL: process.env.M1_BASE_URL ?? 'http://127.0.0.1:4174',
    viewport: { width: 900, height: 700 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: ['chromium', 'firefox', 'webkit'].map((name) => ({
    name,
    use: {
      browserName: name as 'chromium' | 'firefox' | 'webkit',
      // Linux CI runs under Xvfb/Mesa; these are functional checks, not GPU benchmarks.
      headless: !(process.env.CI && process.platform === 'linux'),
      ...(process.env.CI && name === 'chromium'
        ? {
            launchOptions: {
              args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
            }
          }
        : {})
    }
  })),
  reporter: [['list'], ['html', { open: 'never' }]]
})
