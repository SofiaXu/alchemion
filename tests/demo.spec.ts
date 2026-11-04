import { expect, test, type Page } from '@playwright/test'
import type { CameraPose, ViewerViewState } from 'alchemion/viewer'
import type { CalculationResult, CoordinationResult, StructureSnapshot } from 'alchemion/core'
import { crystalSample, molecularSample } from '../apps/demo/src/samples'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

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

async function openCalculationResult(page: Page, result: CalculationResult) {
  await tab(page, 'results')
  await page.locator('#result-format').selectOption('alchemion-result')
  await page.locator('#result-file').setInputFiles({
    name: 'analytical.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(result))
  })
  await page.locator('#result-import').click()
  await expect(page.locator('#result-import-status')).toHaveAttribute('data-state', 'ready')
  await page.locator('#result-open').click()
  await ready(page)
  await expect(page.locator('#result-binding-status')).toHaveAttribute('data-state', 'bound')
}

// Experimental COD inputs, kept byte-for-byte with references and independent
// crystallographic arithmetic in fixtures/crystals/README.md.
const quartzMetric = (x: number, y: number, z: number) =>
  Math.sqrt(4.916 ** 2 * (x * x + y * y - x * y) + (5.4054 * z) ** 2)
const realCrystals = [
  {
    id: '9003308',
    name: 'halite',
    sha256: '34ae2391f7417c12a800a0afddf56995c5b69c1fb7c73fc5509a432e230e48a3',
    elements: ['Na', 'Cl'],
    positions: [
      [0, 0, 0],
      [0.5, 0.5, 0.5]
    ],
    cell: [5.6401, 5.6401, 5.6401, 90, 90, 90],
    expanded: 8,
    cutoff: 3,
    distances: Array<number>(6).fill(5.6401 / 2),
    vertices: 6
  },
  {
    id: '9000775',
    name: 'quartz',
    sha256: '573e4a570f2cf9e5c338cfb4f23c94fe6c6254de5ee90d9851204d912aa5ea48',
    elements: ['Si', 'O'],
    positions: [
      [0.4697, 0, 0],
      [0.4135, 0.2669, 0.1191]
    ],
    cell: [4.916, 4.916, 5.4054, 90, 90, 120],
    expanded: 9,
    cutoff: 1.7,
    distances: [
      ...Array<number>(2).fill(quartzMetric(0.2634, 0.1466, 0.1191 - 1 / 3)),
      ...Array<number>(2).fill(quartzMetric(-0.0562, 0.2669, 0.1191))
    ].sort((a, b) => a - b),
    vertices: 4
  },
  {
    id: '9004143',
    name: 'rutile at 600 C',
    sha256: '34d130609f9662d03522aa25547e8aef8fc32f5fcb2692e7e0c529e5f7ca9b95',
    elements: ['Ti', 'O'],
    positions: [
      [0, 0, 0],
      [0.3045, 0.3045, 0]
    ],
    cell: [4.616, 4.616, 2.977, 90, 90, 90],
    expanded: 6,
    cutoff: 2.1,
    distances: [
      ...Array<number>(4).fill(Math.hypot(Math.SQRT2 * 4.616 * (0.5 - 0.3045), 2.977 / 2)),
      ...Array<number>(2).fill(Math.SQRT2 * 4.616 * 0.3045)
    ].sort((a, b) => a - b),
    vertices: 6
  }
] as const

