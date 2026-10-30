import { createCell, createDocumentStore } from 'alchemion/core'
import type { MolecularStructureSnapshot, StructureSnapshot } from 'alchemion/core'
import { createComputationRuntime, createEditorController } from 'alchemion/viewer'
import type { ComputationTask, EditorState } from 'alchemion/viewer'
import { faults } from './faults'

const molecule = (id = 'a'): MolecularStructureSnapshot => ({
  kind: 'molecular',
  atoms: [{ id, element: 'C', cartesian: [0, 0, 0] }],
  bonds: []
})
function requireValue<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false }
): T {
  if (!result.ok) throw new Error('The consumer fixture was invalid.')
  return result.value
}
const cell = requireValue(createCell({ a: 2, b: 2, c: 2, alpha: 90, beta: 90, gamma: 90 }))
const crystal: StructureSnapshot = {
  kind: 'periodic',
  cell,
  atoms: [{ id: 'periodic-a', element: 'C', fractional: [0.25, 0.25, 0.25] }],
  bonds: []
}

async function production() {
  const store = createDocumentStore()
  requireValue(store.load(crystal))
  const source = store.getState()
  const sync = createComputationRuntime({ mode: 'sync' })
  const worker = createComputationRuntime()
  const equal: boolean[] = []
  const categories: string[] = []
  try {
    const tasks: ComputationTask[] = [
      { kind: 'derive', snapshot: source.snapshot!, options: { neighborCells: [[1, 0, 0]] } },
      { kind: 'reciprocal', cell },
      { kind: 'brillouin-zone', cell }
    ]
    for (const task of tasks) {
      const request = { documentId: source.documentId!, revision: source.revision, task }
      const [synchronous, asynchronous] = await Promise.all([
        sync.compute(request),
        worker.compute(request)
      ])
      equal.push(JSON.stringify(synchronous.value) === JSON.stringify(asynchronous.value))
      categories.push(asynchronous.category)
    }
    return {
      equal,
      categories,
      canvasCount: document.querySelectorAll('canvas').length,
      sourceAtoms: store.getState().snapshot!.atoms.length
    }
  } finally {
    sync.dispose()
    worker.dispose()
    worker.dispose()
  }
}

async function controllerFlows() {
  let failCommit = false
  const statuses: EditorState['status'][] = []
  const controller = createEditorController({
    commit: () => {
      if (failCommit) throw new Error('Consumer commit failed.')
    }
  })
  const unsubscribe = controller.subscribe((state) => statuses.push(state.status))
  try {
    await controller.load(molecule())
    await controller.execute([
      { type: 'set-element', atomId: 'a', element: 'N' },
      { type: 'add-atom', atom: { id: 'b', element: 'H', cartesian: [0, 0, 1] } }
    ])
    const transactionRevision = controller.getState().revision
    await controller.undo()
    await controller.redo()
    const before = controller.getState()
    let invalid = ''
    try {
      await controller.load({
        ...molecule(),
        atoms: [{ id: 'bad', element: 'Invalid', cartesian: [0, 0, 0] }]
      })
    } catch (error) {
      invalid = (error as Error & { code: string }).code
    }
    const preserved =
      controller.getState().snapshot === before.snapshot && controller.getState().canUndo
    failCommit = true
    let commitError = ''
    try {
      await controller.load(molecule('new'))
    } catch (error) {
      commitError = (error as Error & { code: string }).code
    }
    const accepted = {
      status: controller.getState().status,
      id: controller.getState().snapshot!.atoms[0].id,
      canUndo: controller.getState().canUndo,
      newDocument: controller.getState().documentId !== before.documentId
    }
    failCommit = false
    await controller.recompute()
    const recovered = controller.getState().status
    const auxiliary = await controller.compute({ kind: 'reciprocal', cell })
    return {
      transactionRevision,
      historyRevision: before.revision,
      invalid,
      preserved,
      commitError,
      accepted,
      recovered,
      auxiliaryCategory: auxiliary.category,
      auxiliaryPreservesStatus: controller.getState().status === recovered,
      statuses
    }
  } finally {
    unsubscribe()
    unsubscribe()
    controller.dispose()
  }
}

async function concurrentLifecycle() {
  let block = false
  let entered: (() => void) | undefined
  const first = createEditorController({
    commit: () => {
      if (block) {
        entered?.()
        return new Promise<void>(() => {})
      }
    }
  })
  const second = createEditorController()
  try {
    await Promise.all([first.load(molecule('first')), second.load(molecule('second'))])
    block = true
    const gate = new Promise<void>((resolve) => {
      entered = resolve
    })
    const pending = first
      .execute({ type: 'set-element', atomId: 'first', element: 'O' })
      .catch((error: Error) => error.name)
    await gate
    first.clear()
    const clearResult = await pending
    const stateAfterClear = first.getState().status
    block = false
    await first.load(molecule('replacement'))
    block = true
    const disposalGate = new Promise<void>((resolve) => {
      entered = resolve
    })
    const disposing = first.recompute().catch((error: Error) => error.name)
    await disposalGate
    first.dispose()
    first.dispose()
    const disposeResult = await disposing
    await second.execute({ type: 'set-element', atomId: 'second', element: 'F' })
    return {
      clearResult,
      stateAfterClear,
      disposeResult,
      disposed: first.getState().status,
      independent: second.getState().snapshot!.atoms[0].element,
      secondStatus: second.getState().status,
      canvasCount: document.querySelectorAll('canvas').length
    }
  } finally {
    first.dispose()
    second.dispose()
  }
}

window.runtimeHarness = { production, controllerFlows, concurrentLifecycle, faults }
declare global {
  interface Window {
    runtimeHarness: {
      production: typeof production
      controllerFlows: typeof controllerFlows
      concurrentLifecycle: typeof concurrentLifecycle
      faults: typeof faults
    }
  }
}
