import { describe, expect, it } from 'vitest'
import type { ResultGrid } from '../calculation'
import { cross, norm, subtract } from '../math'
import {
  differenceResultGrids,
  generateResultFermiSurface,
  generateResultIsosurface,
  generateResultSlice,
  sampleResultGrid
} from '../result-geometry'
import type { ScientificResult, Vec3 } from '../types'

const value = <T>(result: ScientificResult<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}

const skew: ResultGrid = {
  origin: [1, 2, 3],
  steps: [
    [2, 0, 0],
    [0.5, 1, 0],
    [0.2, 0.3, 1]
  ],
  dimensions: [2, 2, 2],
  periodic: [true, false, false],
  values: [0, 2, 0, 2, 0, 2, 0, 2]
}

const point = (x: number, y: number, z: number): Vec3 => [
  1 + 2 * x + 0.5 * y + 0.2 * z,
  2 + y + 0.3 * z,
  3 + z
]

const gridIndex = ([x, y, z]: Vec3): Vec3 => {
  const k = z - 3
  const j = y - 2 - 0.3 * k
  return [(x - 1 - 0.5 * j - 0.2 * k) / 2, j, k]
}

const vertex = (positions: Float32Array, index: number): Vec3 => [
  positions[index * 3],
  positions[index * 3 + 1],
  positions[index * 3 + 2]
]

function area(positions: Float32Array): number {
  let total = 0
  for (let index = 0; index < positions.length / 3; index += 3) {
    const a = vertex(positions, index)
    total +=
      norm(
        cross(subtract(vertex(positions, index + 1), a), subtract(vertex(positions, index + 2), a))
      ) / 2
  }
  return total
}

describe('calculation results grid geometry', () => {
  it('samples skew grids x-fast and closes the isosurface at a periodic seam', async () => {
    expect(value(sampleResultGrid(skew, point(1.5, 0.2, 0.7)))).toBeCloseTo(1)
    expect(value(sampleResultGrid(skew, point(-0.5, 0.2, 0.7)))).toBeCloseTo(1)
    expect(sampleResultGrid(skew, point(0, 1.1, 0)).ok).toBe(false)
    const mesh = value(
      await generateResultIsosurface(skew, 1, {
        tiles: [
          [0, 0, 0],
          [1, 0, 0]
        ]
      })
    )
    expect(area(mesh.positions)).toBeCloseTo(4 * Math.sqrt(1 + 0.5 ** 2 + 0.05 ** 2), 6)
    for (let index = 0; index < mesh.values.length; index++) {
      const [x] = gridIndex(vertex(mesh.positions, index))
      expect(x % 1).toBeCloseTo(0.5, 6)
      expect(mesh.values[index]).toBe(1)
    }
    const seam = value(
      await generateResultSlice(
        skew,
        {
          point: point(2, 0, 0),
          normal: cross(skew.steps[1], skew.steps[2])
        },
        {
          tiles: [
            [0, 0, 0],
            [1, 0, 0]
          ]
        }
      )
    )
    expect(area(seam.positions)).toBeCloseTo(Math.sqrt(1 + 0.5 ** 2 + 0.05 ** 2), 6)
    expect((await generateResultIsosurface(skew, 1, { maxTriangles: 1 })).diagnostics[0].code).toBe(
      'RESULT_MESH_BUDGET'
    )
  })

  it('cuts an arbitrary skew plane and samples the secondary coloring field at its vertices', async () => {
    const grid: ResultGrid = {
      ...skew,
      periodic: [false, false, false],
      values: [0, 2, 3, 5, 5, 7, 8, 10]
    }
    const a = point(1, 0, 0)
    const b = point(0, 1, 0)
    const c = point(0, 0, 1)
    const normal = cross(subtract(b, a), subtract(c, a))
    const colored = { ...grid, values: Array.from(grid.values, (entry) => entry + 7) }
    const slice = value(
      await generateResultSlice(grid, { point: a, normal }, { colorGrid: colored })
    )
    expect(area(slice.positions)).toBeCloseTo(norm(normal) / 2, 6)
    for (let index = 0; index < slice.values.length; index++) {
      const [x, y, z] = gridIndex(vertex(slice.positions, index))
      expect(x + y + z).toBeCloseTo(1, 6)
      expect(slice.values[index]).toBeCloseTo(7 + 2 * x + 3 * y + 5 * z, 5)
    }
    const face = value(await generateResultSlice(grid, { point: grid.origin, normal: [0, 0, 1] }))
    expect(area(face.positions)).toBeCloseTo(2, 6)
  })

  it('requires explicit resampling before subtracting grids with different sampling', async () => {
    const grid: ResultGrid = { ...skew, periodic: [false, false, false] }
    const fine: ResultGrid = {
      ...grid,
      dimensions: [3, 3, 3],
      steps: [
        [1, 0, 0],
        [0.25, 0.5, 0],
        [0.1, 0.15, 0.5]
      ],
      values: Array.from({ length: 27 }, (_, index) => (index % 3) + 5)
    }
    expect((await differenceResultGrids(grid, fine)).diagnostics[0].code).toBe(
      'RESULT_GRID_REGISTRATION'
    )
    const difference = value(await differenceResultGrids(grid, fine, { resample: true }))
    for (const sample of difference.values) expect(sample).toBeCloseTo(-5, 10)
  })

  it('clips periodic analytic Fermi planes into the first zone without losing the negative tile', async () => {
    const grid: ResultGrid = {
      origin: [0, 0, 0],
      steps: [
        [0.25, 0, 0],
        [0, 0.5, 0],
        [0, 0, 0.5]
      ],
      dimensions: [4, 2, 2],
      periodic: [true, true, true],
      values: Array.from({ length: 16 }, (_, index) => [1, 0, -1, 0][index % 4])
    }
    const tau = 2 * Math.PI
    const mesh = value(
      await generateResultFermiSurface(
        grid,
        {
          basis: [
            [tau, 0, 0],
            [0, tau, 0],
            [0, 0, tau]
          ]
        },
        0
      )
    )
    expect(area(mesh.positions)).toBeCloseTo(2, 6)
    for (let index = 0; index < mesh.values.length; index++) {
      const [x, y, z] = vertex(mesh.positions, index)
      expect(Math.abs(x)).toBeCloseTo(0.25, 6)
      expect(Math.max(Math.abs(y), Math.abs(z))).toBeLessThanOrEqual(0.5)
    }
  })
})