for (const crystal of realCrystals) {
  test(`@demo @real-crystals experimental ${crystal.name}: symmetry, coordination, supercell and roundtrips`, async ({
    page,
    browser
  }, info) => {
    const input = await readFile(`tests/fixtures/crystals/${crystal.id}.cif`)
    expect(createHash('sha256').update(input).digest('hex')).toBe(crystal.sha256)
    await open(page)
    await page.locator('#file-input').setInputFiles({
      name: `${crystal.id}.cif`,
      mimeType: 'text/plain',
      buffer: input
    })
    await ready(page)
    await expect(page.locator('#import-version')).toHaveText('1')
    const original = await summary(page)
    expect(original).toMatchObject({ kind: 'periodic', atomCount: '2' })
    await expect(page.locator('#import-diagnostics')).not.toHaveAttribute('data-severity', 'error')
    await expect(page.locator('#import-diagnostics')).toContainText('CIF_ELEMENT_FROM_LABEL')
    await expect(page.locator('#import-diagnostics')).toContainText('CIF_UNMAPPED_SCIENCE')
    if (crystal.id === '9000775')
      await expect(page.locator('#import-diagnostics')).toContainText(
        'SYMMETRY_IDENTIFIER_CONFLICT'
      )
    await tab(page, 'edit')
    for (let i = 0; i < 2; i++) {
      expect((await row(page, i)).element).toBe(crystal.elements[i])
      expect(JSON.parse((await row(page, i)).position!)).toEqual(crystal.positions[i])
    }
    for (const [i, key] of ['a', 'b', 'c', 'alpha', 'beta', 'gamma'].entries())
      expect(Number(await page.locator(`#cell-${key}`).inputValue())).toBeCloseTo(
        crystal.cell[i],
        8
      )
    await tab(page, 'display')
    for (const id of ['show-lattice', 'show-reciprocal', 'show-bz', 'show-performance'])
      await page.locator(`#${id}`).check()
    await page.locator('#render-mode').selectOption('ball-and-stick')
    await page.locator('#apply-display').click()
    await ready(page)
    const count = (n: number) =>
      expect(page.locator('[data-alchemion-performance]')).toContainText(`· ${n} atoms`)
    await count(crystal.expanded)
    await info.attach('unit-cell', {
      body: await page.locator('#viewer').screenshot(),
      contentType: 'image/png'
    })
    await page.locator('#render-mode').selectOption('space-filling')
    await page.locator('#apply-display').click()
    await ready(page)
    await count(crystal.expanded)
    await info.attach('space-filling', {
      body: await page.locator('#viewer').screenshot(),
      contentType: 'image/png'
    })
    await page.locator('#render-mode').selectOption('ball-and-stick')
    await page.locator('#show-symmetry').uncheck()
    await page.locator('#apply-display').click()
    await ready(page)
    await count(2)
    await page.locator('#show-symmetry').check()
    await page.locator('#neighbor-cells').fill('1 0 0')
    await page.locator('#apply-display').click()
    await ready(page)
    await count(2 * crystal.expanded)

    if (crystal.id === '9003308') {
      // Look down +z at the exposed z=a/2 layer. Points across neighboring
      // cells must retain their actual separation, rather than minimum image.
      const download = page.waitForEvent('download')
      await page.locator('#download-view').click()
      const view = JSON.parse(
        await readFile((await (await download).path())!, 'utf8')
      ) as ViewerViewState
      const a = crystal.cell[0]
      const camera: CameraPose = {
        ...view.camera,
        position: [a / 2, a / 4, 4 * a],
        target: [a / 2, a / 4, a / 2],
        up: [0, 1, 0]
      }
      await page.locator('#import-view').setInputFiles({
        name: 'halite-view.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...view, camera }))
      })
      await ready(page)
      await expect.poll(() => details(page, 'camera-details')).toEqual(camera)
      const points: Triple[] = [
        [0, a / 2, a / 2],
        [a / 2, a / 2, a / 2],
        [a / 2, 0, a / 2]
      ]
      await tool(page, 'select')
      await clickAtom(page, [a, a / 2, a / 2])
      expect((await details(page, 'selection-details')).instance).toMatchObject({
        sourceAtomId: (await row(page)).atomId,
        integerCellOffset: [1, 0, 0]
      })
      await tool(page, 'measure-distance')
      await clickAtom(page, points[0])
      await clickAtom(page, [a, a / 2, a / 2])
      expect((await details(page, 'measurement-details')).value).toBeCloseTo(a, 8)
      await info.attach('cross-cell-measurement', {
        body: await page.locator('#viewer').screenshot(),
        contentType: 'image/png'
      })
      await tool(page, 'measure-angle')
      for (const point of points) await clickAtom(page, point)
      expect((await details(page, 'measurement-details')).value).toBeCloseTo(90, 8)
      await tool(page, 'pick-point')
      await clickAtom(page, points[1])
      const picked = await details(page, 'point-details')
      expect(picked).toMatchObject({ source: 'surface', unit: 'angstrom' })
      for (let i = 0; i < 3; i++)
        expect(picked.cartesian[i]).toBeCloseTo(a * picked.fractional[i], 8)
      await tab(page, 'display')
    }
    await page.locator('#neighbor-cells').fill('')
    await page.locator('#apply-display').click()
    await ready(page)
    await page.locator('#center').click()
    await tab(page, 'edit')
    await page.locator('#batch-element').selectOption(crystal.elements[0])
    await page.locator('#select-element').click()
    await expect(page.locator('#selected-count')).toHaveText('1')
    await tab(page, 'measure')
    await page
      .locator('#coordination-rules')
      .fill(`${crystal.elements.join(' ')} ${crystal.cutoff}`)
    await page.locator('#show-polyhedra').check()
    await page.locator('#analyze-coordination').click()
    await ready(page)
    const coordination = (await details(page, 'coordination-details')) as CoordinationResult
    expect(coordination.centers).toHaveLength(1)
    const center = coordination.centers[0]
    expect(center.coordinationNumber).toBe(crystal.distances.length)
    const distances = center.neighbors.map((n) => n.distance).sort((a, b) => a - b)
    for (const [i, distance] of distances.entries())
      expect(distance).toBeCloseTo(crystal.distances[i], 8)
    expect(center.polyhedron?.vertices).toHaveLength(crystal.vertices)
    expect(center.polyhedron!.volume).toBeGreaterThan(0)
    if (crystal.id === '9003308')
      expect(center.polyhedron!.volume).toBeCloseTo(crystal.cell[0] ** 3 / 6, 8)
    expect(await summary(page)).toEqual(original)
    await expect(page.locator('#undo')).toBeDisabled()
    await info.attach('coordination', {
      body: JSON.stringify(coordination),
      contentType: 'application/json'
    })
    await info.attach('polyhedron', {
      body: await page.locator('#viewer').screenshot(),
      contentType: 'image/png'
    })

    await tab(page, 'export')
    await page.locator('#image-width').fill('800')
    await page.locator('#image-height').fill('600')
    const imageDownload = page.waitForEvent('download')
    await page.locator('#download-png').click()
    const png = await readFile((await (await imageDownload).path())!)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([800, 600])
    await info.attach('exported-crystal', { body: png, contentType: 'image/png' })
    for (const version of ['1', '2']) {
      await preview(page, 'cif', version)
      if (version === '1') {
        await expect(page.locator('#accept-loss')).toBeEnabled()
        await expect(page.locator('#export-output')).toHaveValue('')
      }
      await acceptLossIfPresent(page)
      await expect(page.locator('#export-output')).toHaveValue(/data_/)
      await page.locator('#reimport-export').click()
      await ready(page)
      expect((await summary(page)).atomCount).toBe('2')
      await count(crystal.expanded)
    }
    await tab(page, 'edit')
    const beforeSupercell = await summary(page)
    await page.locator('#supercell-repetitions').fill('2 2 1')
    await page.locator('#build-supercell').click()
    await ready(page)
    expect((await summary(page)).atomCount).toBe(String(4 * crystal.expanded))
    expect((await summary(page)).documentId).toBe(beforeSupercell.documentId)
    expect(Number((await summary(page)).revision)).toBe(Number(beforeSupercell.revision) + 1)
    for (const key of ['a', 'b'])
      expect(Number(await page.locator(`#cell-${key}`).inputValue())).toBeCloseTo(
        2 * crystal.cell[0],
        8
      )
    const supercellRows = await page
      .locator('#atom-rows tr')
      .evaluateAll((rows) => rows.map((r) => ({ ...(r as HTMLElement).dataset })))
    await page.locator('#undo').click()
    await ready(page)
    expect((await summary(page)).atomCount).toBe('2')
    await page.locator('#redo').click()
    await ready(page)
    expect(
      await page
        .locator('#atom-rows tr')
        .evaluateAll((rows) => rows.map((r) => ({ ...(r as HTMLElement).dataset })))
    ).toEqual(supercellRows)
    await page.locator('#atom-rows tr').first().locator('button').click()
    await page.locator('#delete-atom').click()
    await ready(page)
    expect((await summary(page)).atomCount).toBe(String(4 * crystal.expanded - 1))
    await page.locator('#undo').click()
    await ready(page)
    expect((await row(page)).atomId).toBe(supercellRows[0].atomId)
    await preview(page, 'poscar')
    await acceptLossIfPresent(page)
    await expect(page.locator('#export-output')).toHaveValue(/Direct/)
    const poscar = await page.locator('#export-output').inputValue()
    await page.locator('#reimport-export').click()
    await ready(page)
    expect((await summary(page)).atomCount).toBe(String(4 * crystal.expanded))
    await count(4 * crystal.expanded)
    await expect(page.locator('#undo')).toBeDisabled()
    await expect(page.locator('#runtime-diagnostics')).not.toHaveAttribute('data-severity', 'error')
    await page.locator('#language-select').selectOption('zh')
    await info.attach('supercell', { body: await page.screenshot(), contentType: 'image/png' })
    await info.attach('environment', {
      body: JSON.stringify({
        browser: browser.version(),
        cod: crystal.id,
        sha256: crystal.sha256,
        original,
        final: await summary(page),
        poscar
      }),
      contentType: 'application/json'
    })
  })
}

