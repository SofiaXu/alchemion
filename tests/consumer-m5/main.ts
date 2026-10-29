import { createDocumentStore } from 'alchemion/core'
import { parseStructure, writeStructure } from 'alchemion/formats'
import { createViewer, type Viewer } from 'alchemion/viewer'
// Private renderer contracts are not an installable SDK subpath.
// @ts-expect-error private subpath is intentionally absent from exports
import type { ViewerBackend } from 'alchemion/viewer/internal-contracts'
type NotPublic = ViewerBackend
export type PublicBoundaryProbe = NotPublic

let viewer: Viewer | undefined
let selected = ''
async function run() {
  const parsed = parseStructure(
    `data_consumer
_cell_length_a 4
_cell_length_b 5
_cell_length_c 6
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
  const store = createDocumentStore()
  if (!store.load(parsed.structure).ok) throw new Error('Core consumer failed')
  const noCanvasBeforeViewer = document.querySelectorAll('canvas').length === 0
  viewer = createViewer(document.querySelector<HTMLElement>('#editor')!, {
    renderMode: 'ball-and-stick',
    inferBonds: false,
    showSymmetryMates: false,
    interactionMode: 'select'
  })
  viewer.subscribe((event) => {
    if (event.type === 'selection' && event.selection?.kind === 'atom')
      selected = event.selection.instance.sourceAtomId
  })
  await viewer.load(parsed.structure)
  viewer.center()
  const id = parsed.structure.atoms[0].id
  await viewer.execute({ type: 'set-element', atomId: id, element: 'O' })
  await viewer.undo()
  await viewer.redo()
  const exported = writeStructure(viewer.getSnapshot()!, { format: 'cif', version: '2' })
  if (!exported.text) throw new Error('Formats consumer failed')
  const state = viewer.getState()
  document.querySelector('output')!.value = 'ready'
  return {
    revision: state.revision,
    status: state.status,
    sourceId: id,
    element: viewer.getSnapshot()!.atoms[0].element,
    noCanvasBeforeViewer,
    workerResources: performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('computation-worker'))
      .map((entry) => entry.name)
  }
}
function selection() {
  return selected
}
function finish() {
  viewer?.clear()
  viewer?.dispose()
  viewer?.dispose()
  document.querySelector('output')!.value = 'passed'
  return document.querySelectorAll('canvas').length
}
window.m5Package = { run, selection, finish }
declare global {
  interface Window {
    m5Package: { run: typeof run; selection: typeof selection; finish: typeof finish }
  }
}
