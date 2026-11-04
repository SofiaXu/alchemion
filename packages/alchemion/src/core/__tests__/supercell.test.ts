import { describe, expect, it } from 'vitest'
import { createSupercell } from '../supercell'
import { createDocumentStore } from '../editing'
import { cellVolume } from '../cell'
import { parseSymmetryOperation, resolveBondEndpoint } from '../symmetry'
import type {
  BondEndpoint,
  Matrix3,
  PeriodicStructureSnapshot,
  ScientificResult,
  Vec3
} from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const identity = value(parseSymmetryOperation('x,y,z', 'e'))
const inversion = value(parseSymmetryOperation('-x,-y,-z', 'i'))
const endpoint = (id: string, offset: Vec3 = [0, 0, 0], operation = 'e'): BondEndpoint => ({
  sourceAtomId: id,
  symmetryOperationId: operation,
  integerCellOffset: offset
})
const crystal = (): PeriodicStructureSnapshot => ({
  kind: 'periodic',
  cell: {
    basis: [
      [2, 0, 0],
      [1, 3, 0],
      [0.5, 0.25, 4]
    ]
  },
  symmetry: { operations: [identity, inversion] },
  atoms: [
    {
      id: 'a',
      element: 'C',
      fractional: [-0.75, 0.5, 0.75],
      occupancy: { kind: 'known', value: 0.5 }
    }
  ],
  bonds: []
})

