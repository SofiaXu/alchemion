import { expect, it } from 'vitest'
import { periodicDistance } from '../construction-periodic'
import { buildDefects, findInterstitials } from '../defects'
import { invertMatrix, norm, subtract } from '../math'
import { buildNanotube, cropCluster } from '../nano'
import { packMolecules } from '../packing'
import { resolveBondEndpoint } from '../symmetry'
import type {
  BondEndpoint,
  Matrix3,
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  ScientificResult,
  Vec3
} from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}

const endpoint = (sourceAtomId: string, integerCellOffset: Vec3 = [0, 0, 0]): BondEndpoint => ({
  sourceAtomId,
  symmetryOperationId: 'identity',
  integerCellOffset
})
const cubic = (side: number): Matrix3 => [
  [side, 0, 0],
  [0, side, 0],
  [0, 0, side]
]

it('finds the simple cubic body center and tests the actual metric in a skew cell', () => {
  const input: PeriodicStructureSnapshot = {
    kind: 'periodic',
    cell: { basis: cubic(2) },
    bonds: [],
    atoms: [{ id: 'corner', element: 'C', fractional: [0, 0, 0] }]
  }
  const [candidate] = value(findInterstitials(input, { grid: 4, limit: 1 }))
  expect(candidate.fractional).toEqual([0.5, 0.5, 0.5])
  expect(candidate.nearestDistance).toBeCloseTo(Math.sqrt(3), 12)
  const inserted = value(
    buildDefects(input, { kind: 'interstitial', element: 'He', fractional: [0.5, -0.5, 0.5] })
  )
  expect(inserted.snapshot.atoms[1].fractional).toEqual(candidate.fractional)
  const basis: Matrix3 = [
    [1, 0, 0],
    [0.9, 0.2, 0],
    [0, 0, 3]
  ]
  expect(
    periodicDistance([0.49, 0.49, 0], basis, invertMatrix(basis)!, 1, { remaining: 1000 })
  ).toBeCloseTo(Math.hypot(0.031, -0.102), 12)
})

it('realizes mutually exclusive occupancy with seeded quotas and removes lost bonds', () => {
  const sites: PeriodicStructureSnapshot = {
    kind: 'periodic',
    cell: { basis: cubic(4) },
    atoms: [
      { id: 'a1', element: 'Na', fractional: [0, 0, 0], occupancy: { kind: 'known', value: 0.5 } },
      { id: 'b1', element: 'K', fractional: [1, 0, 0], occupancy: { kind: 'known', value: 0.5 } },
      {
        id: 'a2',
        element: 'Na',
        fractional: [0.5, 0, 0],
        occupancy: { kind: 'known', value: 0.5 }
      },
      { id: 'b2', element: 'K', fractional: [-0.5, 0, 0], occupancy: { kind: 'known', value: 0.5 } }
    ],
    bonds: [{ id: 'parent', order: 'single', endpoints: [endpoint('a1'), endpoint('a2')] }]
  }
  const options = { kind: 'disorder', seed: 414 } as const
  const result = buildDefects(sites, options)
  const realized = value(result)
  expect(realized).toEqual(value(buildDefects(sites, options)))
  expect(realized.stats.composition).toEqual({ K: 1, Na: 1 })
  expect(realized.stats.bondCount).toBe(0)
  expect(
    realized.snapshot.atoms.every(
      ({ occupancy }) => occupancy?.kind === 'known' && occupancy.value === 1
    )
  ).toBe(true)
  expect(result.diagnostics.some(({ code }) => code === 'DEFECT_BONDS_REMOVED')).toBe(true)
  const substituted = value(
    buildDefects(realized.snapshot, {
      kind: 'substitution',
      hostElement: 'Na',
      element: 'Li',
      amount: { kind: 'fraction', value: 1 },
      seed: 8
    })
  )
  expect(substituted.stats.composition).toEqual({ K: 1, Li: 1 })
  expect(substituted.parameters.actualFraction).toBe(1)
})

