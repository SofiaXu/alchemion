import { expect, test, type Page } from '@playwright/test'
import type { Vec3 } from 'alchemion/core'
import type { M5Api } from './m5/main'

const browserErrors = new WeakMap<Page, string[]>()

// M2 exercised a comparison protocol and M4 had no canvas. These eight integration
// cases cover the new public viewer boundary without repeating their unit suites.
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => !!window.m5)
})
test.afterEach(async ({ page }, info) => {
  await page.evaluate(async () => {
    try {
      await window.m5.dispose()
    } catch {
      /* A construction failure has no viewer. */
    }
  })
  expect(browserErrors.get(page)).toEqual([])
  await info.attach('listener-ownership', {
    body: JSON.stringify(await page.evaluate(() => window.m5.resourceDetails())),
    contentType: 'application/json'
  })
})
async function click(page: Page, point: Vec3) {
  const target = await page.evaluate((value) => window.m5.target(value), point)
  await page.mouse.click(target.x, target.y)
}
function released(counts: {
  gpuObjects: number
  workers: number
  rafs: number
  observers: number
  listeners: number
  canvases: number
}) {
  expect(counts).toEqual({
    gpuObjects: 0,
    workers: 0,
    rafs: 0,
    observers: 0,
    listeners: 0,
    canvases: 0
  })
}
test('@workspace M5 modes, styles, input isolation and numerical camera', async ({
  page,
  browser
}, info) => {
  const loaded = await page.evaluate(() => window.m5.open())
  expect(loaded.state.status).toBe('ready')
  expect(loaded.initialEvent.type).toBe('state')
  expect(loaded.isolated).toBe(true)
  expect(loaded.render?.detail).toMatchObject({ atoms: 4, bonds: 3 })
  const before = await page.locator('#viewer').screenshot()
  const space = await page.evaluate(() =>
    window.m5.options({
      renderMode: 'space-filling',
      elementStyles: { C: { color: '#00ff00', spaceFillingRadius: 1.9 } },
      atomScale: 0.8
    })
  )
  expect(space.render?.detail).toMatchObject({ atoms: 4, bonds: 0 })
  expect(before.equals(await page.locator('#viewer').screenshot())).toBe(false)
  await info.attach('space-filling', {
    body: await page.locator('#viewer').screenshot(),
    contentType: 'image/png'
  })
  const revision = space.state.revision
  const performanceView = await page.evaluate(() => window.m5.options({ showPerformance: true }))
  expect(performanceView.render?.detail.requestId).toBe(space.render?.detail.requestId)
  await page.evaluate(() => window.m5.options({ showPerformance: false }))
  const camera = await page.evaluate(() => window.m5.camera('rotate'))
  expect(camera.before.position).not.toEqual(camera.after.position)
  const zoom = await page.evaluate(() => window.m5.camera('zoom'))
  expect(zoom.before.position).not.toEqual(zoom.after.position)
  await page.evaluate(() => window.m5.camera('center'))
  expect((await page.evaluate(() => window.m5.inspect())).state.revision).toBe(revision)
  await info.attach('environment', {
    body: JSON.stringify({ browser: browser.version(), loaded }),
    contentType: 'application/json'
  })
})
test('@workspace M5 crystal helpers, symmetry, neighbors, cutoff and inferred bonds', async ({
  page
}, info) => {
  await page.evaluate(() => window.m5.open('crystal'))
  const helpers = await page.evaluate(() =>
    window.m5.options({ showLattice: true, showReciprocalLattice: true, showBrillouinZone: true })
  )
  expect(helpers.state.status).toBe('ready')
  await info.attach('triclinic-helpers', {
    body: await page.locator('#viewer').screenshot(),
    contentType: 'image/png'
  })
  expect(
    (await page.evaluate(() => window.m5.options({ showSymmetryMates: true }))).render?.detail.atoms
  ).toBe(4)
  expect(
    (
      await page.evaluate(() =>
        window.m5.options({
          showSymmetryMates: false,
          neighborCells: [[1, 0, 0]],
          cutoff: { kind: 'none' }
        })
      )
    ).render?.detail.atoms
  ).toBe(4)
  expect(
    (
      await page.evaluate(() =>
        window.m5.options({ cutoff: { kind: 'fraction', width: [0, 0, 0] } })
      )
    ).render?.detail.atoms
  ).toBe(2)
  await page.evaluate(() =>
    window.m5.open('orthogonal', {
      showLattice: true,
      showReciprocalLattice: true,
      showBrillouinZone: true
    })
  )
  await info.attach('orthogonal-helpers', {
    body: await page.locator('#viewer').screenshot(),
    contentType: 'image/png'
  })
  await page.evaluate(() =>
    window.m5.load({
      kind: 'molecular',
      atoms: [
        { id: 'left', element: 'C', cartesian: [0, 0, 0] },
        { id: 'right', element: 'O', cartesian: [1.2, 0, 0] }
      ],
      bonds: []
    })
  )
  const inferred = await page.evaluate(() =>
    window.m5.options({
      showLattice: false,
      showReciprocalLattice: false,
      showBrillouinZone: false,
      inferBonds: true
    })
  )
  expect(inferred.render?.detail).toMatchObject({ atoms: 2, bonds: 1 })
})
test('@workspace M5 atom and bond identities, auxiliary exclusion and point coordinates', async ({
  page
}) => {
  await page.evaluate(() => window.m5.open('molecule', { interactionMode: 'select' }))
  await click(page, [-3, 0, 0])
  expect((await page.evaluate(() => window.m5.inspect())).state.selection).toMatchObject({
    kind: 'atom',
    instance: { sourceAtomId: 'a', integerCellOffset: [0, 0, 0] }
  })
  await click(page, [-1.5, 0, 0])
  expect((await page.evaluate(() => window.m5.inspect())).state.selection).toMatchObject({
    kind: 'bond',
    bond: { sourceBondId: 'ab' },
    endpoints: [{ sourceAtomId: 'a' }, { sourceAtomId: 'b' }]
  })
  await page.evaluate(() =>
    window.m5.open('crystal', { interactionMode: 'pick-point', showLattice: true })
  )
  await click(page, [2.75, 1.75, 1.75])
  const observation = await page.evaluate(() => window.m5.inspect())
  const event = observation.events.filter((event) => event.type === 'point').at(-1)
  expect(event?.type).toBe('point')
  if (event?.type !== 'point' || !event.point.fractional)
    throw new Error('Missing periodic point event')
  expect(event.point.unit).toBe('angstrom')
  expect(event.point.source).toBe('surface')
  const f = event.point.fractional,
    c = event.point.cartesian
  expect(c[0]).toBeCloseTo(8 * f[0] + 2 * f[1] + f[2], 8)
  expect(c[1]).toBeCloseTo(6 * f[1] + f[2], 8)
  expect(c[2]).toBeCloseTo(7 * f[2], 8)
  await page.evaluate(() => window.m5.options({ interactionMode: 'select' }))
  await click(page, [0, 0, 0])
  expect((await page.evaluate(() => window.m5.inspect())).state.selection).toBeUndefined()
})
test('@workspace M5 ordered distance, angle, signed torsion and degenerate geometry', async ({
  page
}, info) => {
  await page.evaluate(() => window.m5.open('molecule', { interactionMode: 'measure-distance' }))
  await click(page, [-3, 0, 0])
  await click(page, [0, 0, 0])
  expect((await page.evaluate(() => window.m5.inspect())).state.measurement).toMatchObject({
    kind: 'distance',
    value: 3,
    unit: 'angstrom',
    instances: [{ sourceAtomId: 'a' }, { sourceAtomId: 'b' }]
  })
  await page.evaluate(() => window.m5.options({ interactionMode: 'measure-angle' }))
  expect((await page.evaluate(() => window.m5.inspect())).state.measurement).toBeUndefined()
  for (const point of [
    [-3, 0, 0],
    [0, 0, 0],
    [0, 3, 0]
  ] as Vec3[])
    await click(page, point)
  expect((await page.evaluate(() => window.m5.inspect())).state.measurement).toMatchObject({
    kind: 'angle',
    value: 90,
    unit: 'degree'
  })
  await page.evaluate(() => window.m5.options({ interactionMode: 'measure-torsion' }))
  for (const point of [
    [-3, 0, 0],
    [0, 0, 0],
    [0, 3, 0],
    [0, 3, 3]
  ] as Vec3[])
    await click(page, point)
  expect((await page.evaluate(() => window.m5.inspect())).state.measurement).toMatchObject({
    kind: 'torsion',
    value: 90,
    unit: 'degree',
    instances: [
      { sourceAtomId: 'a' },
      { sourceAtomId: 'b' },
      { sourceAtomId: 'c' },
      { sourceAtomId: 'd' }
    ]
  })
  await info.attach('torsion', {
    body: await page.locator('#viewer').screenshot(),
    contentType: 'image/png'
  })
  await page.evaluate(() => window.m5.open('collinear', { interactionMode: 'measure-torsion' }))
  for (const point of [
    [-3, 0, 0],
    [0, 0, 0],
    [3, 0, 0],
    [6, 0, 0]
  ] as Vec3[])
    await click(page, point)
  const result = await page.evaluate(() => window.m5.inspect())
  expect(result.state.measurement).toBeUndefined()
  expect(
    result.events.some(
      (event) =>
        event.type === 'measurement' &&
        event.diagnostics.some((entry) => entry.code === 'MEASUREMENT_UNDEFINED')
    )
  ).toBe(true)
})
test('@workspace M5 derived-instance edits, selection retention and transaction history', async ({
  page
}) => {
  await page.evaluate(() =>
    window.m5.open('crystal', {
      interactionMode: 'select',
      neighborCells: [[1, 0, 0]],
      cutoff: { kind: 'none' }
    })
  )
  await click(page, [10.75, 1.75, 1.75])
  const original = await page.evaluate(() => window.m5.inspect())
  expect(original.state.selection).toMatchObject({
    kind: 'atom',
    instance: { sourceAtomId: 'p', integerCellOffset: [1, 0, 0] }
  })
  const edited = await page.evaluate(() => window.m5.moveSelected([11.75, 1.75, 1.75]))
  expect(edited.snapshot?.kind).toBe('periodic')
  if (edited.snapshot?.kind !== 'periodic') throw new Error('Wrong source kind')
  expect(edited.snapshot.atoms[0].fractional[0]).toBeCloseTo(0.375, 8)
  expect(edited.state.selection).toMatchObject({
    kind: 'atom',
    instance: {
      id: original.state.selection?.kind === 'atom' ? original.state.selection.instance.id : ''
    }
  })
  expect(edited.state.measurement).toBeUndefined()
  await page.evaluate(() => window.m5.history('undo'))
  const redone = await page.evaluate(() => window.m5.history('redo'))
  expect(redone.state.revision).toBe(3)
  const cell = await page.evaluate(() =>
    window.m5.execute({
      type: 'set-cell',
      cell: {
        basis: [
          [10, 0, 0],
          [2, 6, 0],
          [1, 1, 7]
        ]
      }
    })
  )
  if (cell.snapshot?.kind !== 'periodic') throw new Error('Wrong source kind')
  expect(cell.snapshot.atoms[0].fractional).toEqual(edited.snapshot.atoms[0].fractional)
  const batch = await page.evaluate(() =>
    window.m5.execute([
      { type: 'add-atom', atom: { id: 'twin1', element: 'H', fractional: [0.1, 0.1, 0.1] } },
      { type: 'add-atom', atom: { id: 'twin2', element: 'He', fractional: [0.1, 0.1, 0.1] } }
    ])
  )
  expect(batch.state.revision).toBe(cell.state.revision + 1)
  const removed = await page.evaluate(() =>
    window.m5.execute({ type: 'remove-atom', atomId: 'twin1' })
  )
  expect(removed.snapshot?.atoms.some((atom) => atom.id === 'twin2')).toBe(true)
  const loaded = await page.evaluate(() =>
    window.m5.load({
      kind: 'molecular',
      atoms: [{ id: 'new', element: 'C', cartesian: [0, 0, 0] }],
      bonds: []
    })
  )
  expect(loaded.state).toMatchObject({ canUndo: false, canRedo: false })
  expect(loaded.state.documentId).not.toBe(original.state.documentId)
  expect(loaded.state.selection).toBeUndefined()
})
test('@workspace M5 real-worker races, pre/post-commit failures and GPU-stage disposal', async ({
  page
}) => {
  const result = await page.evaluate(() => window.m5.asynchronous())
  expect(result.latest).toEqual({ old: 'AbortError', title: 'new', status: 'ready' })
  expect(result.invalid).not.toBe('resolved')
  expect(result.preserved).toBe(true)
  expect(result.failed).not.toBe('resolved')
  expect(result.failedState).toEqual({ status: 'error', title: 'accepted-error' })
  expect(result.recovered).toBe('ready')
  expect(result.visual).toMatchObject({ status: 'error', sourcePreserved: true })
  expect(result.visual.result).not.toBe('resolved')
  expect(result.visual.states).not.toContain('ready')
  expect(result.visualRecovered).toBe('ready')
  expect(result.clear).toMatchObject({ result: 'AbortError', status: 'empty' })
  expect(result.disposing).toBe('AbortError')
  expect(result.status).toBe('disposed')
  released(result.resources)
})
test('@workspace M5 two viewers isolate source, camera, resize and disposal', async ({ page }) => {
  const result = await page.evaluate(() => window.m5.multiple())
  expect(result).toMatchObject({
    elementA: 'disposed',
    elementB: 'Cl',
    statusB: 'ready',
    cameraB: true,
    canvases: 1,
    resized: { width: 800, height: 600 }
  })
  released(result.resources)
})
test('@workspace M5 unavailable WebGL, context recovery and twenty measured lifecycles', async ({
  page,
  browser
}, info) => {
  const unavailable = await page.evaluate(() => window.m5.unavailable())
  expect(unavailable.error).toContain('WEBGL2_UNAVAILABLE')
  released(unavailable.resources)
  const restored = await page.evaluate(() => window.m5.contextLoss())
  expect(restored.diagnostics.some((entry) => entry.code.includes('CONTEXT'))).toBe(true)
  expect(restored.state.status).toBe('ready')
  expect(restored.render?.detail).toMatchObject({ atoms: 4, bonds: 3 })
  const lifecycles = await page.evaluate(() => window.m5.lifecycle())
  expect(lifecycles).toHaveLength(20)
  for (const round of lifecycles) {
    expect(round.before.gpuObjects).toBeGreaterThan(0)
    expect(round.before.workers).toBe(1)
    released(round.after)
  }
  await info.attach('resource-lifecycles', {
    body: JSON.stringify({ browser: browser.version(), restored, lifecycles }),
    contentType: 'application/json'
  })
})
export type M5BrowserApi = M5Api
