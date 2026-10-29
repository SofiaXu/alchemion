import { test, expect } from '@playwright/test'

test('@package M5 installed declarations, production Worker, viewer, picking and history', async ({
  page,
  browser
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => !!window.m5Package)
  const result = await page.evaluate(() => window.m5Package.run())
  expect(result).toMatchObject({
    revision: 3,
    status: 'ready',
    element: 'O',
    noCanvasBeforeViewer: true
  })
  const canvas = page.locator('canvas')
  await canvas.click({ position: { x: 320, y: 240 } })
  await expect.poll(() => page.evaluate(() => window.m5Package.selection())).toBe(result.sourceId)
  expect(await page.evaluate(() => window.m5Package.finish())).toBe(0)
  await expect(page.locator('output')).toHaveText('passed')
  expect(errors).toEqual([])
  await info.attach('environment', {
    body: JSON.stringify({ browser: browser.version(), ...result }),
    contentType: 'application/json'
  })
})
