import { expect, test } from '@playwright/test'
import { candidates } from './candidates'
import type { DisplayMode } from './contracts'
import type { ComparisonApi } from './host/boot'

// New coverage is limited to M2: M1 has no instance/source IDs, controlled stale
// Worker replies, two independent viewers, or instrumented resource ownership.
for (const candidate of candidates) {
  for (const mode of ['space-filling', 'ball-and-stick'] as DisplayMode[]) {
    test(`@m2 ${candidate} ${mode}: display, pointer IDs, Worker and isolation`, async ({
      page,
      browser
    }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.goto('/')
      await page.waitForFunction(() => !!window.m2)
      const loaded = await page.evaluate(([engine, display]) => window.m2.load(engine, display), [
        candidate,
        mode
      ] as const)
      expect(loaded.fixture.atoms).toBe(10000)
      expect(loaded.fixture.bonds).toBe(20000)
      expect(loaded.fixture.hash).toMatch(/^[0-9a-f]{64}$/)
      expect(loaded.stats.atoms).toBe(10000)
      expect(loaded.stats.bonds).toBe(mode === 'ball-and-stick' ? 20000 : 0)
      expect(loaded.environment.webgl2).toBe(true)
      const targets = await page.evaluate(() => window.m2.targets(8))
      for (const target of targets) {
        await page.mouse.click(target.x, target.y)
        const selection = await page.evaluate(() => window.m2.selection())
        expect(selection.pick).toEqual(target.expected)
        expect(selection.pick!.instanceId).not.toBe(selection.pick!.sourceId)
      }
      // Exercise the new dirty-buffer path before expensive benchmark sampling.
      const update = await page.evaluate(() => window.m2.updates(1))
      expect(update.correct).toBe(true)
      expect(update.dirtyAtomCounts).toEqual([100])
      expect(update.dirtyBondCounts[0]).toBeGreaterThan(0)
      expect(await page.evaluate(() => window.m2.updateProbe())).toMatchObject({ correct: true })
      expect(await page.evaluate(() => window.m2.visibility())).toMatchObject({ visible: true })
      await info.attach('render', { body: await page.screenshot(), contentType: 'image/png' })
      await page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('#comparison')!
        container.style.width = '960px'
        container.style.height = '540px'
      })
      await expect(page.locator('#comparison canvas')).toHaveAttribute('width', '960')
      await expect(page.locator('#comparison canvas')).toHaveAttribute('height', '540')
      await page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('#comparison')!
        container.style.width = '1920px'
        container.style.height = '1080px'
      })
      await expect(page.locator('#comparison canvas')).toHaveAttribute('width', '1920')
      const worker = await page.evaluate(
        ([engine, display]) => window.m2.correctness(engine, display),
        [candidate, mode] as const
      )
      expect(worker.correct).toBe(true)
      expect(worker.staleReplies).toBeGreaterThanOrEqual(4)
      expect(worker.releasedA.gpuObjects).toBe(0)
      expect(worker.releasedB.workers).toBe(0)
      expect(await page.locator('canvas').count()).toBe(0)
      await info.attach('environment-and-correctness', {
        body: JSON.stringify({ browser: browser.version(), ...loaded, worker }),
        contentType: 'application/json'
      })
      expect(errors).toEqual([])
    })
  }
}

// Ensure the browser API remains type-checked even though tests invoke it across
// Playwright's serialized evaluation boundary.
export type M2BrowserApi = ComparisonApi