async function openModelJson(page: Page) {
  if (!(await page.locator('#model-options').isVisible()))
    await page.locator('#model-json-panel > summary').click()
}

async function applyModelPreview(page: Page, json = false) {
  await page.locator(json ? '#model-preview-json' : '#model-preview').click()
  await expect(page.locator('#model-dialog')).toBeVisible()
  const result = await details(page, 'model-result')
  if (await page.locator('#model-loss-field').isVisible())
    await page.locator('#model-accept-loss').check()
  await page.locator('#model-apply').click()
  await expect(page.locator('#model-dialog')).toBeHidden()
  await ready(page)
  return result
}

async function buildModel(page: Page, kind: string, options?: unknown) {
  await tab(page, 'model')
  await page.locator('#model-kind').selectOption(kind)
  if (options !== undefined) {
    await openModelJson(page)
    await page.locator('#model-options').fill(JSON.stringify(options))
  }
  return applyModelPreview(page, options !== undefined)
}

test('@demo @modeling crystal, matrix, slab and fixed bottom layers round-trip through POSCAR', async ({
  page
}) => {
  await open(page)
  const crystal = await buildModel(page, 'crystal')
  expect(crystal).toMatchObject({ atomCount: 1, parameters: { expandedAtomCount: 1 } })
  const original = await summary(page)
  await page.locator('#model-kind').selectOption('supercell')
  await page.locator('#model-form-supercell-mode').selectOption('matrix')
  await page.locator('#model-form-supercell-1-1').fill('0')
  await page.locator('#model-preview').click()
  await expect(page.locator('#runtime-diagnostics')).toContainText('SUPERCELL_')
  await expect(page.locator('#model-dialog')).toBeHidden()
  expect(await summary(page)).toEqual(original)
  await page.locator('#model-form-supercell-1-1').fill('1')
  const matrix = await applyModelPreview(page)
  expect(matrix.atomCount).toBe(2)
  await page.locator('#model-kind').selectOption('terminations')
  await page.locator('#model-form-terminations-0').fill('0')
  await page.locator('#model-form-terminations-2').fill('1')
  await page.locator('#model-preview').click()
  await expect(page.locator('#model-apply')).toBeHidden()
  await page.locator('#model-candidate-list [data-model-candidate="0"]').click()
  await expect(page.locator('#model-kind')).toHaveValue('slab')
  await expect(page.locator('#model-form-slab-hkl-2')).toHaveValue('1')
  const slab = await applyModelPreview(page)
  expect(slab).toMatchObject({ atomCount: 4, parameters: { vacuum: 12 } })
  expect((await summary(page)).documentId).toBe(original.documentId)
  const beforeFlags = Number((await summary(page)).revision)
  await page.locator('#model-fix-bottom').click()
  await ready(page)
  await expect(page.locator('#document-summary')).toHaveAttribute(
    'data-revision',
    String(beforeFlags + 1)
  )
  await page.locator('#undo').click()
  await ready(page)
  await page.locator('#redo').click()
  await ready(page)
  await tab(page, 'export')
  await page.locator('#export-format').selectOption('poscar')
  await page.locator('#preview-export').click()
  await expect(page.locator('#export-diagnostics')).toContainText('POSCAR_SYMMETRY_LOSS')
  await page.locator('#accept-loss').click()
  await expect(page.locator('#export-output')).toHaveValue(/Selective Dynamics/i)
  expect((await page.locator('#export-output').inputValue()).match(/F F F/g)).toHaveLength(2)
  await page.locator('#reimport-export').click()
  await ready(page)
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '4')
})

