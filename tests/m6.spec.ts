import { expect, test, type Page } from '@playwright/test'
import type { CameraPose } from 'alchemion/viewer'
import { crystalSample, molecularSample } from '../apps/demo/src/samples'

type Triple = readonly [number, number, number]
const browserErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})
async function ready(page: Page) {
  await expect(page.locator('#demo-status')).toHaveAttribute('data-state', 'ready')
}
async function open(page: Page) {
  await page.goto('./')
  await ready(page)
  await page.locator('#language-select').selectOption('en')
}
async function tab(page: Page, name: string) {
  await page.locator(`#tab-${name}`).click()
}
async function summary(page: Page) {
  return page.locator('#document-summary').evaluate((el) => ({ ...(el as HTMLElement).dataset }))
}
async function row(page: Page, index = 0) {
  return page
    .locator('#atom-rows tr')
    .nth(index)
    .evaluate((el) => ({ ...(el as HTMLElement).dataset }))
}
async function details(page: Page, id: string) {
  return JSON.parse((await page.locator(`#${id}`).textContent())!)
}
async function tool(page: Page, mode: string) {
  await tab(page, 'measure')
  await page.locator('#interaction-mode').selectOption(mode)
  await page.locator('#apply-tool').click()
  await ready(page)
}
// Independent perspective projection from the public numerical camera, without
// importing the renderer or exposing a demo-only viewer handle.
async function clickAtom(page: Page, point: Triple) {
  const camera = (await details(page, 'camera-details')) as CameraPose
  const box = (await page.locator('#viewer canvas').boundingBox())!
  const sub = (a: Triple, b: Triple) => a.map((n, i) => n - b[i]) as unknown as Triple
  const dot = (a: Triple, b: Triple) => a.reduce((sum, n, i) => sum + n * b[i], 0)
  const cross = (a: Triple, b: Triple): Triple => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
  const unit = (a: Triple) => a.map((n) => n / Math.hypot(...a)) as unknown as Triple
  const forward = unit(sub(camera.target, camera.position)),
    right = unit(cross(forward, camera.up)),
    up = cross(right, forward)
  const value = sub(point, camera.position)
  const scale =
    box.height / (2 * Math.tan((camera.fovYDegrees * Math.PI) / 360) * dot(value, forward))
  await page.mouse.click(
    box.x + box.width / 2 + dot(value, right) * scale,
    box.y + box.height / 2 - dot(value, up) * scale
  )
}
async function preview(page: Page, format: string, version?: string) {
  await tab(page, 'export')
  await page.locator('#export-format').selectOption(format)
  if (version) await page.locator('#export-version').selectOption(version)
  await page.locator('#preview-export').click()
}
async function acceptLossIfPresent(page: Page) {
  if (await page.locator('#accept-loss').isEnabled()) await page.locator('#accept-loss').click()
}
async function loadCrystal(page: Page) {
  await tab(page, 'import')
  await page.locator('#sample-select').selectOption('crystal')
  await page.locator('#load-sample').click()
  await expect(page.locator('#block-field')).toBeVisible()
  await page.locator('#block-select').selectOption('0')
  await page.locator('#import-button').click()
  await ready(page)
  expect((await summary(page)).kind).toBe('periodic')
}

