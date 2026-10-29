import { createCell, createStructureSnapshot, fractionalToCartesian } from 'alchemion/core'
import { createViewer, type Viewer } from 'alchemion/viewer'
import { fixture } from './fixture'
let editor: Viewer | undefined
const status = document.querySelector('output')!
const container = document.querySelector<HTMLDivElement>('#editor')!
const state = { picked: '', sourceCount: 0, loadMs: 0 }
async function run(mode: 'basic' | 'nested' | 'bench' = 'basic') {
  const start = performance.now()
  const structure = fixture()
  const cell = createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 })
  if (
    !cell.ok ||
    !fractionalToCartesian(cell.value, [0.5, 0.5, 0.5]).ok ||
    !createStructureSnapshot(structure).ok
  )
    throw new Error('Scientific core consumer failed.')
  const input =
    mode === 'bench'
      ? {
          kind: 'molecular' as const,
          atoms: Array.from({ length: 128 }, (_, i) => ({
            id: `C${i}`,
            element: 'C',
            cartesian: [(i % 8) * 2, (Math.floor(i / 8) % 4) * 2, Math.floor(i / 32) * 2] as const
          })),
          bonds: []
        }
      : structure
  editor = createViewer(container, { interactionMode: 'select' })
  editor.subscribe((event) => {
    if (event.type === 'state')
      status.value = event.state.status === 'ready' ? 'completed' : event.state.status
    if (event.type === 'selection')
      state.picked = event.selection?.kind === 'atom' ? event.selection.instance.sourceAtomId : ''
  })
  state.sourceCount = input.atoms.length
  const loading = editor.load(input)
  ;(input.atoms[0] as { element: string }).element = 'O'
  await loading
  state.loadMs = performance.now() - start
  return { ...state, count: editor.getSnapshot()?.atoms.length }
}
function dispose() {
  editor?.dispose()
  editor?.dispose()
  return container.querySelectorAll('canvas').length
}
function inputIsolation() {
  try {
    ;(editor!.getSnapshot()!.atoms as unknown[]).length = 0
  } catch {
    /* Frozen public snapshot. */
  }
  return editor!.getSnapshot()!.atoms.length
}
function missingWebGL() {
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof original
  try {
    createViewer(container)
    return 'unexpected success'
  } catch (error) {
    return (error as Error).message
  } finally {
    HTMLCanvasElement.prototype.getContext = original
  }
}
window.m1 = { run, dispose, inputIsolation, missingWebGL, state }
declare global {
  interface Window {
    m1: {
      run: typeof run
      dispose: typeof dispose
      inputIsolation: typeof inputIsolation
      missingWebGL: typeof missingWebGL
      state: typeof state
    }
  }
}
