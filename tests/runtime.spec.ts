import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.runtimeHarness))
})

test('@workspace @features coordination uses the real Worker, agrees with sync and drops the old revision', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const result = await page.evaluate(() => window.runtimeHarness.coordinationTask())
  expect(result.old).toBe('AbortError')
  expect(result.revision).toBe(1)
  expect(result.equal).toBe(true)
  expect(result.count).toBe(6)
  expect(result.volume).toBeCloseTo(32 / 3, 8)
  expect(result.canvases).toBe(0)
  expect(errors).toEqual([])
})

test('@workspace public sync/worker scientific tasks agree without WebGL', async ({
  page,
  browser
}, info) => {
  const result = await page.evaluate(() => window.runtimeHarness.production())
  expect(result.equal).toEqual([true, true, true])
  expect(result.categories).toEqual(['derive', 'reciprocal', 'brillouin-zone'])
  expect(result.sourceAtoms).toBe(1)
  expect(result.canvasCount).toBe(0)
  await info.attach('environment', {
    body: JSON.stringify({ browser: browser.version(), ...result }),
    contentType: 'application/json'
  })
})

test('@workspace transactions/load failures share the headless commit state machine', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const result = await page.evaluate(() => window.runtimeHarness.controllerFlows())
  expect(result.transactionRevision).toBe(1)
  expect(result.historyRevision).toBe(3)
  expect(result.invalid).toBe('ATOM_ELEMENT')
  expect(result.preserved).toBe(true)
  expect(result.commitError).toBe('EDITOR_COMMIT')
  expect(result.accepted).toEqual({ status: 'error', id: 'new', canUndo: false, newDocument: true })
  expect(result.recovered).toBe('ready')
  expect(result.auxiliaryCategory).toBe('reciprocal')
  expect(result.auxiliaryPreservesStatus).toBe(true)
  expect(errors).toEqual([])
})

test('@workspace clear/dispose settle silent commits and isolate two production workers', async ({
  page
}) => {
  const result = await page.evaluate(() => window.runtimeHarness.concurrentLifecycle())
  expect(result).toEqual({
    clearResult: 'AbortError',
    stateAfterClear: 'empty',
    disposeResult: 'AbortError',
    disposed: 'disposed',
    independent: 'F',
    secondStatus: 'ready',
    canvasCount: 0
  })
})

test('@workspace real-worker late replies/crash/close and malformed payloads terminate safely', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const result = await page.evaluate(() => window.runtimeHarness.faults())
  expect(result.cancelled).toBe('AbortError')
  expect(result.currentRequestId).toBe(2)
  expect(result.oldResolved).toBe(false)
  expect(result.codes).toEqual({
    error: 'COMPUTATION_TRANSPORT',
    close: 'COMPUTATION_TIMEOUT',
    malformed: 'COMPUTATION_PROTOCOL'
  })
  expect(result.released).toEqual([true, true, true, true])
  expect(errors).toEqual([])
})