it('rolls a (5,5) carbon nanotube with the expected radius, period and seam degree', () => {
  const walls = [{ n: 5, m: 5 }]
  const result = value(
    buildNanotube({ walls, boundary: { kind: 'periodic', repeats: 1, vacuum: 6 } })
  )
  const { snapshot, stats } = result
  if (snapshot.kind !== 'periodic') throw new Error('Expected a periodic nanotube.')
  const radius = (2.46 * Math.sqrt(75)) / (2 * Math.PI)
  expect(snapshot.cell.basis[2][2]).toBeCloseTo(2.46, 12)
  expect(snapshot.cell.basis[0][0]).toBeCloseTo(2 * radius + 6, 12)
  expect(stats).toEqual({ atomCount: 20, bondCount: 30, composition: { C: 20 } })
  const degree = new Map<string, number>()
  for (const bond of snapshot.bonds)
    for (const { sourceAtomId } of bond.endpoints)
      degree.set(sourceAtomId, (degree.get(sourceAtomId) ?? 0) + 1)
  expect(snapshot.atoms.every(({ id }) => degree.get(id) === 3)).toBe(true)
  expect(snapshot.bonds.some(({ endpoints }) => endpoints[1].integerCellOffset[2] !== 0)).toBe(true)
  const finite = buildNanotube({ walls, boundary: { kind: 'finite', length: 2.46 } })
  expect(value(finite).stats.bondCount).toBeLessThan(30)
  expect(finite.diagnostics.some(({ code }) => code === 'NANOTUBE_END_BONDS_CUT')).toBe(true)
  const multiwall = value(
    buildNanotube({
      walls: [
        { n: 9, m: 0 },
        { n: 18, m: 0 }
      ],
      boundary: { kind: 'periodic', repeats: 1, vacuum: 6 },
      wallSpacing: { target: 3.52, tolerance: 0.02 }
    })
  )
  expect(multiwall.stats.atomCount).toBe(108)
  expect(
    buildNanotube({
      walls: [
        { n: 5, m: 5 },
        { n: 9, m: 0 }
      ],
      boundary: { kind: 'periodic', repeats: 1, vacuum: 6 }
    }).diagnostics[0].code
  ).toBe('NANOTUBE_PERIOD')
})

it('crops seven cubic lattice images, preserving six finite bonds and original endpoints', () => {
  const input: PeriodicStructureSnapshot = {
    kind: 'periodic',
    cell: { basis: cubic(1) },
    atoms: [{ id: 'corner', element: 'C', fractional: [0, 0, 0] }],
    bonds: (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ] as const
    ).map((translation, index) => ({
      id: `direction:${index}`,
      endpoints: [endpoint('corner'), endpoint('corner', translation)],
      order: 'single'
    }))
  }
  const cropped = cropCluster(input, { center: [0, 0, 0], shape: { kind: 'sphere', radius: 1 } })
  const result = value(cropped)
  expect(result.stats).toEqual({ atomCount: 7, bondCount: 6, composition: { C: 7 } })
  const byId = new Map(result.atoms.map(({ id, origins }) => [id, origins[0].endpoint!]))
  for (const atom of result.snapshot.atoms)
    expect(value(resolveBondEndpoint(input, byId.get(atom.id)!)).cartesian).toEqual(atom.cartesian)
  expect(
    cropped.diagnostics.find(({ code }) => code === 'CLUSTER_BOUNDARY_BONDS_CUT')?.context?.count
  ).toBe(30)
})

const helium: MolecularStructureSnapshot = {
  kind: 'molecular',
  atoms: [{ id: 'he', element: 'He', cartesian: [0, 0, 0] }],
  bonds: []
}
const hydrogen: MolecularStructureSnapshot = {
  kind: 'molecular',
  atoms: [
    { id: 'h1', element: 'H', cartesian: [0, 0, 0] },
    { id: 'h2', element: 'H', cartesian: [0.74, 0, 0] }
  ],
  bonds: [{ id: 'h2-bond', order: 'single', endpoints: [endpoint('h1'), endpoint('h2')] }]
}

it('packs a seeded skew-cell mixture within a fractional region, preserving molecular bonds', () => {
  const options = {
    components: [
      { molecule: helium, ratio: 1 },
      { molecule: hydrogen, ratio: 1 }
    ],
    totalMolecules: 2,
    substrate: {
      kind: 'periodic',
      cell: {
        basis: [
          [6, 0, 0],
          [2, 6, 0],
          [0, 0, 6]
        ]
      },
      atoms: [{ id: 'surface', element: 'He', fractional: [0.5, 0.5, 0] }],
      bonds: []
    },
    seed: 814,
    minimumDistance: 0.8,
    region: { minimum: [0, 0, 0.25], maximum: [1, 1, 0.75] }
  } as const
  const result = value(packMolecules(options))
  expect(result).toEqual(value(packMolecules(options)))
  expect(result.stats).toEqual({ atomCount: 4, bondCount: 1, composition: { He: 2, H: 2 } })
  expect(
    result.snapshot.atoms
      .slice(1)
      .every(({ fractional }) => fractional[2] >= 0.25 && fractional[2] < 0.75)
  ).toBe(true)
  expect(result.parameters.regionVolume).toBe(108)
  expect(result.parameters.density).toBeCloseTo(
    ((2 * 4.002602 + 2 * 1.008) * 1.6605390666) / 216,
    12
  )
  const [a, b] = result.snapshot.bonds[0].endpoints.map(
    (edge) => value(resolveBondEndpoint(result.snapshot, edge)).cartesian
  )
  expect(norm(subtract(b, a))).toBeCloseTo(0.74, 12)
  expect(result.bonds[0].origins).toEqual([{ input: 'component:2', sourceId: 'h2-bond' }])
  const crowded = packMolecules({
    components: [{ molecule: helium, count: 1 }],
    cell: { basis: cubic(0.5) },
    seed: 1,
    minimumDistance: 0.8,
    maxAttempts: 2
  })
  expect(crowded.diagnostics[0].code).toBe('PACKING_UNREACHABLE')
})