test('@demo @modeling molecular sketch transaction and capped polymer export', async ({ page }) => {
  await open(page)
  await tab(page, 'model')
  await page.locator('#model-empty-molecule').click()
  await ready(page)
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '0')
  await tab(page, 'edit')
  await page.locator('#atom-element').selectOption('C')
  await page.locator('#atom-position').fill('0 0 0')
  await page.locator('#add-atom').click()
  await ready(page)
  await page.locator('#atom-position').fill('1.5 0 0')
  await page.locator('#add-atom').click()
  await ready(page)
  const ids = [(await row(page, 0)).atomId, (await row(page, 1)).atomId]
  await tab(page, 'model')
  await page.locator('#model-bond-atoms').fill(ids.join(','))
  await page.locator('#model-add-bond').click()
  await ready(page)
  await expect(page.locator('#undo')).toBeEnabled()
  const polymer = await buildModel(page, 'polymer', {
    recipe: { kind: 'homopolymer', unit: 'ethylene', count: 2 },
    ends: [0, 1].map((unit) => ({
      unit,
      port: unit === 0 ? 'head' : 'tail',
      fragment: 'hydrogen',
      distance: 1.09
    }))
  })
  expect(polymer.composition).toEqual({ C: 4, H: 10 })
  await tab(page, 'export')
  await page.locator('#export-format').selectOption('mol')
  await page.locator('#preview-export').click()
  await expect(page.locator('#export-diagnostics')).toContainText('MOL_POLYMER_RECIPE_LOSS')
  await page.locator('#accept-loss').click()
  await expect(page.locator('#export-output')).toHaveValue(/M {2}V30 COUNTS 14 13/)
})

test('@demo @modeling seeded packing validates uploaded quotas and edits its substrate once', async ({
  page
}) => {
  await open(page)
  await page.locator('#file-input').setInputFiles({
    name: 'POSCAR',
    mimeType: 'text/plain',
    buffer: Buffer.from('Packing substrate\n1\n6 0 0\n2 6 0\n0 0 6\nC\n1\nDirect\n0.5 0.5 0.1\n')
  })
  await expect(page.locator('#document-summary')).toHaveAttribute('data-kind', 'periodic')
  await ready(page)
  const original = await summary(page)
  await tab(page, 'model')
  await page.locator('#model-kind').selectOption('packing')
  const helium = `Helium\nAlchemion\n\n  0  0  0     0  0            999 V3000\nM  V30 BEGIN CTAB\nM  V30 COUNTS 1 0 0 0 0\nM  V30 BEGIN ATOM\nM  V30 1 He 0 0 0 0\nM  V30 END ATOM\nM  V30 END CTAB\nM  END\n`
  await page
    .locator('#model-files')
    .setInputFiles({ name: 'He.mol', mimeType: 'text/plain', buffer: Buffer.from(helium) })
  const input = {
    useSubstrate: true,
    counts: [2],
    region: { minimum: [0, 0, 0.3], maximum: [1, 1, 0.8] },
    minimumDistance: 1,
    seed: 25
  }
  await openModelJson(page)
  await page.locator('#model-options').fill(JSON.stringify({ ...input, counts: [2, 3] }))
  await page.locator('#model-preview-json').click()
  await expect(page.locator('#runtime-diagnostics')).toContainText('one count or one ratio')
  expect(await summary(page)).toEqual(original)
  await page.locator('#model-options').fill(JSON.stringify(input))
  await page.locator('#model-fill-json').click()
  await expect(page.locator('#model-form-packing-counts-0')).toHaveValue('2')
  expect(await applyModelPreview(page)).toMatchObject({
    atomCount: 3,
    composition: { C: 1, He: 2 },
    parameters: { seed: 25 }
  })
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '3')
  expect((await summary(page)).documentId).toBe(original.documentId)
  await page.locator('#undo').click()
  await ready(page)
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '1')
})

test('@demo @kit 15 modeling forms write typed recipes and preserve unsupported JSON', async ({
  page
}) => {
  await open(page)
  await tab(page, 'model')
  await expect(page.locator('#model-options')).toBeHidden()
  const mappings: readonly {
    kind: string
    select?: readonly (readonly [field: string, value: string])[]
    fill?: readonly (readonly [field: string, value: string])[]
    expected: Record<string, unknown> | unknown[]
  }[] = [
    {
      kind: 'crystal',
      select: [['cell-mode', 'basis']],
      fill: [['cell-basis-0-0', '5']],
      expected: {
        cell: {
          basis: [
            [5, 0, 0],
            [0, 4, 0],
            [0, 0, 4]
          ]
        },
        atoms: [{ id: 'C1', element: 'C', fractional: [0, 0, 0] }]
      }
    },
    {
      kind: 'symmetry',
      select: [['output', 'primitive']],
      expected: { output: 'primitive', hallNumber: 0 }
    },
    {
      kind: 'supercell',
      select: [['mode', 'matrix']],
      fill: [['0-0', '3']],
      expected: [
        [3, 0, 0],
        [1, 1, 0],
        [0, 0, 1]
      ]
    },
    { kind: 'terminations', fill: [['1', '1']], expected: [1, 1, 0] },
    {
      kind: 'slab',
      select: [['thickness-mode', 'angstrom']],
      fill: [['thickness-angstrom', '7.5']],
      expected: { hkl: [1, 0, 0], termination: 0, thickness: { angstrom: 7.5 }, vacuum: 12 }
    },
    {
      kind: 'interface',
      fill: [
        ['candidate', '2'],
        ['search-rotation', '12']
      ],
      expected: { candidate: 2, search: { rotation: 12 }, options: { gap: 3, vacuum: 12 } }
    },
    {
      kind: 'adsorbate',
      fill: [
        ['target-2', '1.5'],
        ['height', '2.25']
      ],
      expected: { target: [0, 0, 1.5], height: 2.25, rotation: { axis: [0, 0, 1], angle: 0 } }
    },
    { kind: 'interstitials', fill: [['grid', '9']], expected: { grid: 9, limit: 12 } },
    {
      kind: 'defects',
      select: [['mode', 'interstitial']],
      fill: [['fractional-0', '0.25']],
      expected: { kind: 'interstitial', element: 'H', fractional: [0.25, 0.5, 0.5] }
    },
    {
      kind: 'fragment',
      select: [['fragment', 'ethylene']],
      expected: { fragment: 'ethylene', target: { direction: [1, 0, 0] }, distance: 1.54 }
    },
    { kind: 'hydrogens', select: [['scope', 'selection']], expected: { scope: 'selection' } },
    {
      kind: 'polymer',
      select: [['recipe-mode', 'random']],
      fill: [['recipe-seed', '42']],
      expected: { recipe: { kind: 'random', counts: [{ unit: 'ethylene', count: 2 }], seed: 42 } }
    },
    {
      kind: 'packing',
      select: [['mode', 'ratios']],
      fill: [
        ['ratios-0', '2.5'],
        ['totalMolecules', '6']
      ],
      expected: { ratios: [2.5], totalMolecules: 6, density: 0.2 }
    },
    {
      kind: 'nanotube',
      select: [['boundary-mode', 'finite']],
      fill: [['boundary-length', '15']],
      expected: { walls: [{ n: 5, m: 5 }], boundary: { kind: 'finite', length: 15 } }
    },
    {
      kind: 'cluster',
      select: [['shape-mode', 'box']],
      fill: [['shape-halfLengths-0', '4']],
      expected: { center: [0, 0, 0], shape: { kind: 'box', halfLengths: [4, 6, 6] } }
    }
  ]
  const recipe = page.locator('#model-options')
  for (const { kind, select = [], fill = [], expected } of mappings) {
    await test.step(kind, async () => {
      await page.locator('#model-kind').selectOption(kind)
      for (const [field, value] of select)
        await page.locator(`#model-form-${kind}-${field}`).selectOption(value)
      for (const [field, value] of fill)
        await page.locator(`#model-form-${kind}-${field}`).fill(value)
      await openModelJson(page)
      await page.locator('#model-copy-json').click()
      expect(JSON.parse(await recipe.inputValue())).toMatchObject(expected)
    })
  }
  const unsupported = JSON.stringify({
    ...(JSON.parse(await recipe.inputValue()) as Record<string, unknown>),
    metadata: { note: 'retain' }
  })
  await recipe.fill(unsupported)
  await page.locator('#model-fill-json').click()
  await expect(page.locator('#runtime-diagnostics')).toContainText('the form cannot represent')
  await expect(recipe).toHaveValue(unsupported)
  await expect(page.locator('#model-form-cluster-shape-halfLengths-0')).toHaveValue('4')
})

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
    buffer: Buffer.from(JSON.stringify({ ...view, version: 3 }))
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