describe('editable P1 supercell construction', () => {
  it('wraps oblique quotient representatives with their source positions, bonds and Direct mobility', () => {
    const input: PeriodicStructureSnapshot = {
      ...crystal(),
      symmetry: { operations: [identity] },
      atoms: [
        { id: 'a', element: 'C', fractional: [0.1, 0.8, 0.2], movable: [true, false, false] },
        { id: 'b', element: 'O', fractional: [0.8, 0.1, 0.2], movable: [true, true, false] }
      ],
      bonds: [
        { id: 'cross', order: 'single', endpoints: [endpoint('a'), endpoint('b', [1, -1, 0])] }
      ]
    }
    const matrix: Matrix3 = [
      [2, 0, 0],
      [1, 1, 0],
      [0, 0, 1]
    ]
    const result = value(createSupercell(input, matrix))
    expect(result.snapshot.cell.basis).toEqual([
      [4, 0, 0],
      [3, 3, 0],
      [0.5, 0.25, 4]
    ])
    expect(value(cellVolume(result.snapshot.cell))).toBe(48)
    expect(result.snapshot.atoms).toHaveLength(4)
    expect(result.snapshot.atoms.map((atom) => atom.fractional[0])).toEqual([
      expect.closeTo(0.65),
      expect.closeTo(0.15),
      expect.closeTo(0.35),
      expect.closeTo(0.85)
    ])
    for (const { atomId, source } of result.atomMapping) {
      const oldPosition = value(resolveBondEndpoint(input, source)).cartesian
      const newPosition = value(
        resolveBondEndpoint(result.snapshot, endpoint(atomId, [0, 0, 0], 'identity'))
      ).cartesian
      oldPosition.forEach((coordinate, axis) =>
        expect(newPosition[axis]).toBeCloseTo(coordinate, 12)
      )
    }
    expect(result.snapshot.bonds).toHaveLength(2)
    for (const bond of result.snapshot.bonds) {
      const [a, b] = bond.endpoints.map(
        (end) => value(resolveBondEndpoint(result.snapshot, end)).cartesian
      )
      expect(b.map((coordinate, i) => coordinate - a[i])).toEqual([
        expect.closeTo(1.7),
        expect.closeTo(-5.1),
        0
      ])
    }
    expect(result.snapshot.atoms[0].movable).toEqual([true, false, false])
    const incompatible = {
      ...input,
      atoms: [{ ...input.atoms[0], movable: [false, true, false] as const }, input.atoms[1]]
    }
    expect(createSupercell(incompatible, matrix)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'MOBILITY_TRANSFORM' }]
    })
    expect(
      createSupercell(input, [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]).ok
    ).toBe(false)
    expect(
      createSupercell(input, [
        [1, 0, 0],
        [1, 0, 0],
        [0, 0, 1]
      ]).ok
    ).toBe(false)
  })

  it('expands real symmetry and oblique cells with independently calculated positions and reversible sources', () => {
    const input = crystal()
    const before = JSON.stringify(input)
    const result = value(createSupercell(input, [2, 3, 1]))
    expect(result.snapshot.cell.basis).toEqual([
      [4, 0, 0],
      [3, 9, 0],
      [0.5, 0.25, 4]
    ])
    expect(value(cellVolume(result.snapshot.cell))).toBe(144)
    expect(result.snapshot.atoms).toHaveLength(12)
    expect(result.snapshot.symmetry?.spaceGroup?.hallNumber).toBe(1)
    expect(result.snapshot.symmetry?.operations).toHaveLength(1)
    const expected: number[][] = []
    for (const f of [
      [0.25, 0.5, 0.75],
      [0.75, 0.5, 0.25]
    ])
      for (let x = 0; x < 2; x++)
        for (let y = 0; y < 3; y++) expected.push([(f[0] + x) / 2, (f[1] + y) / 3, f[2]])
    expect(result.snapshot.atoms.map((atom) => [...atom.fractional]).sort()).toEqual(
      expected.sort()
    )
    for (const mapping of result.atomMapping) {
      const atom = result.snapshot.atoms.find((entry) => entry.id === mapping.atomId)!
      const actual = value(resolveBondEndpoint(input, mapping.source)).cartesian
      const [x, y, z] = atom.fractional
      expect(actual[0]).toBeCloseTo(4 * x + 3 * y + 0.5 * z, 12)
      expect(actual[1]).toBeCloseTo(9 * y + 0.25 * z, 12)
      expect(actual[2]).toBeCloseTo(4 * z, 12)
      expect(atom.occupancy).toEqual({ kind: 'known', value: 0.5 })
    }
    expect(JSON.stringify(input)).toBe(before)
    expect(createSupercell(input, [2, 3, 1])).toEqual(createSupercell(input, [2, 3, 1]))
    expect(Object.isFrozen(result.snapshot.atoms[0])).toBe(true)
  })

  it('keeps distinct disordered source sites and special-position aliases without multiplying occupancy', () => {
    const input: PeriodicStructureSnapshot = {
      ...crystal(),
      atoms: [
        {
          id: 'a',
          label: 'same',
          element: 'C',
          fractional: [0, 0, 0],
          occupancy: { kind: 'unknown' }
        },
        {
          id: 'b',
          label: 'same',
          element: 'O',
          fractional: [0, 0, 0],
          occupancy: { kind: 'known', value: 0.25 }
        }
      ]
    }
    const result = value(createSupercell(input, [2, 1, 1]))
    expect(result.snapshot.atoms).toHaveLength(4)
    expect(new Set(result.snapshot.atoms.map((atom) => atom.label)).size).toBe(4)
    expect(result.atomMapping.every((entry) => entry.equivalentSources.length === 2)).toBe(true)
    expect(result.snapshot.atoms.filter((atom) => atom.occupancy?.kind === 'unknown')).toHaveLength(
      2
    )
  })

  it('replicates long explicit boundary bonds and nonidentity bond orbits without inferring source bonds', () => {
    const input: PeriodicStructureSnapshot = {
      ...crystal(),
      symmetry: { operations: [identity] },
      atoms: [{ id: 'a', element: 'C', fractional: [0, 0, 0] }],
      bonds: [
        { id: 'long', order: 'double', endpoints: [endpoint('a'), endpoint('a', [3, -1, 0])] }
      ]
    }
    const result = value(createSupercell(input, [2, 2, 1]))
    expect(result.snapshot.bonds).toHaveLength(4)
    for (const bond of result.snapshot.bonds) {
      const a = value(resolveBondEndpoint(result.snapshot, bond.endpoints[0])).cartesian
      const b = value(resolveBondEndpoint(result.snapshot, bond.endpoints[1])).cartesian
      expect(b.map((number, index) => number - a[index])).toEqual([5, -3, 0])
      expect(bond.order).toBe('double')
    }
    const orbit: PeriodicStructureSnapshot = {
      ...crystal(),
      cell: {
        basis: [
          [10, 0, 0],
          [0, 10, 0],
          [0, 0, 10]
        ]
      },
      atoms: [
        { id: 'a', element: 'C', fractional: [0.2, 0.25, 0.25] },
        { id: 'b', element: 'O', fractional: [0.7, 0.75, 0.75] }
      ],
      bonds: [
        { id: 'orbit', order: 'triple', endpoints: [endpoint('a'), endpoint('b', [1, 1, 1], 'i')] }
      ]
    }
    const expanded = value(createSupercell(orbit, [2, 1, 1]))
    expect(expanded.snapshot.atoms).toHaveLength(8)
    expect(expanded.snapshot.bonds).toHaveLength(4)
    expect(expanded.bondMapping.every((entry) => entry.sourceBondId === 'orbit')).toBe(true)
  })

  it('clears changed measurements, preserves opaque format losses and rejects unsafe scientific inputs atomically', () => {
    const input: PeriodicStructureSnapshot = {
      ...crystal(),
      cell: {
        ...crystal().cell,
        parameterUncertainties: { a: { standardUncertainty: 0.01, literal: '2.00(1)' } }
      },
      atoms: [
        {
          ...crystal().atoms[0],
          coordinateUncertainties: {
            frame: 'fractional',
            standardUncertainties: [0.01, 0.02, 0.03],
            literals: ['-.75(1)', '.50(2)', '.75(3)']
          },
          displacementU: { kind: 'known', value: 0.02 }
        }
      ],
      metadata: {
        alchemionFormats: {
          schemaVersion: 1,
          losses: [{ code: 'CIF_UNMAPPED', message: 'retained source data' }]
        },
        custom: { atomReference: 'a' }
      }
    }
    const result = createSupercell(input, [2, 1, 1])
    const built = value(result)
    expect(built.snapshot.cell.parameterUncertainties).toBeUndefined()
    expect(built.snapshot.atoms.every((atom) => atom.coordinateUncertainties === undefined)).toBe(
      true
    )
    expect(built.snapshot.atoms.every((atom) => atom.displacementU?.kind === 'known')).toBe(true)
    expect(built.snapshot.metadata?.alchemionFormats).toEqual(input.metadata?.alchemionFormats)
    expect(built.snapshot.metadata?.custom).toEqual(input.metadata?.custom)
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'EDIT_COORDINATE_UNCERTAINTY_CLEARED',
        'EDIT_CELL_UNCERTAINTY_CLEARED'
      ])
    )
    expect(value(createSupercell(input, [1, 1, 1])).snapshot.cell.parameterUncertainties).toEqual(
      input.cell.parameterUncertainties
    )
    expect(createSupercell(input, [0, 1, 1]).ok).toBe(false)
    expect(createSupercell(input, [100_001, 1, 1]).ok).toBe(false)
    expect(
      createSupercell(
        {
          ...input,
          symmetry: { operations: [identity] },
          bonds: [
            {
              id: 'stereo',
              order: 'single',
              stereo: 'up',
              endpoints: [endpoint('a'), endpoint('a', [1, 0, 0])]
            }
          ]
        },
        [2, 1, 1]
      )
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'SUPERCELL_STEREO_UNSUPPORTED' }] })
  })

  it('builds as one undoable transaction and never reuses IDs after undo or a failed command array', () => {
    const store = createDocumentStore()
    value(
      store.load({
        ...crystal(),
        symmetry: { operations: [identity] },
        atoms: [{ id: 'supercell:atom:1', element: 'C', fractional: [0, 0, 0] }],
        bonds: [
          {
            id: 'supercell:bond:1',
            order: 'single',
            endpoints: [endpoint('supercell:atom:1'), endpoint('supercell:atom:1', [1, 0, 0])]
          }
        ]
      })
    )
    const original = store.getState()
    value(store.execute({ type: 'build-supercell', repetitions: [2, 1, 1] }))
    const first = store.getState().snapshot!
    expect(first.atoms).toHaveLength(2)
    expect(first.atoms.some((atom) => atom.id === 'supercell:atom:1')).toBe(false)
    expect(first.bonds.some((bond) => bond.id === 'supercell:bond:1')).toBe(false)
    value(store.undo())
    expect(store.getState().snapshot).toEqual(original.snapshot)
    value(store.redo())
    expect(store.getState().snapshot).toEqual(first)
    value(store.undo())
    const beforeFailure = store.getState()
    expect(
      store.execute([
        { type: 'build-supercell', repetitions: [2, 1, 1] },
        { type: 'remove-atom', atomId: 'missing' }
      ]).ok
    ).toBe(false)
    expect(store.getState()).toEqual(beforeFailure)
    value(store.execute({ type: 'build-supercell', repetitions: [2, 1, 1] }))
    expect(store.getState().documentId).toBe(original.documentId)
    expect(
      store
        .getState()
        .snapshot!.atoms.every((atom) => !first.atoms.some((old) => old.id === atom.id))
    ).toBe(true)
    expect(store.getState().canRedo).toBe(false)
    const target = store.getState().snapshot!.atoms[0].id
    value(store.execute({ type: 'set-element', atomId: target, element: 'O' }))
    expect(store.getState().snapshot!.atoms.filter((atom) => atom.element === 'O')).toHaveLength(1)
  })
})
