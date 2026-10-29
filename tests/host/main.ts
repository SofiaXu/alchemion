import { createCell, createStructureSnapshot, fractionalToCartesian } from 'alchemion/core'
import { CifParser } from 'alchemion/formats'
import { AlchemionEditor, type IEditorOptions } from 'alchemion/viewer'

// Project-authored synthetic fixture: orthogonal unit cell, one carbon at (1/4,1/4,1/4).
const cif = `data_m1
_cell_length_a 1
_cell_length_b 1
_cell_length_c 1
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_cell_volume 1
_space_group_IT_number 1
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
C1 0.25 0.25 0.25
`

let editor: AlchemionEditor | undefined
const status = document.querySelector('output')!
const container = document.querySelector<HTMLDivElement>('#editor')!
const state = { picked: '', sourceCount: 0, loadMs: 0 }

async function run(mode: 'basic' | 'nested' | 'bench' = 'basic') {
  const start = performance.now()
  const structure = new CifParser().parse(cif)
  // New scientific core is exercised independently of the historical parser/viewer model.
  const cell = createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 })
  if (!cell.ok) throw new Error('Scientific core cell creation failed.')
  const position = fractionalToCartesian(cell.value, [0.5, 0.5, 0.5])
  const source = createStructureSnapshot({
    kind: 'molecular',
    atoms: [{ id: 'core-carbon', element: 'C', cartesian: [0, 0, 0] }],
    bonds: []
  })
  if (
    !position.ok ||
    position.value.some((n, i) => Math.abs(n - [1, 1.5, 2][i]) > 1e-9) ||
    !source.ok ||
    source.value.atoms[0].id !== 'core-carbon'
  )
    throw new Error('Public scientific core consumer failed.')
  if (mode === 'bench') {
    const atom = structure.atoms[0]
    delete structure.lattice
    structure.atoms = Array.from({ length: 128 }, (_, i) => ({
      ...atom,
      name: `C${i}`,
      x: (i % 8) * 2,
      y: (Math.floor(i / 8) % 4) * 2,
      z: Math.floor(i / 32) * 2
    }))
  }
  const options: Partial<IEditorOptions> = { clickMode: 'select' }
  if (mode === 'nested') {
    options.showNeighborCells = true
    options.neighborCells = Array.from({ length: 2000 }, (_, i) => [i, 0, 0])
    options.unitCellCutoffMethod = 'fraction'
    options.unitCellCutoffFraction = [0, 0, 0]
  }
  editor = new AlchemionEditor(container, options)
  editor.pickedAtom.subscribe((atom) => {
    state.picked = atom?.name ?? ''
  })
  const ready = new Promise<void>((done) => {
    editor!.status.subscribe((value) => {
      status.value = value
      if (value === 'completed') done()
    })
  })
  state.sourceCount = structure.atoms.length
  editor.loadStructure(structure)
  structure.atoms[0].name = 'caller mutation after load'
  await ready
  editor.centerStructure()
  await new Promise<void>((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done()))
  )
  state.loadMs = performance.now() - start
  return { ...state, count: editor.structure?.atoms.length }
}

function dispose() {
  editor?.dispose()
  editor?.dispose()
  return container.querySelectorAll('canvas').length
}

function inputIsolation() {
  const snapshot = editor!.structure!
  snapshot.atoms.length = 0
  return editor?.structure?.atoms.length
}

function missingWebGL() {
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof original
  try {
    new AlchemionEditor(container)
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