test('@demo @calculation-results POSCAR receipt binds real density, restores layers and diagnoses edited geometry', async ({
  page
}) => {
  await open(page)
  const density = gunzipSync(await readFile('tests/fixtures/calculation/CHGCAR.nospin.gz'))
  const poscar = Buffer.from(density.toString('utf8').split(/\r?\n/).slice(0, 9).join('\n') + '\n')
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'POSCAR', mimeType: 'text/plain', buffer: poscar })
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '1')
  await ready(page)
  const original = await summary(page)

  await preview(page, 'poscar')
  await acceptLossIfPresent(page)
  const receiptEvent = page.waitForEvent('download')
  await page.locator('#download-poscar-receipt').click()
  const receipt = await receiptEvent
  const receiptBytes = await readFile((await receipt.path())!)
  expect(JSON.parse(receiptBytes.toString('utf8')).atoms).toMatchObject([
    { fileAtomNumber: 1, element: 'Li', fractional: [0, 0, 0] }
  ])

  const uploadResult = async (buffer: Buffer) => {
    await page
      .locator('#result-file')
      .setInputFiles({ name: 'CHGCAR', mimeType: 'text/plain', buffer })
    await page.locator('#result-import').click()
  }
  const bind = async () => {
    const details = page.locator('#result-binding-fields')
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click()
    await page.locator('#result-receipt').setInputFiles({
      name: receipt.suggestedFilename(),
      mimeType: 'application/json',
      buffer: receiptBytes
    })
    await page.locator('#result-bind').click()
    await expect(page.locator('#result-binding-status')).toHaveAttribute('data-state', 'bound')
  }
  await tab(page, 'results')
  await uploadResult(density)
  await expect(page.locator('#result-import-status')).toHaveAttribute('data-state', 'ready')
  expect(await summary(page)).toEqual(original)
  await bind()
  await page.locator('#result-threshold').fill('0.045')
  await page.locator('#result-add-layer').click()
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'ready')
  await page.locator('#result-layer-kind').selectOption('slice')
  await page.locator('#result-plane-point').fill('0 0 0.6')
  await page.locator('#result-add-layer').click()
  await expect(page.locator('#result-layer-choice option')).toHaveCount(2)
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'ready')
  await expect(
    page.locator('#viewer [data-alchemion-result-legend]').filter({ hasText: '1/Å³' })
  ).toHaveCount(2)

  await tab(page, 'export')
  await page.locator('#image-width').fill('640')
  await page.locator('#image-height').fill('480')
  await page.locator('#image-transparent').check()
  await page.evaluate(() => {
    const context = CanvasRenderingContext2D.prototype
    const fillText = context.fillText
    context.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.width === 640 && this.canvas.height === 480 && text.includes('1/Å³'))
        document.documentElement.dataset.capturedResultLegend = text
      if (maxWidth === undefined) fillText.call(this, text, x, y)
      else fillText.call(this, text, x, y, maxWidth)
    }
  })
  const pngEvent = page.waitForEvent('download')
  await page.locator('#download-png').click()
  const png = await readFile((await (await pngEvent).path())!)
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([640, 480])
  await expect(page.locator('html')).toHaveAttribute('data-captured-result-legend', /1\/Å³/)

  await tab(page, 'display')
  const viewEvent = page.waitForEvent('download')
  await page.locator('#download-view').click()
  const view = await readFile((await (await viewEvent).path())!)
  expect(JSON.parse(view.toString('utf8'))).toMatchObject({
    version: 2,
    layers: [
      { spec: { kind: 'surface', threshold: 0.045 } },
      { spec: { kind: 'slice', plane: { point: [0, 0, 0.6] } } }
    ]
  })
  await tab(page, 'results')
  await uploadResult(poscar)
  await expect(page.locator('#result-import-status')).toHaveAttribute('data-state', 'error')
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'ready')
  expect(await summary(page)).toEqual(original)

  await tab(page, 'edit')
  await page.locator('#atom-rows tr button').click()
  await page.locator('#coordinate-frame').selectOption('fractional')
  await page.locator('#atom-position').fill('0.12 0 0')
  await page.locator('#apply-atom').click()
  await ready(page)
  await tab(page, 'results')
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'incompatible')

  await page.reload()
  await ready(page)
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'POSCAR', mimeType: 'text/plain', buffer: poscar })
  await expect(page.locator('#document-summary')).toHaveAttribute('data-atom-count', '1')
  await ready(page)
  await tab(page, 'display')
  await page.locator('#import-view').setInputFiles({
    name: 'result-view.json',
    mimeType: 'application/json',
    buffer: view
  })
  await tab(page, 'results')
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'waiting')
  await uploadResult(density)
  await expect(page.locator('#result-import-status')).toHaveAttribute('data-state', 'ready')
  await bind()
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'ready')
})