test('@demo molecular file, display, all measurements, atomic edits, history and MOL roundtrip', async ({
  page,
  browser
}, info) => {
  await open(page)
  await page.locator('#file-input').setInputFiles({
    name: 'local.mol',
    mimeType: 'text/plain',
    buffer: Buffer.from(molecularSample)
  })
  await ready(page)
  await expect(page.locator('#import-version')).toContainText('V3000')
  expect((await summary(page)).atomCount).toBe('4')
  const documentId = (await summary(page)).documentId
  await page.locator('#language-select').selectOption('zh')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  expect((await summary(page)).documentId).toBe(documentId)
  await page.locator('#language-select').selectOption('en')
  await tab(page, 'display')
  await page.locator('#render-mode').selectOption('ball-and-stick')
  await page.locator('#infer-bonds').uncheck()
  await page.locator('#apply-display').click()
  await ready(page)
  const ball = await page.locator('#viewer').screenshot()
  await page.locator('#render-mode').selectOption('space-filling')
  await page.locator('#apply-display').click()
  await ready(page)
  expect(ball.equals(await page.locator('#viewer').screenshot())).toBe(false)
  await page.locator('#style-element').selectOption('C')
  await page.locator('#element-color').fill('#00aa44')
  await page.locator('#style-space-radius').fill('1.9')
  await page.locator('#apply-style').click()
  await ready(page)
  await page.locator('#reset-style').click()
  await ready(page)
  await page.locator('#render-mode').selectOption('ball-and-stick')
  await page.locator('#apply-display').click()
  await ready(page)
  const camera = await details(page, 'camera-details')
  await page.locator('#rotate').click()
  await expect.poll(() => details(page, 'camera-details')).not.toEqual(camera)
  await page.locator('#zoom-in').click()
  await page.locator('#zoom-out').click()
  await page.locator('#center').click()
  const points: Triple[] = [
    [-3, 0, 0],
    [0, 0, 0],
    [0, 3, 0],
    [0, 3, 3]
  ]
  await tool(page, 'select')
  await clickAtom(page, points[0])
  expect((await details(page, 'selection-details')).instance.sourceAtomId).toBe(
    (await row(page)).atomId
  )
  await tool(page, 'pick-point')
  await clickAtom(page, points[0])
  expect(await details(page, 'point-details')).toMatchObject({
    unit: 'angstrom',
    source: 'surface'
  })
  for (const [mode, count, value, unit] of [
    ['measure-distance', 2, 3, 'angstrom'],
    ['measure-angle', 3, 90, 'degree'],
    ['measure-torsion', 4, 90, 'degree']
  ] as const) {
    await tool(page, mode)
    for (const point of points.slice(0, count)) await clickAtom(page, point)
    await expect
      .poll(async () => (await details(page, 'measurement-details')).value)
      .toBeCloseTo(value, 6)
    expect((await details(page, 'measurement-details')).unit).toBe(unit)
  }
  await tab(page, 'edit')
  await page.locator('#atom-rows tr').first().locator('button').click()
  const before = Number((await summary(page)).revision)
  await page.locator('#atom-element').selectOption('F')
  await page.locator('#atom-position').fill('-2 0 0')
  await page.locator('#apply-atom').click()
  await ready(page)
  expect(Number((await summary(page)).revision)).toBe(before + 1)
  expect((await row(page)).element).toBe('F')
  expect(JSON.parse((await row(page)).position!)).toEqual([-2, 0, 0])
  await page.locator('#undo').click()
  await ready(page)
  expect((await row(page)).element).toBe('C')
  await page.locator('#redo').click()
  await ready(page)
  expect((await row(page)).element).toBe('F')
  await page.locator('#atom-element').selectOption('He')
  await page.locator('#atom-position').fill('4 4 4')
  await page.locator('#add-atom').click()
  await ready(page)
  expect((await summary(page)).atomCount).toBe('5')
  await page.locator('#atom-rows tr[data-atom-id^="demo-atom-"] button').click()
  await page.locator('#delete-atom').click()
  await ready(page)
  expect((await summary(page)).atomCount).toBe('4')
  await page.locator('#undo').click()
  await ready(page)
  expect((await summary(page)).atomCount).toBe('5')
  await page.locator('#redo').click()
  await ready(page)
  for (const version of ['V3000', 'V2000']) {
    await preview(page, 'mol', version)
    await acceptLossIfPresent(page)
    await expect(page.locator('#export-output')).toHaveValue(new RegExp(version))
  }
  const downloadPromise = page.waitForEvent('download')
  await page.locator('#download-export').click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.mol$/)
  await page.locator('#reimport-export').click()
  await ready(page)
  expect((await summary(page)).atomCount).toBe('4')
  await expect(page.locator('#undo')).toBeDisabled()
  await preview(page, 'poscar')
  await expect(page.locator('#export-diagnostics')).toContainText('POSCAR_PERIODIC_REQUIRED')
  await expect(page.locator('#accept-loss')).toBeDisabled()
  await expect(page.locator('#export-output')).toHaveValue('')
  await info.attach('molecular-workflow', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })
  await info.attach('environment', {
    body: JSON.stringify({ browser: browser.version(), summary: await summary(page) }),
    contentType: 'application/json'
  })
})

