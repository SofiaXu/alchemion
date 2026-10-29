import { describe, expect, test } from 'vitest'
import { createCell } from '../cell'
import { createStructureSnapshot, validateStructure } from '../structure'
import type {
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  ScientificResult
} from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const molecule = (): MolecularStructureSnapshot => ({
  kind: 'molecular',
  atoms: [
    { id: 'a', element: 'C', label: 'same', cartesian: [0, 0, 0] },
    { id: 'b', element: 'O', label: 'same', cartesian: [0, 0, 0] }
  ],
  bonds: []
})
const endpoint = (sourceAtomId: string) => ({
  sourceAtomId,
  symmetryOperationId: 'identity',
  integerCellOffset: [0, 0, 0] as const
})

describe('T-DOM-06 snapshot identity and domain validation', () => {
  test('duplicate labels and overlapping distinct sources survive isolated serialization', () => {
    const input = molecule()
    const result = createStructureSnapshot(input)
    const snapshot = value(result)
    expect(snapshot.atoms.map((a) => a.id)).toEqual(['a', 'b'])
    expect(result.diagnostics.filter((d) => d.code === 'OCCUPANCY_DEFAULT')).toHaveLength(2)
    expect(snapshot.atoms[0].occupancy).toMatchObject({
      kind: 'known',
      value: 1,
      provenance: { source: 'alchemion-default' }
    })
    expect(Object.isFrozen(snapshot.atoms[0])).toBe(true)
    Object.assign(input.atoms[0], { label: 'caller changed' })
    expect(snapshot.atoms[0].label).toBe('same')
    expect(value(createStructureSnapshot(JSON.parse(JSON.stringify(snapshot))))).toEqual(snapshot)
  })
  test('unknown/not-applicable are retained and chemical meanings remain separate', () => {
    const input: MolecularStructureSnapshot = {
      ...molecule(),
      atoms: [
        {
          id: 'x',
          element: 'Fe',
          cartesian: [0, 0, 0],
          occupancy: { kind: 'unknown' },
          formalCharge: 2,
          oxidationState: { kind: 'known', value: 3 },
          displacementU: { kind: 'not-applicable' },
          isotope: 57,
          radical: 'doublet',
          coordinateUncertainties: {
            frame: 'cartesian',
            standardUncertainties: [0.01, 0.02, 0.03],
            literals: ['0.00(1)', '0.00(2)', '0.00(3)']
          }
        }
      ]
    }
    const snapshot = value(createStructureSnapshot(input))
    expect(snapshot.atoms[0]).toMatchObject(input.atoms[0])
    expect(snapshot.atoms[0]).not.toHaveProperty('valence')
  })
  test('IDs, coordinates, occupancy and dangling bonds are validated', () => {
    const inputs: unknown[] = [
      { ...molecule(), atoms: [...molecule().atoms, { ...molecule().atoms[0] }] },
      { ...molecule(), atoms: [{ id: 'a', element: 'Uut', cartesian: [0, 0, 0] }] },
      { ...molecule(), atoms: [{ id: 'a', element: 'C', fractional: [0, 0, 0] }] },
      {
        ...molecule(),
        atoms: [
          { id: 'a', element: 'C', cartesian: [0, 0, 0], occupancy: { kind: 'known', value: 1.01 } }
        ]
      },
      {
        ...molecule(),
        atoms: [
          { id: 'a', element: 'C', cartesian: [0, 0, 0], occupancy: { kind: 'unknown', value: 1 } }
        ]
      },
      { ...molecule(), atoms: [{ id: 'a', element: 'C', cartesian: [NaN, 0, 0] }] },
      {
        ...molecule(),
        bonds: [{ id: 'z', order: 'single', endpoints: [endpoint('a'), endpoint('missing')] }]
      },
      {
        ...molecule(),
        bonds: [{ id: 'z', order: 'single', endpoints: [endpoint('a'), endpoint('a')] }]
      },
      {
        ...molecule(),
        bonds: [
          {
            id: 'z',
            order: 'single',
            endpoints: [endpoint('a'), { ...endpoint('b'), integerCellOffset: [1, 0, 0] }]
          }
        ]
      }
    ]
    for (const input of inputs)
      expect(validateStructure(input).some((d) => d.severity === 'error')).toBe(true)
  })
  test('distinct coincident sources can have an explicit bond; bond IDs are unique', () => {
    const bond = {
      id: 'z',
      order: 'double' as const,
      endpoints: [endpoint('a'), endpoint('b')] as const
    }
    expect(createStructureSnapshot({ ...molecule(), bonds: [bond] }).ok).toBe(true)
    expect(
      validateStructure({ ...molecule(), bonds: [bond, bond] }).some(
        (d) => d.code === 'BOND_ID_DUPLICATE'
      )
    ).toBe(true)
  })
  test('periodic source coordinates stay outside the unit cell and missing symmetry is diagnosed', () => {
    const input: PeriodicStructureSnapshot = {
      kind: 'periodic',
      cell: value(createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 })),
      atoms: [{ id: 'p', element: 'C', fractional: [1.25, -0.5, 0] }],
      bonds: []
    }
    const result = createStructureSnapshot(input)
    expect(value(result).atoms[0]).toMatchObject({ fractional: [1.25, -0.5, 0] })
    expect(result.diagnostics.some((d) => d.code.includes('SYMMETRY'))).toBe(true)
    expect(
      createStructureSnapshot({ ...input, symmetry: { spaceGroup: { itNumber: 14 } } }).ok
    ).toBe(true)
  })
  test('cyclic, non-finite metadata and non-data values are rejected before copying', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const metadata of [cyclic, { x: Infinity }, { x: () => 1 }, { x: new Map() }])
      expect(
        validateStructure({ ...molecule(), metadata }).some(
          (d) => d.code === 'STRUCTURE_SERIALIZATION'
        )
      ).toBe(true)
  })
})
