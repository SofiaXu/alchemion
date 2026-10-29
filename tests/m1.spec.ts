import { expect, test } from '@playwright/test'

for (const [tag, mode] of [
  ['@workspace', 'basic'],
  ['@package', 'nested']
] as const) {
  test(`${tag} M1 render, Worker response and disposal`, async ({ page, browser }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.waitForFunction(() => !!window.m1)
    const result = await page.evaluate((input) => window.m1.run(input), mode)
    expect(result.count).toBe(1)
    expect(result.sourceCount).toBe(1)
    expect(await page.evaluate(() => window.m1.inputIsolation())).toBe(1)
    await expect(page.locator('output')).toHaveText('completed')
    await page.locator('canvas').click({ position: { x: 320, y: 240 } })
    await expect.poll(() => page.evaluate(() => window.m1.state.picked)).toBe('C1')
    await info.attach('render', { body: await page.screenshot(), contentType: 'image/png' })
    await info.attach('environment', {
      body: JSON.stringify({ browser: browser.version(), mode, ...result }),
      contentType: 'application/json'
    })
    await page.setViewportSize({ width: 1000, height: 750 })
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    expect(await page.evaluate(() => window.m1.dispose())).toBe(0)
    expect(await page.evaluate(() => window.m1.missingWebGL())).toContain('WEBGL2_UNAVAILABLE')
    expect(errors).toEqual([])
  })
}
