import { describe, expect, it } from 'vitest'
import { createCell } from '../../cell'
import { finishConstruction } from '../../construction'
import { deriveInstances } from '../../derivation'
import { createDocumentStore } from '..'
import type { DocumentChange, DocumentStore, EditCommand } from '..'
import { parseSymmetryOperation } from '../../symmetry'
import type { MolecularStructureSnapshot, ScientificResult, StructureSnapshot } from '../../types'

const molecule = (): MolecularStructureSnapshot => ({
  kind: 'molecular',
  atoms: [
    { id: 'a', element: 'C', cartesian: [0, 0, 0], label: 'duplicate' },
    { id: 'b', element: 'N', cartesian: [0, 1, 0], label: 'duplicate' }
  ],
  bonds: [
    {
      id: 'ab',
      order: 'double',
      endpoints: [
        { sourceAtomId: 'a', symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] },
        { sourceAtomId: 'b', symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] }
      ]
    }
  ]
})
function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
function loaded(snapshot: StructureSnapshot = molecule()): DocumentStore {
  const store = createDocumentStore()
  value(store.load(snapshot))
  return store
}
const change = (result: ScientificResult<DocumentChange>) => value(result).state

describe('source document transactions', () => {
  it('rolls back duplicate explicit bonds and keeps retired bond IDs reserved', () => {
    const store = loaded()
    const before = store.getState()
    expect(
      store.execute({ type: 'add-bond', id: 'duplicate', atoms: ['b', 'a'], order: 'single' }).ok
    ).toBe(false)
    expect(store.getState()).toEqual(before)
    expect(store.execute({ type: 'set-bond-order', bondId: 'ab', order: 'triple' }).ok).toBe(true)
    expect(store.getState().snapshot!.bonds[0].order).toBe('triple')
    expect(store.execute({ type: 'remove-bond', bondId: 'ab' }).ok).toBe(true)
    expect(
      store.execute({ type: 'add-bond', id: 'ab', atoms: ['a', 'b'], order: 'single' }).ok
    ).toBe(false)
    expect(store.undo().ok).toBe(true)
    expect(store.getState().snapshot!.bonds[0].order).toBe('triple')
  })

  it('binds construction to a revision and remaps retired IDs before one undoable commit', () => {
    const store = loaded()
    const { documentId } = store.getState()
    const add: EditCommand = {
      type: 'add-atom',
      atom: { id: 'generated', element: 'H', cartesian: [0, 0, 1] }
    }
    value(store.execute(add))
    value(
      store.execute({
        type: 'add-bond',
        id: 'generated-bond',
        atoms: ['a', 'generated'],
        order: 'single'
      })
    )
    const preview = store.getState().snapshot!
    const mappings = (items: readonly { id: string }[]) =>
      items.map(({ id }) => ({ id, origins: [{ input: 'source', sourceId: id }] }))
    const construction = value(
      finishConstruction(preview, mappings(preview.atoms), mappings(preview.bonds), { seed: 1 })
    )
    value(store.undo())
    value(store.undo())
    const before = store.getState()
    expect(
      store.execute({
        type: 'apply-construction',
        documentId: documentId!,
        revision: 2,
        construction
      }).ok
    ).toBe(false)
    expect(store.getState()).toEqual(before)
    const applied = change(
      store.execute({
        type: 'apply-construction',
        documentId: documentId!,
        revision: before.revision,
        construction
      })
    )
    const added = applied.snapshot!.atoms[2].id
    expect(added).not.toBe('generated')
    expect(applied.snapshot!.bonds[1]).toMatchObject({
      endpoints: [{ sourceAtomId: 'a' }, { sourceAtomId: added }]
    })
    expect(applied.snapshot!.bonds[1].id).not.toBe('generated-bond')
    expect(applied.snapshot!.metadata?.alchemionConstruction).toMatchObject({
      parameters: { seed: 1 },
      atoms: [{ id: 'a' }, { id: 'b' }, { id: added }]
    })
    expect(change(store.undo()).snapshot).toEqual(before.snapshot)
  })
  it('commits a batch once, isolates inputs and preserves duplicate-label identity', () => {
    const input = molecule()
    const store = loaded(input)
    const commands: EditCommand[] = [
      { type: 'set-element', atomId: 'a', element: 'O' },
      { type: 'set-position', atomId: 'b', position: { frame: 'cartesian', value: [0, 2, 0] } },
      { type: 'add-atom', atom: { id: 'new', element: 'H', cartesian: [1, 2, 3] } }
    ]
    const current = change(store.execute(commands))
    expect(current.revision).toBe(1)
    expect(current.snapshot!.atoms.map((atom) => atom.id)).toEqual(['a', 'b', 'new'])
    expect(input.atoms[0].element).toBe('C')
    expect(Object.isFrozen(current.snapshot!.atoms[0])).toBe(true)
    expect(store.undo().ok).toBe(true)
    expect(store.getState().snapshot).toEqual(loaded(input).getState().snapshot)
    expect(store.getState().canUndo).toBe(false)
  })

  it('rolls back an invalid batch and does not register a failed atom ID', () => {
    const store = loaded()
    const before = store.getState()
    const failed = store.execute([
      { type: 'add-atom', atom: { id: 'new', element: 'H', cartesian: [0, 0, 1] } },
      { type: 'set-element', atomId: 'missing', element: 'O' }
    ])
    expect(failed.ok).toBe(false)
    expect(store.getState()).toEqual(before)
    expect(
      store.execute({ type: 'add-atom', atom: { id: 'new', element: 'H', cartesian: [0, 0, 1] } })
        .ok
    ).toBe(true)
    const nonfinite = store.execute({
      type: 'add-atom',
      atom: { id: 'bad', element: 'H', cartesian: [0, 0, 1], metadata: { number: Number.NaN } }
    })
    expect(nonfinite.ok).toBe(false)
    expect(store.getState().revision).toBe(1)
  })

  it('ignores empty and no-op transactions without destroying a redo branch', () => {
    const store = loaded()
    value(store.execute({ type: 'set-element', atomId: 'a', element: 'O' }))
    value(store.undo())
    const before = store.getState()
    expect(value(store.execute([])).changed).toBe(false)
    expect(value(store.execute({ type: 'set-element', atomId: 'a', element: 'C' })).changed).toBe(
      false
    )
    expect(store.getState()).toEqual(before)
    expect(
      store.execute({
        type: 'set-position',
        atomId: 'a',
        position: { frame: 'fractional', value: [1, 2, 3] }
      }).ok
    ).toBe(false)
    expect(store.getState()).toEqual(before)
  })

  it('deletes only the selected ID, removes associated bonds and rejects reused identities', () => {
    const store = loaded()
    value(store.execute({ type: 'remove-atom', atomId: 'a' }))
    expect(store.getState().snapshot!.atoms.map((atom) => atom.id)).toEqual(['b'])
    expect(store.getState().snapshot!.bonds).toEqual([])
    expect(store.execute({ type: 'add-atom', atom: molecule().atoms[0] }).ok).toBe(false)
    value(store.undo())
    expect(store.getState().snapshot!.bonds[0].id).toBe('ab')
    expect(store.getState().revision).toBe(2)
    value(store.redo())
    expect(store.getState().revision).toBe(3)
    value(store.undo())
    value(store.execute({ type: 'set-element', atomId: 'b', element: 'O' }))
    expect(store.getState().canRedo).toBe(false)
  })

  it('bounds history by complete transactions, with default 100 and configurable zero', () => {
    const store = loaded()
    for (let i = 1; i <= 101; i++)
      value(
        store.execute({
          type: 'set-position',
          atomId: 'a',
          position: { frame: 'cartesian', value: [i, 0, 0] }
        })
      )
    for (let i = 0; i < 100; i++) value(store.undo())
    expect(store.getState().canUndo).toBe(false)
    expect(
      (store.getState().snapshot!.atoms[0] as MolecularStructureSnapshot['atoms'][number])
        .cartesian[0]
    ).toBe(1)
    expect(store.getState().revision).toBe(201)
    const noHistory = createDocumentStore({ historyLimit: 0 })
    value(noHistory.load(molecule()))
    value(noHistory.execute({ type: 'set-element', atomId: 'a', element: 'O' }))
    expect(noHistory.getState().canUndo).toBe(false)
    expect(() => createDocumentStore({ historyLimit: -1 })).toThrow(RangeError)
  })

  it('keeps the old document/history on invalid load and replaces identity only after validation', () => {
    const store = loaded()
    value(store.execute({ type: 'set-element', atomId: 'a', element: 'O' }))
    const before = store.getState()
    expect(
      store.load({
        ...molecule(),
        atoms: [{ id: 'bad', element: 'Invalid', cartesian: [0, 0, 0] }]
      }).ok
    ).toBe(false)
    expect(store.getState()).toEqual(before)
    value(store.load(molecule()))
    expect(store.getState().documentId).not.toBe(before.documentId)
    expect(store.getState().revision).toBe(0)
    expect(store.getState().canUndo).toBe(false)
    expect(store.clear().state.snapshot).toBeUndefined()
    expect(store.clear().changed).toBe(false)
  })

  it('preserves fractional positions and validates a combined cell/symmetry transaction', () => {
    const cell = value(createCell({ a: 2, b: 2, c: 3, alpha: 90, beta: 90, gamma: 90 }))
    const operation = value(parseSymmetryOperation('y,x,z', 'swap'))
    const store = loaded({
      kind: 'periodic',
      cell,
      symmetry: { operations: [value(parseSymmetryOperation('x,y,z', 'identity')), operation] },
      atoms: [{ id: 'a', element: 'C', fractional: [0.2, 0.3, 0.4] }],
      bonds: []
    })
    const altered = value(createCell({ a: 4, b: 2, c: 3, alpha: 90, beta: 90, gamma: 90 }))
    expect(store.execute({ type: 'set-cell', cell: altered }).ok).toBe(false)
    expect(store.getState().revision).toBe(0)
    value(
      store.execute([
        { type: 'set-cell', cell: altered },
        { type: 'set-symmetry', symmetry: undefined }
      ])
    )
    const result = store.getState().snapshot!
    expect(result.kind === 'periodic' && result.atoms[0].fractional).toEqual([0.2, 0.3, 0.4])
    expect(store.getState().revision).toBe(1)
  })

  it('maps a translated symmetry instance to its source and rejects stale instance edits', () => {
    const cell = value(createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 }))
    const store = loaded({
      kind: 'periodic',
      cell,
      symmetry: {
        operations: [
          value(parseSymmetryOperation('x,y,z', 'identity')),
          value(parseSymmetryOperation('-x,-y,-z', 'inversion'))
        ]
      },
      atoms: [{ id: 'a', element: 'C', fractional: [0.2, 0.3, 0.4] }],
      bonds: []
    })
    const initial = store.getState()
    const instance = value(deriveInstances(initial.snapshot!, { neighborCells: [[1, 0, 0]] })).find(
      (entry) => entry.symmetryOperationId === 'inversion' && entry.fractional![0] > 1
    )!
    const command: EditCommand = {
      type: 'set-instance-position',
      instance,
      cartesian: [instance.cartesian[0] + 0.2, instance.cartesian[1], instance.cartesian[2]],
      documentId: initial.documentId!,
      revision: initial.revision
    }
    value(store.execute(command))
    const result = store.getState().snapshot!
    expect(result.kind === 'periodic' && result.atoms[0].fractional[0]).toBeCloseTo(0.1, 12)
    expect(store.execute(command).ok).toBe(false)
  })

  it('clears affected uncertainty but retains unchanged measurements and restores them on undo', () => {
    const source = molecule()
    const measured = {
      ...source,
      atoms: [
        {
          ...source.atoms[0],
          coordinateUncertainties: {
            frame: 'cartesian' as const,
            standardUncertainties: [0.1, 0.1, 0.1] as const
          }
        },
        source.atoms[1]
      ]
    }
    const store = loaded(measured)
    expect(
      value(
        store.execute({
          type: 'set-position',
          atomId: 'a',
          position: { frame: 'cartesian', value: [0, 0, 0] }
        })
      ).changed
    ).toBe(false)
    const edited = store.execute({
      type: 'set-position',
      atomId: 'a',
      position: { frame: 'cartesian', value: [1, 0, 0] }
    })
    expect(
      edited.diagnostics.some((entry) => entry.code === 'EDIT_COORDINATE_UNCERTAINTY_CLEARED')
    ).toBe(true)
    expect(store.getState().snapshot!.atoms[0].coordinateUncertainties).toBeUndefined()
    value(store.undo())
    expect(store.getState().snapshot!.atoms[0].coordinateUncertainties).toEqual(
      measured.atoms[0].coordinateUncertainties
    )
  })

  it('clears atom stereo references when deleting a referenced neighbour, and undo restores parity', () => {
    const store = loaded({
      kind: 'molecular',
      atoms: [
        {
          id: 'c',
          element: 'C',
          cartesian: [0, 0, 0],
          stereoParity: { parity: 'odd', referenceAtoms: ['a', 'b', 'd', null] }
        },
        { id: 'a', element: 'Br', cartesian: [1, 0, 0] },
        { id: 'b', element: 'F', cartesian: [0, 1, 0] },
        { id: 'd', element: 'Cl', cartesian: [0, 0, 1] }
      ],
      bonds: ['a', 'b', 'd'].map((id) => ({
        id: `c-${id}`,
        order: 'single' as const,
        endpoints: [
          { sourceAtomId: 'c', symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] },
          { sourceAtomId: id, symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] }
        ] as const
      })),
      stereoAbsolute: true
    })
    const result = store.execute({ type: 'remove-atom', atomId: 'a' })
    expect(result.ok).toBe(true)
    expect(result.diagnostics.some((entry) => entry.code === 'EDIT_STEREO_PARITY_CLEARED')).toBe(
      true
    )
    expect(store.getState().snapshot!.atoms[0].stereoParity).toBeUndefined()
    value(store.undo())
    expect(store.getState().snapshot!.atoms[0].stereoParity?.referenceAtoms).toEqual([
      'a',
      'b',
      'd',
      null
    ])
  })
})
