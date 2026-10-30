import { expect, test, type Page } from '@playwright/test'
import type { CameraPose } from 'alchemion/viewer'
import { crystalSample, molecularSample } from '../apps/demo/src/samples'
import { readFile } from 'node:fs/promises'

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

test('@demo @features POSCAR, source batches, supercell defects, coordination and portable views', async ({
  page
}) => {
  await open(page)
  const poscar =
    'Demo feature structure\n1\n4 0 0\n0 4 0\n0 0 4\nC O\n2 1\nDirect\n0 0 0\n0.5 0.5 0.5\n0.25 0.25 0.25\n'
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'POSCAR', mimeType: 'text/plain', buffer: Buffer.from(poscar) })
  await ready(page)
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '3')
  await expect(page.locator('#import-version')).toHaveText('VASP5')
  const original = await summary(page)
  await tab(page, 'edit')
  await page.locator('#batch-element').selectOption('C')
  await page.locator('#select-element').click()
  await expect(page.locator('#selected-count')).toHaveText('2')
  await page.locator('#batch-frame').selectOption('fractional')
  await page.locator('#batch-translation').fill('0.1 0 0')
  await page.locator('#translate-selected').click()
  await ready(page)
  expect(JSON.parse((await row(page, 0)).position!)).toEqual([0.1, 0, 0])
  expect(JSON.parse((await row(page, 1)).position!)).toEqual([0.6, 0.5, 0.5])
  expect(Number((await summary(page)).revision)).toBe(Number(original.revision) + 1)
  await page.locator('#undo').click()
  await ready(page)
  expect(JSON.parse((await row(page, 0)).position!)).toEqual([0, 0, 0])
  await page.locator('#batch-element').selectOption('N')
  await page.locator('#replace-selected').click()
  await ready(page)
  expect((await row(page, 1)).element).toBe('N')
  await page.locator('#undo').click()
  await ready(page)
  await page.locator('#supercell-repetitions').fill('2 1 1')
  await page.locator('#build-supercell').click()
  await ready(page)
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '6')
  expect((await summary(page)).documentId).toBe(original.documentId)
  await expect(page.locator('#selected-count')).toHaveText('0')
  await page.locator('#batch-element').selectOption('O')
  await page.locator('#select-element').click()
  await page.locator('#delete-selected').click()
  await ready(page)
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '4')
  await page.locator('#undo').click()
  await ready(page)
  await page.locator('#batch-element').selectOption('C')
  await page.locator('#select-element').click()
  await tab(page, 'measure')
  await page.locator('#coordination-rules').fill('C C 3')
  await page.locator('#show-polyhedra').check()
  await page.locator('#analyze-coordination').click()
  await ready(page)
  expect((await details(page, 'coordination-details')).centers).toHaveLength(4)
  await tab(page, 'display')
  const camera = await details(page, 'camera-details')
  await page.locator('#view-name').fill('Feature view')
  await page.locator('#save-view').click()
  await page.locator('#rotate').click()
  expect(await details(page, 'camera-details')).not.toEqual(camera)
  await page.locator('#restore-view').click()
  await ready(page)
  expect(await details(page, 'camera-details')).toEqual(camera)
  const download = page.waitForEvent('download')
  await page.locator('#download-view').click()
  const file = await download
  const view = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(view.version).toBe(1)
  expect(view.options.coordination.rules[0].elements).toEqual(['C', 'C'])
  expect(view).not.toHaveProperty('snapshot')
  // A slow file read must not overwrite a newer explicit slot restore.
  await page.evaluate(() => {
    const original = File.prototype.text
    const gate = window as unknown as { finishViewRead: () => Promise<void> }
    File.prototype.text = function () {
      if (this.name !== 'slow.json') return original.call(this)
      document.documentElement.dataset.pendingViewRead = 'yes'
      return new Promise<string>((resolve, reject) => {
        gate.finishViewRead = async () => {
          File.prototype.text = original
          try {
            resolve(await original.call(this))
          } catch (error) {
            reject(error)
          }
        }
      })
    }
  })
  await page.locator('#import-view').setInputFiles({
    name: 'slow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...view, camera: { ...view.camera, fovYDegrees: 60 } }))
  })
  await expect(page.locator('html')).toHaveAttribute('data-pending-view-read', 'yes')
  await page.locator('#restore-view').click()
  await ready(page)
  await page.evaluate(() =>
    (window as unknown as { finishViewRead: () => Promise<void> }).finishViewRead()
  )
  expect(await details(page, 'camera-details')).toEqual(camera)
  const beforeInvalid = await summary(page)
  await page.locator('#import-view').setInputFiles({
    name: 'future.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...view, version: 2 }))
  })
  await expect(page.locator('#runtime-diagnostics')).toContainText('VIEW_STATE')
  expect(await summary(page)).toEqual(beforeInvalid)
  expect(await details(page, 'camera-details')).toEqual(camera)
  await tab(page, 'export')
  await page.locator('#image-width').fill('96')
  await page.locator('#image-height').fill('64')
  await page.locator('#image-transparent').check()
  const image = page.waitForEvent('download')
  await page.locator('#download-png').click()
  const png = await image
  const bytes = await readFile((await png.path())!)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  await preview(page, 'poscar')
  await acceptLossIfPresent(page)
  await expect(page.locator('#reimport-export')).toBeEnabled()
  await page.locator('#reimport-export').click()
  await ready(page)
  expect((await summary(page)).documentId).not.toBe(original.documentId)
  await expect(page.locator('#undo')).toBeDisabled()
  const beforeBad = await summary(page)
  await page.locator('#import-text').fill(poscar.replace('Direct', 'Selective dynamics\nDirect'))
  await page.locator('#import-button').click()
  await expect(page.locator('#import-diagnostics')).toContainText('POSCAR')
  expect(await summary(page)).toEqual(beforeBad)
  await page.locator('#language-select').selectOption('zh')
  await tab(page, 'edit')
  await expect(page.getByText('多选与批量编辑', { exact: true })).toBeVisible()
})

