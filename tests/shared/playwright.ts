import type { PlaywrightTestConfig } from '@playwright/test'

const softwareChromium = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader'
]

export function browserProjects(hardwareChromium = false): PlaywrightTestConfig['projects'] {
  return (['chromium', 'firefox', 'webkit'] as const).map((browserName) => ({
    name: browserName,
    use: {
      browserName,
      ...(hardwareChromium && browserName === 'chromium' ? { channel: 'chromium' } : {}),
      ...(browserName === 'chromium' && (hardwareChromium || process.env.CI)
        ? {
            launchOptions: {
              args: process.env.CI
                ? softwareChromium
                : ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
            }
          }
        : {})
    }
  }))
}

export function reporters(name: string): PlaywrightTestConfig['reporter'] {
  return [
    ['list'],
    ['html', { open: 'never', outputFolder: `playwright-report/${name}` }],
    ['json', { outputFile: `.tmp/${name}.json` }]
  ]
}