test('@demo CIF block, periodic displays, derived edit, cell, finite MOL and all crystal exports', async ({
  page
}, info) => {
  await open(page)
  const initial = await summary(page)
  await page.locator('#sample-select').selectOption('crystal')
  await page.locator('#load-sample').click()
  await expect(page.locator('#import-diagnostics')).toContainText('CIF_BLOCK_REQUIRED')
  expect((await summary(page)).documentId).toBe(initial.documentId)
  await page.locator('#block-select').selectOption('0')
  await page.locator('#import-button').click()
  await ready(page)
  await tab(page, 'display')
  for (const id of ['show-lattice', 'show-reciprocal', 'show-bz'])
    await page.locator(`#${id}`).check()
  await page.locator('#show-symmetry').uncheck()
  await page.locator('#infer-bonds').uncheck()
  await page.locator('#render-mode').selectOption('ball-and-stick')
  await page.locator('#neighbor-cells').fill('1 0 0')
  await page.locator('#cutoff').selectOption('none')
  await page.locator('#apply-display').click()
  await ready(page)
  await info.attach('periodic-helpers', {
    body: await page.locator('#viewer').screenshot(),
    contentType: 'image/png'
  })
  await page.locator('#cutoff').selectOption('fraction')
  await page.locator('#fraction-margin').fill('0 0 0')
  await page.locator('#apply-display').click()
  await ready(page)
  await page.locator('#cutoff').selectOption('bond')
  await page.locator('#apply-display').click()
  await ready(page)
  await page.locator('#cutoff').selectOption('none')
  await page.locator('#apply-display').click()
  await ready(page)
  await page.locator('#center').click()
  await tool(page, 'select')
  await clickAtom(page, [10, 1.5, 1.75])
  expect((await details(page, 'selection-details')).instance.integerCellOffset).toEqual([1, 0, 0])
  const selectedId = (await details(page, 'selection-details')).instance.sourceAtomId
  await tab(page, 'edit')
  await page.locator('#instance-position').fill('11 1.5 1.75')
  await page.locator('#move-instance').click()
  await ready(page)
  const moved = page.locator('#atom-rows tr').filter({ has: page.locator(`button`) })
  expect(await moved.count()).toBe(2)
  const selected = page.locator('#atom-rows tr').filter({ has: page.locator('button') })
  const positions = await selected.evaluateAll((rows) =>
    rows.map((el) => ({ ...(el as HTMLElement).dataset }))
  )
  expect(
    JSON.parse(positions.find((value) => value.atomId === selectedId)!.position!)[0]
  ).toBeCloseTo(0.375, 8)
  await page.locator('#undo').click()
  await ready(page)
  const fractional = JSON.parse((await row(page)).position!)
  await page.locator('#cell-a').fill('10')
  await page.locator('#apply-cell').click()
  await ready(page)
  expect(JSON.parse((await row(page)).position!)).toEqual(fractional)
  await page.locator('#undo').click()
  await ready(page)
  await tool(page, 'pick-point')
  await clickAtom(page, [2, 1.5, 1.75])
  const point = await details(page, 'point-details')
  expect(point.fractional).toHaveLength(3)
  for (let i = 0; i < 3; i++)
    expect(point.cartesian[i]).toBeCloseTo(point.fractional[i] * [8, 6, 7][i], 7)
  await tool(page, 'select')
  await clickAtom(page, [10, 1.5, 1.75])
  await preview(page, 'mol', 'V3000')
  await expect(page.locator('#export-output')).toHaveValue('')
  await page.locator('#finite-kind').selectOption('instances')
  await page.locator('#collect-instance').click()
  await page.locator('#preview-export').click()
  await acceptLossIfPresent(page)
  await expect(page.locator('#export-output')).toHaveValue(/V3000/)
  expect((await details(page, 'export-mapping'))[0].source.integerCellOffset).toEqual([1, 0, 0])
  await page.locator('#finite-kind').selectOption('source')
  await page.locator('#finite-all').click()
  await page.locator('#preview-export').click()
  await acceptLossIfPresent(page)
  expect(await details(page, 'export-mapping')).toHaveLength(2)
  for (const version of ['1', '2']) {
    await preview(page, 'cif', version)
    await acceptLossIfPresent(page)
    await expect(page.locator('#export-output')).toHaveValue(/data_/)
    if (version === '2') await expect(page.locator('#export-output')).toHaveValue(/^#\\#CIF_2\.0/)
    await page.locator('#reimport-export').click()
    await ready(page)
    expect((await summary(page)).kind).toBe('periodic')
    expect((await summary(page)).atomCount).toBe('2')
  }
  await preview(page, 'poscar')
  await expect(page.locator('#export-output')).toHaveValue('')
  await expect(page.locator('#accept-loss')).toBeEnabled()
  await page.locator('#accept-loss').click()
  await expect(page.locator('#export-output')).toHaveValue(/Direct/)
  await expect(page.locator('#reimport-export')).toBeDisabled()
  // The explicit loss option cannot override a hard occupancy prerequisite.
  await tab(page, 'import')
  await page.locator('#import-format').selectOption('cif')
  await page
    .locator('#import-text')
    .fill(crystalSample.replace('C1 C 0.25 0.25 0.25 1', 'C1 C 0.25 0.25 0.25 0.5'))
  await page.locator('#import-button').click()
  await page.locator('#block-select').selectOption('0')
  await page.locator('#import-button').click()
  await ready(page)
  await preview(page, 'poscar')
  await acceptLossIfPresent(page)
  await expect(page.locator('#export-diagnostics')).toContainText('POSCAR_OCCUPANCY')
  await expect(page.locator('#export-output')).toHaveValue('')
})

test('@demo invalid imports, committed cancellation, late results and recoverable worker failure', async ({
  page
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker
        const post = worker.postMessage.bind(worker)
        worker.postMessage = ((message: { kind?: string }) => {
          const flags = document.documentElement.dataset
          if (message?.kind === 'compute' && flags.m6FailNext === '1') {
            delete flags.m6FailNext
            throw new Error('M6 external Worker transport failure')
          }
          if (message?.kind === 'compute' && flags.m6DelayNext === '1') {
            delete flags.m6DelayNext
            delete flags.m6DelayedPosted
            setTimeout(() => {
              post(message)
              flags.m6DelayedPosted = '1'
            }, 500)
          } else post(message)
        }) as typeof worker.postMessage
        return worker
      }
    })
  })
  await open(page)
  const original = await summary(page)
  await page.locator('#import-text').fill('broken molfile')
  await page.locator('#import-button').click()
  await expect(page.locator('#import-diagnostics')).toContainText('error')
  expect(await summary(page)).toEqual(original)
  await tab(page, 'edit')
  await page.locator('#atom-rows tr').first().locator('button').click()
  await page.locator('#atom-element').selectOption('F')
  await page.evaluate(() => {
    document.documentElement.dataset.m6DelayNext = '1'
  })
  await page.locator('#apply-atom').click()
  await expect(page.locator('#demo-status')).toHaveAttribute('data-state', 'computing')
  await page.locator('#cancel').click()
  await expect(page.locator('#demo-status')).toHaveAttribute('data-state', 'cancelled')
  expect((await row(page)).element).toBe('F')
  await expect(page.locator('#undo')).toBeEnabled()
  const cancelledRevision = (await summary(page)).revision
  await page.locator('#recompute').click()
  await ready(page)
  expect((await summary(page)).revision).toBe(cancelledRevision)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.m6DelayedPosted))
    .toBe('1')
  expect((await row(page)).element).toBe('F')
  await page.locator('#undo').click()
  await ready(page)
  expect((await row(page)).element).toBe('C')
  await page.locator('#atom-rows tr').first().locator('button').click()
  await page.locator('#atom-element').selectOption('N')
  await page.evaluate(() => {
    document.documentElement.dataset.m6FailNext = '1'
  })
  await page.locator('#apply-atom').click()
  await expect(page.locator('#demo-status')).toHaveAttribute('data-state', 'error')
  expect((await row(page)).element).toBe('N')
  await expect(page.locator('#runtime-diagnostics')).toContainText(
    'M6 external Worker transport failure'
  )
  await page.locator('#recompute').click()
  await ready(page)
  expect((await row(page)).element).toBe('N')
  await page.locator('#clear').click()
  await expect(page.locator('#demo-status')).toHaveAttribute('data-state', 'empty')
})

