import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: ['m4.spec.ts', 'package-m4.spec.ts'],
  fullyParallel: true,
  workers: Number(process.env.TEST_WORKERS ?? 4),
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: process.env.M4_BASE_URL ?? 'http://127.0.0.1:4176',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: ['chromium', 'firefox', 'webkit'].map((browserName) => ({
    name: browserName,
    use: {
      browserName: browserName as 'chromium' | 'firefox' | 'webkit',
      ...(process.env.CI && browserName === 'chromium'
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