test('@demo @features damaged and unavailable view storage preserves data and falls back to memory', async ({
  page
}) => {
  const damaged = JSON.stringify({
    version: 1,
    views: [{ name: 'Invalid', view: { version: 1, camera: {}, options: {} } }]
  })
  await page.addInitScript((seed) => {
    try {
      if (!sessionStorage.getItem('alchemion.test.seeded')) {
        localStorage.setItem('alchemion.demo.views.v1', seed)
        sessionStorage.setItem('alchemion.test.seeded', 'yes')
      }
    } catch {
      /* about:blank has no origin storage. */
    }
  }, damaged)
  await open(page)
  await tab(page, 'display')
  await expect(page.locator('#view-storage-notice')).toContainText('Existing data is preserved')
  await page.locator('#view-name').fill('Memory view')
  await page.locator('#save-view').click()
  expect(await page.evaluate(() => localStorage.getItem('alchemion.demo.views.v1'))).toBe(damaged)
  const before = await details(page, 'camera-details')
  await page.locator('#rotate').click()
  await page.locator('#restore-view').click()
  await ready(page)
  expect(await details(page, 'camera-details')).toEqual(before)
  await page.evaluate(() => localStorage.removeItem('alchemion.demo.views.v1'))
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'alchemion.demo.views.v1')
        throw new DOMException('Test quota', 'QuotaExceededError')
      return set.call(this, key, value)
    }
  })
  // A fresh document has no memory slots; storage exceptions must still allow saving this session.
  await page.goto('about:blank')
  await open(page)
  await tab(page, 'display')
  await page.locator('#save-view').click()
  await expect(page.locator('#view-storage-notice')).toContainText('page only')
  await expect(page.locator('#view-slot option')).toHaveCount(1)
})

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
  await expect(page.locator('#export-diagnostics')).toContainText('MOL_PERIODICITY_LOSS')
  await expect(page.locator('#export-diagnostics')).toContainText('MOL_ATOM_LABEL_LOSS')
  await expect(page.locator('#export-output')).toHaveValue('')
  await page.locator('#accept-loss').click()
  await expect(page.locator('#export-output')).toHaveValue(/V3000/)
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
          if (message?.kind === 'compute' && flags.alchemionFailNext === '1') {
            delete flags.alchemionFailNext
            throw new Error('Demo external Worker transport failure')
          }
          if (message?.kind === 'compute' && flags.alchemionDelayNext === '1') {
            delete flags.alchemionDelayNext
            delete flags.alchemionDelayedPosted
            setTimeout(() => {
              post(message)
              flags.alchemionDelayedPosted = '1'
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
    document.documentElement.dataset.alchemionDelayNext = '1'
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
    .poll(() => page.evaluate(() => document.documentElement.dataset.alchemionDelayedPosted))
    .toBe('1')
  expect((await row(page)).element).toBe('F')
  await page.locator('#undo').click()
  await ready(page)
  expect((await row(page)).element).toBe('C')
  await page.locator('#atom-rows tr').first().locator('button').click()
  await page.locator('#atom-element').selectOption('N')
  await page.evaluate(() => {
    document.documentElement.dataset.alchemionFailNext = '1'
  })
  await page.locator('#apply-atom').click()
  await expect(page.locator('#demo-status')).toHaveAttribute('data-state', 'error')
  expect((await row(page)).element).toBe('N')
  await expect(page.locator('#runtime-diagnostics')).toContainText(
    'Demo external Worker transport failure'
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
