import { describe, expect, it } from 'vitest'
import { analyzeCoordination, validateCoordinationRules } from '../coordination'
import { parseSymmetryOperation } from '../symmetry'
import type {
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  ScientificResult
} from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const cubic = (): PeriodicStructureSnapshot => ({
  kind: 'periodic',
  cell: {
    basis: [
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2]
    ]
  },
  atoms: [{ id: 'center', element: 'C', fractional: [0, 0, 0] }],
  bonds: []
})

describe('selected-source geometric coordination', () => {
  it('scales large tetrahedron volumes stably and rejects unrepresentable volume as a range error', () => {
    const tetrahedron = (length: number): MolecularStructureSnapshot => ({
      kind: 'molecular',
      atoms: [
        { id: 'center', element: 'C', cartesian: [0, 0, 0] },
        { id: 'origin', element: 'O', cartesian: [0, 0, 0] },
        { id: 'x', element: 'O', cartesian: [length, 0, 0] },
        { id: 'y', element: 'O', cartesian: [0, length, 0] },
        { id: 'z', element: 'O', cartesian: [0, 0, length * 1e-6] }
      ],
      bonds: []
    })
    const options = (length: number) => ({
      centerAtomIds: ['center'],
      rules: [{ elements: ['C', 'O'] as const, maxDistance: 2 * length }]
    })
    // Analytic determinant: L * L * (L*1e-6) / 6. L^3 overflows at 1e104,
    // but this tetrahedron's actual 1e306/6 Å^3 volume remains representable.
    const finite = value(analyzeCoordination(tetrahedron(1e104), options(1e104)))
    expect(finite.centers[0].coordinationNumber).toBe(4)
    expect(finite.centers[0].polyhedron!.volume / (1e306 / 6)).toBeCloseTo(1, 12)
    const overflow = analyzeCoordination(tetrahedron(1e110), options(1e110))
    expect(overflow).toMatchObject({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'COORDINATION_VOLUME_RANGE', context: { atomId: 'center' } }
      ]
    })
    expect(
      overflow.diagnostics.some((entry) => entry.code === 'COORDINATION_POLYHEDRON_DEGENERATE')
    ).toBe(false)
  })

  it('counts six periodic self-images and builds the analytically known octahedron', () => {
    const result = value(
      analyzeCoordination(cubic(), {
        centerAtomIds: ['center'],
        rules: [{ elements: ['C', 'C'], maxDistance: 2.1 }]
      })
    )
    const center = result.centers[0]
    expect(center.coordinationNumber).toBe(6)
    expect(center.neighbors.map((entry) => entry.distance)).toEqual([2, 2, 2, 2, 2, 2])
    expect(center.neighbors.every((entry) => entry.instance.sourceAtomId === 'center')).toBe(true)
    expect(center.polyhedron?.vertices).toHaveLength(6)
    expect(center.polyhedron?.faces).toHaveLength(8)
    expect(center.polyhedron?.triangles).toHaveLength(8)
    expect(center.polyhedron?.volume).toBeCloseTo(32 / 3, 10)
  })

  it('finds the two short skew-cell neighbors outside the immediate 27 cells', () => {
    const snapshot: PeriodicStructureSnapshot = {
      ...cubic(),
      cell: {
        basis: [
          [1, 0, 0],
          [2.2, 0.5, 0],
          [0, 0, 10]
        ]
      }
    }
    const result = analyzeCoordination(snapshot, {
      centerAtomIds: ['center'],
      rules: [{ elements: ['C', 'C'], maxDistance: 0.65 }]
    })
    const center = value(result).centers[0]
    expect(center.coordinationNumber).toBe(2)
    expect(center.neighbors.map((neighbor) => neighbor.instance.integerCellOffset).sort()).toEqual(
      [
        [-2, 1, 0],
        [2, -1, 0]
      ].sort()
    )
    for (const neighbor of center.neighbors)
      expect(neighbor.distance).toBeCloseTo(Math.sqrt(0.29), 12)
    expect(center.polyhedron).toBeUndefined()
    expect(
      result.diagnostics.some((entry) => entry.code === 'COORDINATION_POLYHEDRON_DEGENERATE')
    ).toBe(true)
  })

  it('merges coplanar hull triangles into six cube faces, even when the center lies outside the hull', () => {
    const snapshot: MolecularStructureSnapshot = {
      kind: 'molecular',
      atoms: [{ id: 'center', element: 'C', cartesian: [5, 0, 0] }],
      bonds: []
    }
    const vertices: {
      id: string
      element: string
      cartesian: readonly [number, number, number]
    }[] = []
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1])
          vertices.push({ id: `${x},${y},${z}`, element: 'O', cartesian: [x, y, z] })
    const input = {
      ...snapshot,
      atoms: [
        ...snapshot.atoms,
        ...vertices,
        {
          ...vertices[0],
          id: 'disordered-corner',
          occupancy: { kind: 'known' as const, value: 0.5 }
        }
      ]
    }
    const before = JSON.stringify(input)
    const center = value(
      analyzeCoordination(input, {
        centerAtomIds: ['center'],
        rules: [{ elements: ['O', 'C'], maxDistance: 7 }]
      })
    ).centers[0]
    expect(center.coordinationNumber).toBe(9)
    expect(center.polyhedron?.vertices).toHaveLength(8)
    expect(
      center.polyhedron?.vertexNeighborIndices.filter((indices) => indices.length === 2)
    ).toHaveLength(1)
    expect(center.polyhedron?.faces.map((face) => face.length)).toEqual([4, 4, 4, 4, 4, 4])
    expect(center.polyhedron?.triangles).toHaveLength(12)
    expect(center.polyhedron?.volume).toBeCloseTo(8, 10)
    expect(JSON.stringify(input)).toBe(before)
    // Independent half-space check for the outward-facing cube polygons.
    const hull = center.polyhedron!
    for (const face of hull.faces) {
      const a = hull.vertices[face[0]],
        b = hull.vertices[face[1]],
        c = hull.vertices[face[2]]
      const u = b.map((entry, i) => entry - a[i]),
        v = c.map((entry, i) => entry - a[i])
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
      ]
      for (const point of hull.vertices)
        expect(
          normal.reduce((sum, entry, i) => sum + entry * (point[i] - a[i]), 0)
        ).toBeLessThanOrEqual(1e-9)
    }
  })

  it('uses inclusive pair thresholds, keeps disordered sites and chooses stable centers independent of input order', () => {
    const snapshot: MolecularStructureSnapshot = {
      kind: 'molecular',
      atoms: [
        { id: 'c', element: 'C', cartesian: [0, 0, 0] },
        { id: 'o1', element: 'O', cartesian: [1, 0, 0], occupancy: { kind: 'known', value: 0.5 } },
        { id: 'o2', element: 'O', cartesian: [1, 0, 0], occupancy: { kind: 'unknown' } },
        { id: 'outside', element: 'O', cartesian: [1 + 2e-8, 0, 0] }
      ],
      bonds: []
    }
    const options = {
      centerAtomIds: ['c', 'c'],
      rules: [{ elements: ['C', 'O'] as const, minDistance: 1, maxDistance: 1 }]
    }
    const result = value(analyzeCoordination(snapshot, options))
    expect(result.centers).toHaveLength(1)
    expect(result.centers[0].coordinationNumber).toBe(2)
    expect(
      analyzeCoordination({ ...snapshot, atoms: [...snapshot.atoms].reverse() }, options)
    ).toEqual(analyzeCoordination(snapshot, options))
    expect(
      validateCoordinationRules([...options.rules, { elements: ['O', 'C'], maxDistance: 2 }])[0]
        .code
    ).toBe('COORDINATION_RULE_DUPLICATE')
    expect(analyzeCoordination(snapshot, { ...options, centerAtomIds: ['missing'] }).ok).toBe(false)
    expect(
      value(analyzeCoordination(snapshot, { centerAtomIds: ['c'], rules: [] })).centers[0].neighbors
    ).toEqual([])
  })

  it('deduplicates special-position aliases while retaining distinct coincident sources', () => {
    const snapshot: PeriodicStructureSnapshot = {
      ...cubic(),
      symmetry: {
        operations: [
          value(parseSymmetryOperation('x,y,z', 'z')),
          value(parseSymmetryOperation('-x,-y,-z', 'a'))
        ]
      },
      atoms: [
        { id: 'c', element: 'C', fractional: [0, 0, 0] },
        { id: 'o', element: 'O', fractional: [0, 0, 0] }
      ]
    }
    const center = value(
      analyzeCoordination(snapshot, {
        centerAtomIds: ['c'],
        rules: [{ elements: ['C', 'O'], maxDistance: 0.1 }]
      })
    ).centers[0]
    expect(center.center.symmetryOperationId).toBe('a')
    expect(center.center.equivalentSources).toHaveLength(2)
    expect(center.coordinationNumber).toBe(1)
    expect(center.neighbors[0].distance).toBe(0)
    expect(center.neighbors[0].instance.equivalentSources).toHaveLength(2)
  })

  it('budgets unique images rather than source-by-center comparisons', () => {
    const atoms: PeriodicStructureSnapshot['atoms'][number][] = []
    for (let i = 0; i < 400; i++) {
      atoms.push({ id: `c${i}`, element: 'C', fractional: [0.1 + i / 1000, 0.5, 0.5] })
      atoms.push({ id: `o${i}`, element: 'O', fractional: [0.10025 + i / 1000, 0.5, 0.5] })
    }
    const snapshot: PeriodicStructureSnapshot = {
      kind: 'periodic',
      cell: {
        basis: [
          [1000, 0, 0],
          [0, 1000, 0],
          [0, 0, 1000]
        ]
      },
      atoms,
      bonds: []
    }
    const result = value(
      analyzeCoordination(snapshot, {
        centerAtomIds: atoms.filter((atom) => atom.element === 'C').map((atom) => atom.id),
        rules: [{ elements: ['C', 'O'], maxDistance: 0.3 }]
      })
    )
    expect(result.centers).toHaveLength(400)
    expect(result.centers.every((center) => center.coordinationNumber === 1)).toBe(true)
  })
})
