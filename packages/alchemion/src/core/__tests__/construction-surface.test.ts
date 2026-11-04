import { expect, it } from 'vitest'
import { fractionalToCartesian } from '../cell'
import { createCrystal } from '../crystal-builder'
import { createInterface, findInterfaceMatches, placeAdsorbate } from '../interface-builder'
import { createSlab, listSlabTerminations, slabBottomAtomIds } from '../surface'
import type {
  BondEndpoint,
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  ScientificResult,
  Vec3
} from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}

const cubic = (edge = 3): PeriodicStructureSnapshot => ({
  kind: 'periodic',
  cell: {
    basis: [
      [edge, 0, 0],
      [0, edge, 0],
      [0, 0, edge]
    ]
  },
  atoms: [{ id: 'a', element: 'C', fractional: [0, 0, 0] }],
  bonds: []
})
const endpoint = (sourceAtomId: string, integerCellOffset: Vec3 = [0, 0, 0]): BondEndpoint => ({
  sourceAtomId,
  symmetryOperationId: 'identity',
  integerCellOffset
})

it('builds a crystal with an unambiguous Hall setting and reports expanded special positions', () => {
  const source = cubic()
  const crystal = value(
    createCrystal({
      cell: source.cell,
      symmetry: { spaceGroup: { hallNumber: 523 } },
      atoms: source.atoms
    })
  )
  expect(crystal.parameters.expandedAtomCount).toBe(4)
  expect(crystal.snapshot.atoms).toHaveLength(1)
  expect(
    createCrystal({
      cell: source.cell,
      symmetry: { spaceGroup: { itNumber: 14 } },
      atoms: source.atoms
    })
  ).toMatchObject({ ok: false, diagnostics: [{ code: 'SYMMETRY_AMBIGUOUS' }] })
})

it('builds analytic cubic (111) planes and respects the occupied thickness and vacuum', () => {
  const slab = value(createSlab(cubic(), { hkl: [2, 2, 2], thickness: { repeats: 3 }, vacuum: 5 }))
  expect(slab.parameters.hkl).toEqual([1, 1, 1])
  expect(slab.parameters.spacing).toBeCloseTo(Math.sqrt(3))
  expect(slab.parameters.occupiedThickness).toBeCloseTo(2 * Math.sqrt(3))
  expect(slab.snapshot.atoms).toHaveLength(3)
  expect(
    slab.snapshot.cell.basis
      .slice(0, 2)
      .map((vector) => vector.reduce((sum, coordinate) => sum + coordinate, 0))
  ).toEqual([0, 0])
  const c = (2 * Math.sqrt(3) + 5) / Math.sqrt(3)
  expect(slab.snapshot.cell.basis[2]).toEqual([
    expect.closeTo(c),
    expect.closeTo(c),
    expect.closeTo(c)
  ])
})

it('selects opposite oblique-cell terminations and keeps only internal or in-plane bonds', () => {
  const source: PeriodicStructureSnapshot = {
    ...cubic(),
    cell: {
      basis: [
        [2, 0, 0],
        [0.4, 3, 0],
        [0.3, 0.6, 4]
      ]
    },
    atoms: [
      { id: 'a', element: 'C', fractional: [0, 0, 0] },
      { id: 'b', element: 'O', fractional: [0, 0, 0.5] }
    ],
    bonds: [
      { id: 'in-plane', order: 'single', endpoints: [endpoint('a'), endpoint('a', [1, 0, 0])] },
      { id: 'normal', order: 'single', endpoints: [endpoint('a'), endpoint('a', [0, 0, 1])] }
    ]
  }
  const hkl: Vec3 = [0, 0, 1]
  const terminations = value(listSlabTerminations(source, hkl))
  expect(terminations.map((entry) => entry.after)).toEqual([['O'], ['C']])
  const options = { hkl, termination: 0, thickness: { repeats: 2 }, vacuum: 8 }
  const result = createSlab(source, options)
  const slab = value(result)
  expect(slab.parameters.spacing).toBeCloseTo(4)
  expect(slab.parameters.bottomElements).toEqual(['O'])
  expect(
    value(createSlab(source, { ...options, termination: 1 })).parameters.bottomElements
  ).toEqual(['C'])
  expect(slab.bonds.map(({ origins }) => origins[0].sourceId).sort()).toEqual([
    'in-plane',
    'in-plane',
    'normal'
  ])
  expect(
    slab.snapshot.bonds.every(({ endpoints }) =>
      endpoints.every((end) => end.integerCellOffset[2] === 0)
    )
  ).toBe(true)
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'SLAB_BOND_TRUNCATED' })])
  )
  const [bottom] = value(slabBottomAtomIds(slab.snapshot))
  expect(slab.snapshot.atoms.find((atom) => atom.id === bottom)?.element).toBe('O')
})

it('matches a strained bilayer at an analytic gap and places a rigid, bonded molecule', () => {
  const reference = cubic()
  const upper = cubic(3.1)
  const [match] = value(
    findInterfaceMatches(reference, upper, { maxAreaMultiple: 1, maxStrain: 0.04 })
  )
  expect(match.strain).toBeCloseTo(1 - 3 / 3.1, 12)
  expect(match.area).toBe(9)
  expect(
    value(findInterfaceMatches(reference, upper, { maxAreaMultiple: 1, maxStrain: 0.01 }))
  ).toHaveLength(0)
  const joined = value(createInterface(reference, upper, { match, gap: 2, vacuum: 6 }))
  expect(joined.snapshot.cell.basis[2]).toEqual([0, 0, 8])
  expect(joined.snapshot.atoms.map((atom) => atom.fractional[2] * 8)).toEqual([3, 5])
  expect(joined.atoms.map((atom) => atom.origins[0].input)).toEqual(['reference', 'overlayer'])
  const molecule: MolecularStructureSnapshot = {
    kind: 'molecular',
    atoms: [
      { id: 'm1', element: 'C', cartesian: [0, 0, 0] },
      { id: 'm2', element: 'O', cartesian: [1, 0, 0] }
    ],
    bonds: [{ id: 'm-bond', order: 'double', endpoints: [endpoint('m1'), endpoint('m2')] }]
  }
  const placed = value(
    placeAdsorbate(joined.snapshot, molecule, {
      anchorAtomId: 'm1',
      target: [1, 1, 5],
      height: 1,
      rotation: { axis: [0, 0, 1], angle: 90 }
    })
  )
  const positions = placed.snapshot.atoms
    .slice(-2)
    .map((atom) => value(fractionalToCartesian(placed.snapshot.cell, atom.fractional)))
  expect(positions[0]).toEqual([expect.closeTo(1), expect.closeTo(1), expect.closeTo(6)])
  expect(positions[1]).toEqual([expect.closeTo(1), expect.closeTo(2), expect.closeTo(6)])
  expect(placed.snapshot.bonds.at(-1)?.order).toBe('double')
  expect(placed.bonds.at(-1)?.origins[0].sourceId).toBe('m-bond')
})
