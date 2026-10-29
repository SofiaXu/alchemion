import { describe, expect, it } from 'vitest'
import { canonicalizeBondEndpoints, deriveStructure, inferBonds } from '../bonds'
import { deriveInstances } from '../derivation'
import { parseSymmetryOperation } from '../symmetry'
import type {
  BondEndpoint,
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  ScientificResult,
  StructureSnapshot,
  Vec3
} from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const endpoint = (
  sourceAtomId: string,
  symmetryOperationId = 'identity',
  integerCellOffset: Vec3 = [0, 0, 0]
): BondEndpoint => ({ sourceAtomId, symmetryOperationId, integerCellOffset })
const molecule = (atoms: MolecularStructureSnapshot['atoms']): MolecularStructureSnapshot => ({
  kind: 'molecular',
  atoms,
  bonds: []
})
function sourcePairs(snapshot: StructureSnapshot) {
  const derived = value(deriveStructure(snapshot))
  const atoms = new Map(derived.atoms.map((atom) => [atom.id, atom.sourceAtomId]))
  return derived.bonds
    .map((bond) =>
      bond.endpoints
        .map((id) => atoms.get(id)!)
        .sort()
        .join('-')
    )
    .sort()
}

describe('T-DOM-03 deterministic geometric bonds', () => {
  it('keeps explicit and inferred endpoints valid when symmetry mates are disabled', () => {
    const e = value(parseSymmetryOperation('x,y,z', 'custom-e'))
    const i = value(parseSymmetryOperation('-x,-y,-z', 'custom-i'))
    const snapshot: PeriodicStructureSnapshot = {
      kind: 'periodic',
      cell: {
        basis: [
          [10, 0, 0],
          [0, 10, 0],
          [0, 0, 10]
        ]
      },
      symmetry: { operations: [e, i] },
      atoms: [
        { id: 'a', element: 'C', fractional: [0.1, 0.1, 0.1] },
        { id: 'b', element: 'C', fractional: [0.24, 0.1, 0.1] }
      ],
      bonds: [
        {
          id: 'ab',
          order: 'double',
          endpoints: [endpoint('a', 'custom-e'), endpoint('b', 'custom-e')]
        }
      ]
    }
    for (const inferBonds of [false, true]) {
      const result = value(deriveStructure(snapshot, { applySymmetry: false, inferBonds }))
      expect(result.atoms).toHaveLength(2)
      expect(result.bonds).toHaveLength(1)
      expect(result.bonds[0]).toMatchObject({
        sourceBondId: 'ab',
        order: 'double',
        provenance: 'explicit'
      })
      expect(
        result.bonds[0].endpoints.every((id) => result.atoms.some((atom) => atom.id === id))
      ).toBe(true)
    }
  })
  it('rejects dangling instance provenance instead of silently skipping a fabricated source', () => {
    const snapshot = molecule([{ id: 'a', element: 'C', cartesian: [0, 0, 0] }])
    const instance = value(deriveInstances(snapshot))[0]
    for (const invalid of [
      { ...instance, sourceAtomId: 'missing' },
      { ...instance, equivalentSources: [{ ...endpoint('a'), symmetryOperationId: 'missing' }] }
    ]) {
      const result = inferBonds(snapshot, [invalid])
      expect(result.ok).toBe(false)
      expect(result.diagnostics[0].code).toBe('INSTANCE_SOURCE')
      expect('value' in result).toBe(false)
    }
  })
  it('matches an independent exhaustive small-molecule oracle across input permutations', () => {
    const snapshot = molecule([
      { id: 'a', element: 'C', cartesian: [0, 0, 0] },
      { id: 'b', element: 'H', cartesian: [1, 0, 0] },
      { id: 'c', element: 'O', cartesian: [0, 1.4, 0] },
      { id: 'd', element: 'C', cartesian: [2.7, 0, 0] },
      { id: 'e', element: 'H', cartesian: [3.7, 0, 0] },
      { id: 'f', element: 'C', cartesian: [0, 0, 0] }
    ])
    // Independent brute force: literature Cordero values, no production search/math helper.
    const radius: Record<string, number> = { C: 0.76, H: 0.31, O: 0.66 }
    const expected: string[] = []
    for (let i = 0; i < snapshot.atoms.length; i++)
      for (let j = i + 1; j < snapshot.atoms.length; j++) {
        const a = snapshot.atoms[i],
          b = snapshot.atoms[j]
        const d = Math.sqrt(
          a.cartesian.reduce((sum, value, k) => sum + (value - b.cartesian[k]) ** 2, 0)
        )
        if (d > 0.1 + 1e-8 && d <= 1.2 * (radius[a.element] + radius[b.element]) + 1e-8)
          expected.push([a.id, b.id].sort().join('-'))
      }
    const before = JSON.stringify(snapshot)
    expect(sourcePairs(snapshot)).toEqual(expected.sort())
    expect(sourcePairs({ ...snapshot, atoms: [...snapshot.atoms].reverse() })).toEqual(expected)
    expect(
      sourcePairs({
        ...snapshot,
        atoms: [...snapshot.atoms.slice(2), ...snapshot.atoms.slice(0, 2)]
      })
    ).toEqual(expected)
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it.each([
    [0.1, 0],
    [0.1 + 5e-9, 0],
    [1.824, 1],
    [1.824 + 5e-9, 1],
    [1.824 + 2e-8, 0]
  ])('uses the documented threshold and Å tolerance at distance %s', (distance, count) => {
    expect(
      value(
        deriveStructure(
          molecule([
            { id: 'a', element: 'C', cartesian: [0, 0, 0] },
            { id: 'b', element: 'C', cartesian: [distance, 0, 0] }
          ])
        )
      ).bonds
    ).toHaveLength(count)
  })

  it('preserves explicit bond order and does not invent a missing covalent radius', () => {
    const snapshot: MolecularStructureSnapshot = {
      ...molecule([
        { id: 'a', element: 'C', cartesian: [0, 0, 0] },
        { id: 'b', element: 'H', cartesian: [1, 0, 0] },
        { id: 'u', element: 'Og', cartesian: [0, 1, 0] }
      ]),
      bonds: [
        { id: 'double', endpoints: [endpoint('a'), endpoint('b')], order: 'double' },
        { id: 'unknown-explicit', endpoints: [endpoint('a'), endpoint('u')], order: 'single' }
      ]
    }
    const result = deriveStructure(snapshot)
    const derived = value(result)
    expect(derived.bonds).toHaveLength(2)
    expect(derived.bonds.every((bond) => bond.provenance === 'explicit')).toBe(true)
    expect(derived.bonds.find((bond) => bond.sourceBondId === 'double')?.order).toBe('double')
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'BOND_RADIUS_MISSING')).toBe(
      true
    )
    expect(value(deriveStructure(snapshot, { inferBonds: false })).bonds).toHaveLength(2)
  })

  it('canonicalizes both directions without dropping offset signs or operation identity', () => {
    const a = endpoint('a', 'i', [3, -2, 1]),
      b = endpoint('b', 'j', [1, 4, -1])
    expect(canonicalizeBondEndpoints(a, b)).toEqual(canonicalizeBondEndpoints(b, a))
    expect(canonicalizeBondEndpoints(a, b)[1].integerCellOffset).toEqual([-2, 6, -2])
    expect(canonicalizeBondEndpoints(a, b)[0].symmetryOperationId).toBe('i')
  })

  it('projects nonidentity explicit endpoints through the full symmetry orbit with explicit precedence', () => {
    const identity = value(parseSymmetryOperation('x,y,z', 'e')),
      inversion = value(parseSymmetryOperation('-x,-y,-z', 'i'))
    const snapshot: PeriodicStructureSnapshot = {
      kind: 'periodic',
      cell: {
        basis: [
          [10, 0, 0],
          [0, 10, 0],
          [0, 0, 10]
        ]
      },
      symmetry: { operations: [identity, inversion] },
      atoms: [
        { id: 'a', element: 'C', fractional: [0.2, 0.25, 0.25] },
        { id: 'b', element: 'C', fractional: [0.7, 0.75, 0.75] }
      ],
      bonds: [
        {
          id: 'sym-double',
          endpoints: [endpoint('a', 'e'), endpoint('b', 'i', [1, 1, 1])],
          order: 'double'
        }
      ]
    }
    const derived = value(deriveStructure(snapshot))
    expect(derived.atoms).toHaveLength(4)
    expect(derived.bonds).toHaveLength(2)
    expect(
      derived.bonds.every(
        (bond) =>
          bond.provenance === 'explicit' &&
          bond.order === 'double' &&
          bond.sourceBondId === 'sym-double'
      )
    ).toBe(true)
  })

  it('finds short bonds spanning multiple oblique cells and keeps isolated primary atoms in bond cutoff', () => {
    const identity = value(parseSymmetryOperation('x,y,z', 'e'))
    const snapshot: PeriodicStructureSnapshot = {
      kind: 'periodic',
      cell: {
        basis: [
          [1, 0, 0],
          [2.2, 0.5, 0],
          [0, 0, 10]
        ]
      },
      symmetry: { operations: [identity] },
      atoms: [
        { id: 'network', element: 'C', fractional: [0, 0, 0] },
        { id: 'isolated', element: 'Og', fractional: [0.5, 0.5, 0.5] }
      ],
      bonds: []
    }
    const derived = value(
      deriveStructure(snapshot, {
        neighborCells: [
          [-2, 1, 0],
          [-4, 2, 0]
        ],
        cutoff: { kind: 'bond' }
      })
    )
    expect(
      derived.atoms.some(
        (atom) =>
          atom.sourceAtomId === 'network' &&
          atom.integerCellOffset[0] === -2 &&
          atom.integerCellOffset[1] === 1
      )
    ).toBe(true)
    expect(
      derived.atoms.some(
        (atom) => atom.sourceAtomId === 'network' && atom.integerCellOffset[0] === -4
      )
    ).toBe(true) // 1.077 Å, still directly bonded
    expect(derived.atoms.filter((atom) => atom.sourceAtomId === 'isolated')).toHaveLength(1)
    expect(
      derived.bonds.some((bond) =>
        bond.canonicalEndpoints.every((end) => end.sourceAtomId === 'network')
      )
    ).toBe(true)
    const limited = value(deriveStructure(snapshot, { cutoff: { kind: 'bond' } }))
    expect(limited.atoms).toHaveLength(2)
    expect(limited.bonds).toHaveLength(0)
  })

  it('bond cutoff retains only the first bonded layer and keeps a permitted explicit long endpoint', () => {
    const snapshot: PeriodicStructureSnapshot = {
      kind: 'periodic',
      cell: {
        basis: [
          [1.5, 0, 0],
          [0, 10, 0],
          [0, 0, 10]
        ]
      },
      atoms: [
        { id: 'a', element: 'C', fractional: [0, 0, 0] },
        { id: 'u', element: 'Og', fractional: [0, 0.5, 0.5] }
      ],
      bonds: [
        {
          id: 'long',
          endpoints: [endpoint('u'), endpoint('u', 'identity', [3, 0, 0])],
          order: 'single'
        }
      ]
    }
    const derived = value(
      deriveStructure(snapshot, {
        neighborCells: [
          [1, 0, 0],
          [2, 0, 0],
          [3, 0, 0]
        ],
        cutoff: { kind: 'bond' }
      })
    )
    expect(
      derived.atoms
        .filter((atom) => atom.sourceAtomId === 'a')
        .map((atom) => atom.integerCellOffset[0])
        .sort((a, b) => a - b)
    ).toEqual([0, 1])
    expect(
      derived.atoms
        .filter((atom) => atom.sourceAtomId === 'u')
        .map((atom) => atom.integerCellOffset[0])
        .sort((a, b) => a - b)
    ).toEqual([0, 3])
    expect(derived.bonds.filter((bond) => bond.provenance === 'explicit')).toHaveLength(1)
  })

  it('handles 10,000 atoms using bounded spatial neighborhoods and an analytic grid edge count', () => {
    const atoms: MolecularStructureSnapshot['atoms'][number][] = []
    for (let x = 0; x < 25; x++)
      for (let y = 0; y < 20; y++)
        for (let z = 0; z < 20; z++)
          atoms.push({ id: `${x}:${y}:${z}`, element: 'C', cartesian: [1.5 * x, 1.5 * y, 1.5 * z] })
    const derived = value(deriveStructure(molecule(atoms)))
    expect(derived.atoms).toHaveLength(10000)
    // Only six axial neighbors are inside 1.824 Å; diagonal distance is sqrt(4.5).
    expect(derived.bonds).toHaveLength(24 * 20 * 20 + 25 * 19 * 20 + 25 * 20 * 19)
  })
})