test('@demo offline bundled samples, local notices and understandable WebGL2 unavailability', async ({
  page,
  context,
  browser
}) => {
  await open(page)
  const notices = await page.request.get(new URL('./generated/notices.txt', page.url()).href)
  expect(notices.ok()).toBe(true)
  expect(await notices.text()).toContain('The MIT License')
  const manifests = await page.request.get(
    new URL('./generated/data-manifests.json', page.url()).href
  )
  expect((await manifests.json()).samples.license).toBe('MIT')
  await context.setOffline(true)
  await loadCrystal(page)
  await tab(page, 'import')
  await page.locator('#sample-select').selectOption('molecule')
  await page.locator('#load-sample').click()
  await ready(page)
  expect((await summary(page)).kind).toBe('molecular')
  await context.setOffline(false)
  const unavailable = await browser.newContext()
  try {
    const fallback = await unavailable.newPage()
    const errors: string[] = []
    fallback.on('pageerror', (error) => errors.push(error.message))
    await fallback.addInitScript(() => {
      const native = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        name: string,
        ...args: unknown[]
      ) {
        return name === 'webgl2' ? null : Reflect.apply(native, this, [name, ...args])
      } as typeof native
    })
    await fallback.goto(page.url())
    await expect(fallback.locator('#webgl-unavailable')).toBeVisible()
    await expect(fallback.locator('#webgl-details')).toContainText('WEBGL2_UNAVAILABLE')
    expect(errors).toEqual([])
  } finally {
    await unavailable.close()
  }
})

test('@dev real development Worker, form edit and public MOL export', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await open(page)
  await tab(page, 'edit')
  await page.locator('#atom-rows tr').first().locator('button').click()
  await page.locator('#atom-element').selectOption('F')
  await page.locator('#apply-atom').click()
  await ready(page)
  expect((await row(page)).element).toBe('F')
  await preview(page, 'mol', 'V3000')
  await acceptLossIfPresent(page)
  await expect(page.locator('#export-output')).toHaveValue(/V3000/)
  expect(workers.some((url) => url.includes('computation-worker'))).toBe(true)
})
