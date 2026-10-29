import { test, expect } from '@playwright/test'

test('@package M4 public APIs, production Worker and historical input regression', async ({
  page,
  browser
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => !!window.m4Package)
  const result = await page.evaluate(() => window.m4Package.run())
  expect(result.revision).toBe(3)
  expect(result.editedRevision).toBe(1)
  expect(result.controllerStatus).toBe('ready')
  expect(result.noCanvasBeforeLegacy).toBe(true)
  expect(result.canvases).toBe(0)
  expect(result.sourceId.length).toBeGreaterThan(0)
  await expect(page.locator('output')).toHaveText('passed')
  expect(errors).toEqual([])
  await info.attach('environment', {
    body: JSON.stringify({ browser: browser.version(), ...result }),
    contentType: 'application/json'
  })
})