test('@demo @calculation-results energy curve selects a frame and bands select a reciprocal marker', async ({
  page
}) => {
  await open(page)
  const structure: StructureSnapshot = {
    kind: 'periodic',
    cell: {
      basis: [
        [4, 0, 0],
        [1, 4, 0],
        [0, 0, 4]
      ]
    },
    atoms: [{ id: 'Si1', element: 'Si', fractional: [0, 0, 0] }],
    bonds: []
  }
  const result: CalculationResult = {
    version: 1,
    id: 'analytical-demo',
    termination: 'completed',
    convergence: 'unknown',
    sources: [{ name: 'Analytical reference', format: 'generated', sha256: '0'.repeat(64) }],
    initialFrameId: 'first',
    frames: [
      { id: 'first', step: 1, energyEv: -5, structure },
      {
        id: 'last',
        step: 2,
        energyEv: -6,
        structure: { ...structure, atoms: [{ id: 'Si1', element: 'Si', fractional: [0.2, 0, 0] }] }
      }
    ],
    data: [
      {
        id: 'bands',
        frameId: 'first',
        kind: 'bands',
        quantity: 'band-energy',
        unit: 'eV',
        fermi: { value: 2, source: 'Analytical reference' },
        points: [
          { fractional: [0, 0, 0], label: 'Γ' },
          { fractional: [0.5, 0, 0], label: 'X' },
          { fractional: [0, 0.5, 0], label: 'Y', breakBefore: true },
          { fractional: [0, 0.5, 0.5], label: 'T' }
        ],
        bands: [{ band: 1, energies: [1.5, 2, 2.2, 2.8] }]
      },
      {
        id: 'dos',
        frameId: 'first',
        kind: 'dos',
        quantity: 'density-of-states',
        unit: 'states/eV',
        fermi: { value: 2, source: 'Analytical reference' },
        energies: [1, 2, 3],
        series: [{ label: 'total', values: [0, 1, 0] }]
      }
    ]
  }
  await openCalculationResult(page, result)
  const initial = await summary(page)

  const energyPlot = page.locator('#result-chart-plots canvas[data-chart=energy]')
  const box = (await energyPlot.boundingBox())!
  await energyPlot.click({ position: { x: box.width * 0.95, y: box.height * 0.4 } })
  await expect(page.locator('#result-frame')).toHaveValue('last')
  await expect(page.locator('#result-exit-preview')).toBeEnabled()
  await page.locator('#result-exit-preview').click()
  await ready(page)
  expect(await summary(page)).toEqual(initial)
  await page.locator('#result-frame').selectOption('first')
  await expect(page.locator('#result-chart-plots canvas[data-chart=bands]')).toBeVisible()
  await expect(page.locator('#result-chart-plots canvas[data-chart=dos]')).toBeVisible()
  await page.locator('#result-energy-basis').selectOption('2')
  await page.locator('#result-k-index').selectOption('2')
  await expect(page.locator('#result-layer-choice option')).toContainText('Reciprocal k point')
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#show-bz')).toBeChecked()
})

