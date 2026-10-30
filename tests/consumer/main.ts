import type { MolecularStructureSnapshot } from 'alchemion/core'
import type { Viewer } from 'alchemion/viewer'
// @ts-expect-error the renderer contract is not an exported SDK subpath
import type { ViewerBackend } from 'alchemion/viewer/internal-contracts'
import { observeResources } from '../shared/resources'
export type PublicBoundaryProbe = ViewerBackend

// Explicitly requested diagnostics only; the formal performance collector does
// not import this consumer and never pays Error.stack cost per frame.
const rafOrigins = new Map<number, { id: number; stack: string | undefined }>()
if (new URL(location.href).searchParams.has('trace-rafs')) {
  const request = window.requestAnimationFrame.bind(window)
  const cancel = window.cancelAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => {
    const stack = new Error().stack
    const id = request((time) => {
      rafOrigins.delete(id)
      callback(time)
    })
    rafOrigins.set(id, { id, stack })
    return id
  }
  window.cancelAnimationFrame = (id) => {
    rafOrigins.delete(id)
    cancel(id)
  }
}
// Observation starts before loading any runtime SDK entry.
const resources = observeResources()
const [core, formats] = await Promise.all([import('alchemion/core'), import('alchemion/formats')])
const importResources = resources.snapshot()
const importRafDetails = [...rafOrigins.values()]
const source = (id: string, element: string): MolecularStructureSnapshot => ({
  kind: 'molecular',
  atoms: [{ id, element, cartesian: [0, 0, 0] }],
  bonds: []
})
let first: Viewer | undefined
let second: Viewer | undefined
let selectedFirst = ''
let selectedSecond = ''
async function headless() {
  const parsed = formats.parseStructure(
    `data_consumer
_cell_length_a 2
_cell_length_b 3
_cell_length_c 4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
C1 C 0.25 0.25 0.25
`,
    { format: 'cif' }
  )
  if (!parsed.structure) throw new Error(JSON.stringify(parsed.diagnostics))
  const store = core.createDocumentStore()
  if (!store.load(parsed.structure).ok) throw new Error('Store load failed')
  const id = parsed.structure.atoms[0].id
  if (
    !store.execute({
      type: 'set-position',
      atomId: id,
      position: { frame: 'fractional', value: [0.5, 0.25, 0.25] }
    }).ok
  )
    throw new Error('Store transaction failed')
  const edited = store.getState()
  if (!store.undo().ok || !store.redo().ok) throw new Error('Store history failed')
  const state = store.getState()
  if (!state.snapshot || !state.documentId) throw new Error('Missing document state')
  const { createComputationRuntime, createEditorController } = await import('alchemion/viewer')
  const runtime = createComputationRuntime()
  const sync = createComputationRuntime({ mode: 'sync' })
  const controller = createEditorController()
  let result
  try {
    const request = {
      documentId: state.documentId,
      revision: state.revision,
      task: { kind: 'derive' as const, snapshot: state.snapshot }
    }
    const [workerResult, syncResult] = await Promise.all([
      runtime.compute(request),
      sync.compute(request)
    ])
    await controller.load(state.snapshot)
    await controller.execute({ type: 'set-element', atomId: id, element: 'O' })
    await controller.undo()
    const controllerState = controller.getState()
    const poscar = formats.writeStructure(state.snapshot, { format: 'poscar', allowLoss: true })
    const cif = formats.writeStructure(state.snapshot, { format: 'cif', version: '2' })
    result = {
      importResources,
      sourceId: id,
      editedRevision: edited.revision,
      revision: state.revision,
      workerEqualsSync: JSON.stringify(workerResult.value) === JSON.stringify(syncResult.value),
      controllerStatus: controllerState.status,
      controllerElement: controllerState.snapshot!.atoms[0].element,
      controllerCanRedo: controllerState.canRedo,
      poscarDirect: poscar.text?.includes('Direct') ?? false,
      cif2Exported: cif.text?.startsWith('#\\#CIF_2.0') ?? false,
      canvases: document.querySelectorAll('canvas').length
    }
  } finally {
    runtime.dispose()
    runtime.dispose()
    sync.dispose()
    controller.dispose()
    controller.dispose()
  }
  document.querySelector('output')!.value = 'passed'
  return { ...result, released: resources.snapshot() }
}
async function run() {
  const { createViewer } = await import('alchemion/viewer')
  const store = core.createDocumentStore()
  if (!store.load(source('first-atom', 'C')).ok) throw new Error('Core public entry failed')
  first = createViewer(document.querySelector<HTMLElement>('#first')!, {
    inferBonds: false,
    interactionMode: 'select'
  })
  second = createViewer(document.querySelector<HTMLElement>('#second')!, {
    inferBonds: false,
    interactionMode: 'select'
  })
  first.subscribe((event) => {
    if (event.type === 'selection' && event.selection?.kind === 'atom')
      selectedFirst = event.selection.instance.sourceAtomId
  })
  second.subscribe((event) => {
    if (event.type === 'selection' && event.selection?.kind === 'atom')
      selectedSecond = event.selection.instance.sourceAtomId
  })
  await Promise.all([
    first.load(source('first-atom', 'C')),
    second.load(source('second-atom', 'Cl'))
  ])
  first.center()
  second.center()
  const camera = second.getCamera()
  await first.execute({ type: 'set-element', atomId: 'first-atom', element: 'O' })
  await first.undo()
  await first.redo()
  first.rotate(15, 0)
  first.center()
  const exported = formats.writeStructure(first.getSnapshot()!, { format: 'mol' })
  if (!exported.text) throw new Error(JSON.stringify(exported.diagnostics))
  const imported = formats.parseStructure(exported.text, { format: 'mol' })
  document.querySelector('output')!.value = 'ready'
  return {
    importResources,
    importRafDetails,
    first: {
      revision: first.getState().revision,
      status: first.getState().status,
      element: first.getSnapshot()!.atoms[0].element
    },
    second: {
      element: second.getSnapshot()!.atoms[0].element,
      cameraUnchanged: JSON.stringify(second.getCamera()) === JSON.stringify(camera),
      separateDocument: first.getState().documentId !== second.getState().documentId
    },
    exportedV3000: exported.text.includes('V3000'),
    importedElement: imported.structure?.atoms[0].element,
    live: resources.snapshot()
  }
}
function selection() {
  return { first: selectedFirst, second: selectedSecond }
}
function removeFirst() {
  first?.dispose()
  first?.dispose()
  return { secondReady: second?.getState().status, resources: resources.snapshot() }
}
async function finish() {
  second?.clear()
  second?.dispose()
  second?.dispose()
  const { createViewer } = await import('alchemion/viewer')
  const cycles = []
  for (let i = 0; i < 20; i++) {
    const viewer = createViewer(document.querySelector<HTMLElement>('#first')!, {
      inferBonds: false
    })
    await viewer.load(source(`cycle-${i}`, 'C'))
    await viewer.execute({ type: 'set-element', atomId: `cycle-${i}`, element: 'O' })
    const before = resources.snapshot()
    viewer.clear()
    viewer.dispose()
    viewer.dispose()
    cycles.push({ before, after: resources.snapshot() })
  }
  document.querySelector('output')!.value = 'passed'
  return { cycles, resources: resources.snapshot(), listeners: resources.listenerDetails() }
}
async function features() {
  const { createViewer } = await import('alchemion/viewer')
  const unicodeFold = formats.parseCifDocument('#\\#CIF_2.0\ndata_case\n_\u1c89 1\n_\u1c8a 2\n')
  const isotope = formats.parseStructure(
    `Bromine reference\nAlchemion\n\n  1  0  0  0  0  0            999 V2000\n${'    0.0000'.repeat(3)} Br  2${'  0'.repeat(11)}\nM  END\n`,
    { format: 'mol' }
  )
  const parsed = formats.parseStructure('Consumer\n1\n2 0 0\n0 2 0\n0 0 2\nC\n1\nDirect\n0 0 0\n', {
    format: 'poscar'
  })
  if (!parsed.structure) throw new Error('POSCAR import failed')
  const built = core.createSupercell(parsed.structure, [2, 1, 1])
  if (!built.ok) throw new Error('Supercell failed')
  const analysis = core.analyzeCoordination(built.value.snapshot, {
    centerAtomIds: [built.value.snapshot.atoms[0].id],
    rules: [{ elements: ['C', 'C'], maxDistance: 2.1 }]
  })
  if (!analysis.ok) throw new Error('Coordination failed')
  const viewer = createViewer(document.querySelector<HTMLElement>('#first')!, {
    inferBonds: false,
    renderMode: 'ball-and-stick'
  })
  let result
  try {
    await viewer.load(parsed.structure)
    await viewer.execute({ type: 'build-supercell', repetitions: [2, 1, 1] })
    const ids = viewer.getSnapshot()!.atoms.map((atom) => atom.id)
    viewer.setSelectedSourceAtomIds(ids)
    await viewer.execute(ids.map((atomId) => ({ type: 'set-element', atomId, element: 'N' })))
    await viewer.undo()
    await viewer.setOptions({
      coordination: { rules: [{ elements: ['C', 'C'], maxDistance: 2.1 }], showPolyhedra: true }
    })
    const saved = viewer.getViewState(),
      revision = viewer.getState().revision
    viewer.rotate(15, 0)
    await viewer.restoreViewState(saved)
    const image = await viewer.exportPng({ width: 96, height: 64, transparent: true })
    const decoded = await createImageBitmap(image)
    result = {
      sourceCount: viewer.getSnapshot()!.atoms.length,
      selected: viewer.getState().selectedSourceAtomIds.length,
      sourceCountPure: built.value.snapshot.atoms.length,
      mapped: built.value.atomMapping.length,
      coordination: analysis.value.centers[0].coordinationNumber,
      workerCounts: viewer
        .getState()
        .coordination?.centers.map((center) => center.coordinationNumber),
      restored: JSON.stringify(viewer.getViewState()) === JSON.stringify(saved),
      revisionUnchanged: viewer.getState().revision === revision,
      width: decoded.width,
      height: decoded.height,
      mime: image.type,
      unicodeFold: unicodeFold.diagnostics.some((entry) => entry.code === 'CIF_DUPLICATE_TAG'),
      bromineIsotope: isotope.structure?.atoms[0].isotope,
      imports: importResources
    }
    decoded.close()
  } finally {
    viewer.dispose()
    viewer.dispose()
  }
  return { ...result, released: resources.snapshot() }
}
window.consumerHarness = { headless, run, selection, removeFirst, finish, features }
declare global {
  interface Window {
    consumerHarness: {
      headless: typeof headless
      run: typeof run
      selection: typeof selection
      removeFirst: typeof removeFirst
      finish: typeof finish
      features: typeof features
    }
  }
}
