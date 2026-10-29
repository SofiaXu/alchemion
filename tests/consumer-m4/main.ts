import { createDocumentStore } from 'alchemion/core'
import { parseStructure, writeStructure } from 'alchemion/formats'
import { createViewer, createComputationRuntime, createEditorController } from 'alchemion/viewer'

const cif = `data_consumer
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
`

async function run() {
  const parsed = parseStructure(cif, { format: 'cif' })
  if (!parsed.structure) throw new Error(JSON.stringify(parsed.diagnostics))
  const store = createDocumentStore()
  if (!store.load(parsed.structure).ok) throw new Error('Store load failed.')
  const id = parsed.structure.atoms[0].id
  if (
    !store.execute({
      type: 'set-position',
      atomId: id,
      position: { frame: 'fractional', value: [0.5, 0.25, 0.25] }
    }).ok
  )
    throw new Error('Store transaction failed.')
  const edited = store.getState()
  if (!store.undo().ok || !store.redo().ok) throw new Error('History failed.')
  const state = store.getState()
  if (!state.snapshot || !state.documentId) throw new Error('Missing document state.')
  const runtime = createComputationRuntime()
  const sync = createComputationRuntime({ mode: 'sync' })
  const request = {
    documentId: state.documentId,
    revision: state.revision,
    task: { kind: 'derive' as const, snapshot: state.snapshot }
  }
  const [a, b] = await Promise.all([runtime.compute(request), sync.compute(request)])
  if (JSON.stringify(a.value) !== JSON.stringify(b.value))
    throw new Error('Worker and sync disagree.')
  const controller = createEditorController()
  await controller.load(state.snapshot)
  await controller.execute({ type: 'set-element', atomId: id, element: 'O' })
  await controller.undo()
  const controllerState = controller.getState()
  const encoded = writeStructure(state.snapshot, { format: 'poscar', allowLoss: true })
  if (!encoded.text?.includes('Direct')) throw new Error('POSCAR encoding failed.')
  runtime.dispose()
  runtime.dispose()
  sync.dispose()
  controller.dispose()
  controller.dispose()
  const noCanvasBeforeLegacy = document.querySelectorAll('canvas').length === 0

  // This earlier phase consumer now uses the sole formal viewer API.
  const editor = createViewer(document.querySelector<HTMLElement>('#editor')!)
  await editor.load({
    kind: 'molecular',
    atoms: [{ id: 'C1', element: 'C', cartesian: [0, 0, 0] }],
    bonds: []
  })
  editor.dispose()
  editor.dispose()
  document.querySelector('output')!.value = 'passed'
  return {
    sourceId: id,
    revision: state.revision,
    editedRevision: edited.revision,
    controllerStatus: controllerState.status,
    noCanvasBeforeLegacy,
    canvases: document.querySelectorAll('canvas').length
  }
}

window.m4Package = { run }
declare global {
  interface Window {
    m4Package: { run: typeof run }
  }
}
