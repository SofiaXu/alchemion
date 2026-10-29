import type { MolecularStructureSnapshot } from 'alchemion/core'
import type { Viewer } from 'alchemion/viewer'
// @ts-expect-error the renderer contract is not an exported SDK subpath
import type { ViewerBackend } from 'alchemion/viewer/internal-contracts'
import { observeResources } from '../m5/resources'
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
window.m6Package = { run, selection, removeFirst, finish }
declare global {
  interface Window {
    m6Package: {
      run: typeof run
      selection: typeof selection
      removeFirst: typeof removeFirst
      finish: typeof finish
    }
  }
}