test('@demo @calculation-results comparison, atom picking, mode playback and Fermi layers share the workbench', async ({
  page
}) => {
  await open(page)
  const structure: Extract<StructureSnapshot, { kind: 'periodic' }> = {
    kind: 'periodic',
    cell: {
      basis: [
        [4, 0, 0],
        [0, 4, 0],
        [0, 0, 4]
      ]
    },
    atoms: [
      { id: 'Si1', element: 'Si', fractional: [0.05, 0.05, 0.05] },
      { id: 'O1', element: 'O', fractional: [0.55, 0.55, 0.55] }
    ],
    bonds: []
  }
  const step = Math.PI / 8
  await openCalculationResult(page, {
    version: 1,
    id: 'analytical-layers',
    sources: [{ name: 'Analytical reference', format: 'generated', sha256: '1'.repeat(64) }],
    termination: 'completed',
    convergence: 'unknown',
    initialFrameId: 'reference',
    frames: [
      { id: 'reference', structure },
      {
        id: 'relaxed',
        structure: {
          ...structure,
          atoms: structure.atoms.map((atom) => ({
            ...atom,
            fractional: [atom.fractional[0] + 0.1, atom.fractional[1], atom.fractional[2]] as const
          }))
        }
      }
    ],
    data: [
      {
        id: 'forces',
        frameId: 'reference',
        kind: 'atomic',
        quantity: 'force',
        unit: 'eV/Å',
        vector: 'polar',
        values: [[0.2, 0, 0], null]
      },
      {
        id: 'phonons',
        frameId: 'reference',
        kind: 'vibration',
        quantity: 'mode-frequency',
        unit: 'THz',
        modes: [
          {
            id: 'stretch',
            frequencyThz: 12,
            imaginary: false,
            real: [
              [1, 0, 0],
              [-1, 0, 0]
            ]
          },
          {
            id: 'bend',
            frequencyThz: 2,
            imaginary: true,
            real: [
              [0, 1, 0],
              [0, -1, 0]
            ]
          }
        ]
      },
      {
        id: 'grid-up-1',
        frameId: 'reference',
        kind: 'fermi-grid',
        quantity: 'band energy',
        unit: 'eV',
        spin: 'up',
        band: 1,
        fermi: { value: 0, source: 'Analytical reference' },
        grid: {
          origin: [0, 0, 0],
          steps: [
            [step, 0, 0],
            [0, step, 0],
            [0, 0, step]
          ],
          dimensions: [4, 4, 4],
          periodic: [true, true, true],
          values: Array.from({ length: 64 }, (_, i) => [1, -1, -1, 1][i % 4])
        }
      }
    ]
  })
  const initial = await summary(page)
  const layerStatus = page.locator('#result-layer-status')
  const selectedLayer = page.locator('#result-layer-choice option:checked')
  const addLayer = async (kind: string, label: string) => {
    await page.locator('#result-layer-kind').selectOption(kind)
    await page.locator('#result-add-layer').click()
    await expect(selectedLayer).toContainText(label)
    await expect(layerStatus).toHaveAttribute('data-state', 'ready')
  }

  await page.locator('#result-layer-kind').selectOption('comparison')
  await page.locator('#result-target-frame').selectOption('relaxed')
  await addLayer('comparison', 'Structure comparison')
  await expect(layerStatus).toContainText('RMSD 0.40000 Å')
  await page.locator('#result-toggle-layer').click()
  await expect(layerStatus).toHaveAttribute('data-state', 'hidden')

  await page.locator('#result-layer-kind').selectOption('atomic')
  await page.locator('#result-labels').check()
  await addLayer('atomic', 'Atomic property')
  await expect(page.locator('#viewer').getByText('0.2000 eV/Å', { exact: true })).toBeVisible()
  await page.locator('#result-pick').click()
  await ready(page)
  await clickAtom(page, [0.2, 0.2, 0.2])
  await expect(page.locator('#result-pick-details')).toContainText('"atomId": "Si1"')
  expect(await details(page, 'result-pick-details')).toMatchObject({
    value: [0.2, 0, 0],
    unit: 'eV/Å'
  })

  await addLayer('vibration', 'Vibration mode')
  const spectrum = page.locator('#result-chart-plots canvas[data-chart=spectrum]')
  await expect(spectrum).toBeVisible()
  const box = (await spectrum.boundingBox())!
  await spectrum.click({ position: { x: box.width * 0.95, y: box.height * 0.4 } })
  await expect(page.locator('#result-mode')).toHaveValue('bend')
  await expect(layerStatus).toContainText('illustrative phase')
  await page.locator('#result-animate').click()
  await expect(page.locator('#result-pause-animation')).toBeEnabled()
  await page.locator('#result-pause-animation').click()
  await expect(page.locator('#result-pause-animation')).toBeDisabled()
  await page.locator('#result-stop-animation').click()
  await expect(page.locator('#result-layer-choice option')).toHaveCount(2)

  await addLayer('fermi', 'Fermi surface')
  await expect(layerStatus).toContainText('E_F = 0 eV')
  expect(await summary(page)).toEqual(initial)
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
  const beforePoscar = await summary(page)
  await page.locator('#reimport-export').click()
  await ready(page)
  const afterPoscar = await summary(page)
  expect(afterPoscar).toMatchObject({ kind: 'periodic', atomCount: '2' })
  expect(afterPoscar.documentId).not.toBe(beforePoscar.documentId)
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

test('@demo @kit-navigation responsive workbench preserves the document through tutorials and preview', async ({
  page
}, info) => {
  await open(page)
  const source = await summary(page)
  expect(source).toMatchObject({ kind: 'periodic', atomCount: '2' })
  await expect(page.locator('#show-lattice')).toBeChecked()
  const inspector = page.locator('#kit-inspector')
  await expect(inspector).toHaveAttribute('open', '')
  const [toolsBox, viewBox, inspectorBox] = await Promise.all(
    ['.tools', '.stage', '#kit-inspector'].map((selector) => page.locator(selector).boundingBox())
  )
  expect(toolsBox!.x + toolsBox!.width).toBeLessThan(viewBox!.x)
  expect(viewBox!.x + viewBox!.width).toBeLessThan(inspectorBox!.x)
  expect(inspectorBox!.y).toBe(viewBox!.y)
  await info.attach('workbench-1440', { body: await page.screenshot(), contentType: 'image/png' })

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(inspector).not.toHaveAttribute('open')
  await expect(page.locator('#selection-details')).toBeHidden()
  await page.locator('#kit-inspector-toggle').press('Enter')
  await expect(page.locator('#selection-details')).toBeVisible()
  await expect(page.locator('#viewer canvas')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)

  await tab(page, 'edit')
  await page.locator('#atom-rows tr').first().locator('button').click()
  await page.locator('#atom-element').selectOption('N')
  await page.locator('#apply-atom').click()
  await expect(page.locator('#atom-rows tr').first()).toHaveAttribute('data-element', 'N')
  await ready(page)
  const edited = await summary(page)
  const tutorial = page.locator('#kit-tutorials')
  await tutorial.press('Enter')
  await expect(tutorial).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#kit-guide-title')).toBeFocused()
  await page.locator('[data-guide-tutorial="reciprocal"]').click()
  const workflow = page.locator('[data-guide-workflow="reciprocal"]')
  await expect(workflow).toHaveText('From CIF to reciprocal space')
  await page.locator('#language-select').selectOption('zh')
  await expect(tutorial).toHaveText('教程')
  await expect(workflow).toHaveText('从 CIF 到倒易空间')
  await page.locator('[data-guide-tool="display"]').click()
  await expect(page.locator('#tab-display')).toBeFocused()
  await expect(page.locator('#tab-display')).toHaveAttribute('aria-pressed', 'true')
  expect(await summary(page)).toEqual(edited)
  const [compactView, guideBox] = await Promise.all([
    page.locator('.stage').boundingBox(),
    page.locator('#kit-guide').boundingBox()
  ])
  expect(compactView!.x + compactView!.width).toBeLessThan(guideBox!.x)
  await info.attach('workbench-1024', { body: await page.screenshot(), contentType: 'image/png' })
  await page.locator('#language-select').selectOption('en')
  await page.locator('[data-guide-action="close"]').click()
  await expect(tutorial).toBeFocused()

  await page.locator('#kit-examples').click()
  const loadMolecule = page.locator('[data-guide-example="molecule"]')
  async function confirmLoad(accept: boolean) {
    const confirmed = page.waitForEvent('dialog').then(async (dialog) => {
      if (accept) await dialog.accept()
      else await dialog.dismiss()
      expect(dialog.type()).toBe('confirm')
    })
    await Promise.all([confirmed, loadMolecule.click()])
  }
  await confirmLoad(false)
  expect(await summary(page)).toEqual(edited)
  await expect(page.locator('#undo')).toBeEnabled()
  await page.locator('#undo').click()
  await ready(page)
  await expect(page.locator('#undo')).toBeDisabled()
  await expect(page.locator('#redo')).toBeEnabled()
  await confirmLoad(true)
  await expect(page.locator('#document-summary')).toHaveAttribute('data-kind', 'molecular')
  await ready(page)
  const molecule = await summary(page)
  expect(molecule.documentId).not.toBe(source.documentId)
  await expect(page.locator('#redo')).toBeDisabled()

  await page.locator('[data-guide-action="close"]').click()
  await tab(page, 'model')
  const previewButton = page.locator('#model-preview')
  await previewButton.press('Enter')
  await expect(page.locator('#model-dialog')).toBeVisible()
  await expect(page.locator('#model-apply')).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.locator('#model-dialog')).toBeHidden()
  await expect(previewButton).toBeFocused()
  await expect(page.locator('#model-canvas canvas')).toHaveCount(0)
  expect(await summary(page)).toEqual(molecule)
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect(page.locator('#viewer canvas')).toHaveCount(0)
})

test('@demo @kit cancelled teaching result ignores a late reply and can be loaded again', async ({
  page
}) => {
  await page.addInitScript(() => {
    let hold = true
    window.Worker = new Proxy(window.Worker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker
        const add = worker.addEventListener.bind(worker)
        const remove = worker.removeEventListener.bind(worker)
        const listeners = new Map<EventListenerOrEventListenerObject, EventListener>()
        worker.addEventListener = (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions
        ) => {
          if (type !== 'message') return add(type, listener, options)
          const wrapped: EventListener = (event) => {
            const deliver = () => {
              if (typeof listener === 'function') listener.call(worker, event)
              else listener.handleEvent(event)
            }
            const reply = (event as MessageEvent<{ category: string; kind: string }>).data
            if (hold && reply.category === 'result-import') {
              hold = false
              // Deliver the real parser reply only after cancellation has settled.
              window.addEventListener('release-teaching-result', deliver, { once: true })
              document.documentElement.dataset.heldResult = reply.kind
            } else deliver()
          }
          listeners.set(listener, wrapped)
          add(type, wrapped, options)
        }
        worker.removeEventListener = (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | EventListenerOptions
        ) => {
          const wrapped = type === 'message' ? listeners.get(listener) : undefined
          if (wrapped) listeners.delete(listener)
          remove(type, wrapped ?? listener, options)
        }
        return worker
      }
    })
  })
  await open(page)
  const source = await summary(page)
  await page.locator('#kit-examples').click()
  const loadResult = page.locator('[data-guide-example="results"]')
  await loadResult.click()
  await expect(page.locator('html')).toHaveAttribute('data-held-result', 'result')
  const imports = page.locator('#result-import-status')
  await expect(imports).toHaveAttribute('data-state', 'computing')
  await page.locator('#cancel').click()
  await expect(imports).toHaveAttribute('data-state', 'empty')
  await page.evaluate(() => window.dispatchEvent(new Event('release-teaching-result')))
  await expect(page.locator('#result-choice option')).toHaveCount(0)
  expect(await summary(page)).toEqual(source)

  await loadResult.click()
  await expect(imports).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#result-choice')).toHaveValue('alchemion-teaching-result')
  expect(await summary(page)).toEqual(source)
  await page.locator('[data-guide-action="close"]').click()
  await page.locator('#result-frame').selectOption('first')
  await page.locator('#result-open').click()
  await expect(page.locator('#result-binding-status')).toHaveAttribute('data-state', 'bound')
  await ready(page)
  await expect(page.locator('#result-chart-plots canvas[data-chart="energy"]')).toBeVisible()
  await page.locator('#result-layer-kind').selectOption('surface')
  await page.locator('#result-data').selectOption('analytical-density')
  await page.locator('#result-threshold').fill('0.75')
  await page.locator('#result-add-layer').click()
  await expect(page.locator('#result-layer-status')).toHaveAttribute('data-state', 'ready')
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
    await expect(fallback.locator('#sources-link')).toBeVisible()
    await fallback.locator('#kit-tutorials').click()
    await fallback.locator('[data-guide-tutorial="measurement"]').click()
    await expect(fallback.locator('[data-guide-workflow="measurement"]')).toBeVisible()
    await expect(fallback.locator('[data-guide-example="molecule"]')).toBeDisabled()
    expect(errors).toEqual([])
  } finally {
    await unavailable.close()
  }
})

test('@dev real development Worker, form edit and public MOL export', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await open(page)
  await page.locator('#sample-select').selectOption('molecule')
  await page.locator('#load-sample').click()
  await expect(page.locator('#document-summary')).toHaveAttribute('data-kind', 'molecular')
  await ready(page)
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
