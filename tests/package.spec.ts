import { expect, test } from '@playwright/test'

const zero = { gpuObjects: 0, workers: 0, rafs: 0, observers: 0, listeners: 0, canvases: 0 }
test('@package @features new scientific, format and viewer APIs work from the installed tarball', async ({
  page
}) => {
  const errors: string[] = [],
    workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto('./')
  await page.waitForFunction(() => !!window.consumerHarness, undefined, { polling: 50 })
  const result = await page.evaluate(() => window.consumerHarness.features())
  expect(result).toMatchObject({
    sourceCount: 2,
    sourceCountPure: 2,
    mapped: 2,
    selected: 2,
    coordination: 6,
    workerCounts: [6, 6],
    restored: true,
    revisionUnchanged: true,
    width: 96,
    height: 64,
    mime: 'image/png',
    imports: zero,
    released: zero
  })
  expect(workers).toHaveLength(1)
  expect(new URL(workers[0]).pathname).toMatch(/^\/installed\/nested\/assets\/computation-worker-/)
  expect(errors).toEqual([])
})
test('@package headless public APIs, transactions, Worker equivalence and periodic exports', async ({
  page,
  browser
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await page.waitForFunction(() => !!window.consumerHarness, undefined, { polling: 50 })
  const result = await page.evaluate(() => window.consumerHarness.headless())
  expect(result.importResources).toEqual(zero)
  expect(result.sourceId.length).toBeGreaterThan(0)
  expect(result.editedRevision).toBe(1)
  expect(result.revision).toBe(3)
  expect(result.workerEqualsSync).toBe(true)
  expect(result.controllerStatus).toBe('ready')
  expect(result.controllerElement).toBe('C')
  expect(result.controllerCanRedo).toBe(true)
  expect(result.poscarDirect).toBe(true)
  expect(result.cif2Exported).toBe(true)
  expect(result.canvases).toBe(0)
  expect(result.released).toEqual(zero)
  expect(errors).toEqual([])
  await expect(page.locator('output')).toHaveText('passed')
  await info.attach('headless-consumer', {
    body: JSON.stringify({ browser: browser.version(), ...result }),
    contentType: 'application/json'
  })
})

test('@package isolated public entries, nested Worker, two viewers and twenty lifecycles', async ({
  page,
  browser
}, info) => {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto(process.env.ALCHEMION_TRACE_RAFS === '1' ? './?trace-rafs=1' : './')
  // Frame polling itself schedules a global RAF in Firefox while dynamic
  // imports are pending. Timer polling leaves the resource probe unpolluted.
  await page.waitForFunction(() => !!window.consumerHarness, undefined, { polling: 50 })
  const result = await page.evaluate(() => window.consumerHarness.run())
  await info.attach('import-resource-origins', {
    body: JSON.stringify({ resources: result.importResources, rafs: result.importRafDetails }),
    contentType: 'application/json'
  })
  expect(result.importResources).toEqual(zero)
  expect(result.first).toEqual({ revision: 3, status: 'ready', element: 'O' })
  expect(result.second).toEqual({ element: 'Cl', cameraUnchanged: true, separateDocument: true })
  expect(result.exportedV3000).toBe(true)
  expect(result.importedElement).toBe('O')
  expect(result.live.workers).toBe(2)
  for (const [selector, key, id] of [
    ['#first canvas', 'first', 'first-atom'],
    ['#second canvas', 'second', 'second-atom']
  ] as const) {
    const canvas = page.locator(selector)
    const size = (await canvas.boundingBox())!
    await canvas.click({ position: { x: size.width / 2, y: size.height / 2 } })
    await expect
      .poll(() => page.evaluate((value) => window.consumerHarness.selection()[value], key))
      .toBe(id)
  }
  const remaining = await page.evaluate(() => window.consumerHarness.removeFirst())
  expect(remaining.secondReady).toBe('ready')
  expect(remaining.resources).toMatchObject({ workers: 1, canvases: 1 })
  await page.locator('#second canvas').click({ position: { x: 200, y: 180 } })
  expect((await page.evaluate(() => window.consumerHarness.selection())).second).toBe('second-atom')
  const released = await page.evaluate(() => window.consumerHarness.finish())
  expect(released.cycles).toHaveLength(20)
  for (const cycle of released.cycles) {
    expect(cycle.before.workers).toBe(1)
    expect(cycle.before.gpuObjects).toBeGreaterThan(0)
    expect(cycle.after).toEqual(zero)
  }
  expect(released.resources).toEqual(zero)
  expect(workers).toHaveLength(22)
  expect(
    workers.every((url) =>
      new URL(url).pathname.startsWith('/installed/nested/assets/computation-worker-')
    )
  ).toBe(true)
  expect(errors).toEqual([])
  await expect(page.locator('output')).toHaveText('passed')
  await info.attach('consumer-and-resource-evidence', {
    body: JSON.stringify({ browser: browser.version(), result, workers, released }),
    contentType: 'application/json'
  })
})
