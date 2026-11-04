import { CALCULATION_LIMITS, type ResultGrid } from './calculation'
import { computeBrillouinZone } from './brillouin-zone'
import type { BrillouinZone, BrillouinZoneFace } from './brillouin-zone'
import {
  add,
  cross,
  dot,
  invertMatrix,
  isFiniteVector,
  isIntegerVector,
  multiplyMatrixVector,
  nearlyEqual,
  norm,
  scale,
  subtract
} from './math'
import { reciprocalLattice } from './reciprocal'
import { failure, success } from './result'
import type { Cell, Matrix3, ScientificResult, Vec3 } from './types'

export interface ResultMesh {
  /** Non-indexed Cartesian triangles, packed as xyz triples. */
  readonly positions: Float32Array
  /** Sample at each vertex, in the coloring field's unit when provided. */
  readonly values: Float32Array
}

export interface ResultMeshOptions {
  readonly colorGrid?: ResultGrid
  readonly tiles?: readonly Vec3[]
  readonly maxTriangles?: number
  readonly checkpoint?: () => Promise<void>
}

export interface ResultSlicePlane {
  readonly point: Vec3
  readonly normal: Vec3
}

const MAX_GRID_SAMPLES = CALCULATION_LIMITS.gridSamples
const MAX_TRIANGLES = CALCULATION_LIMITS.triangles
const MAX_TILES = 4096
const CHECKPOINT_INTERVAL = 4096
const ROUNDING = 64 * Number.EPSILON
const ZERO: Vec3 = [0, 0, 0]

const corners: readonly Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1]
]

// The six tetrahedra share the long diagonal and agree on the diagonals of
// shared faces, including when the sample indices wrap across a seam.
const tetrahedra = [
  [0, 1, 3, 7],
  [0, 3, 2, 7],
  [0, 2, 6, 7],
  [0, 6, 4, 7],
  [0, 4, 5, 7],
  [0, 5, 1, 7]
] as const

const modulo = (value: number, period: number): number => ((value % period) + period) % period
const mix = (a: number, b: number, fraction: number): number => a * (1 - fraction) + b * fraction
const mixPoint = (a: Vec3, b: Vec3, fraction: number): Vec3 => [
  mix(a[0], b[0], fraction),
  mix(a[1], b[1], fraction),
  mix(a[2], b[2], fraction)
]
const pointAt = (grid: ResultGrid, index: Vec3): Vec3 =>
  add(grid.origin, multiplyMatrixVector(grid.steps, index))

function gridInverse(grid: ResultGrid): Matrix3 | undefined {
  if (
    !grid ||
    !isFiniteVector(grid.origin) ||
    !Array.isArray(grid.steps) ||
    grid.steps.length !== 3 ||
    !grid.steps.every(isFiniteVector) ||
    !isIntegerVector(grid.dimensions) ||
    grid.dimensions.some((size) => size < 1) ||
    !Array.isArray(grid.periodic) ||
    grid.periodic.length !== 3 ||
    grid.periodic.some((axis) => typeof axis !== 'boolean') ||
    !(grid.values instanceof Float64Array || Array.isArray(grid.values))
  )
    return undefined
  const count = grid.dimensions[0] * grid.dimensions[1] * grid.dimensions[2]
  if (count > MAX_GRID_SAMPLES || count !== grid.values.length) return undefined
  return invertMatrix(grid.steps)
}

function gridValue(grid: ResultGrid, i: number, j: number, k: number): number {
  const [nx, ny, nz] = grid.dimensions
  if (i === nx && grid.periodic[0]) i = 0
  if (j === ny && grid.periodic[1]) j = 0
  if (k === nz && grid.periodic[2]) k = 0
  return grid.values[i + nx * (j + ny * k)]
}

function sampleIndex(grid: ResultGrid, index: Vec3): number | undefined {
  const base = [0, 0, 0]
  const next = [0, 0, 0]
  const fraction = [0, 0, 0]
  for (let axis = 0; axis < 3; axis++) {
    const coordinate = index[axis]
    if (!Number.isFinite(coordinate)) return undefined
    const count = grid.dimensions[axis]
    const tolerance = ROUNDING * Math.max(1, count, Math.abs(coordinate))
    if (!grid.periodic[axis] && (coordinate < -tolerance || coordinate > count - 1 + tolerance))
      return undefined
    const wrapped = grid.periodic[axis]
      ? modulo(coordinate, count)
      : Math.min(count - 1, Math.max(0, coordinate))
    base[axis] = Math.floor(wrapped)
    next[axis] = grid.periodic[axis]
      ? (base[axis] + 1) % count
      : Math.min(count - 1, base[axis] + 1)
    fraction[axis] = wrapped - base[axis]
  }
  const [x0, y0, z0] = base
  const [x1, y1, z1] = next
  const [fx, fy, fz] = fraction
  const slab = (z: number): number =>
    mix(
      mix(gridValue(grid, x0, y0, z), gridValue(grid, x1, y0, z), fx),
      mix(gridValue(grid, x0, y1, z), gridValue(grid, x1, y1, z), fx),
      fy
    )
  const value = mix(slab(z0), slab(z1), fz)
  return Number.isFinite(value) ? value : undefined
}

const sampleCartesian = (grid: ResultGrid, inverse: Matrix3, point: Vec3): number | undefined =>
  sampleIndex(grid, multiplyMatrixVector(inverse, subtract(point, grid.origin)))

export function sampleResultGrid(grid: ResultGrid, position: Vec3): ScientificResult<number> {
  const inverse = gridInverse(grid)
  if (!inverse || !isFiniteVector(position))
    return failure('RESULT_GRID', 'Provide a valid grid and finite Cartesian sample position.')
  const value = sampleCartesian(grid, inverse, position)
  return value === undefined
    ? failure('RESULT_GRID_SAMPLE', 'The sample is outside the grid or is not finite.')
    : success(value)
}

const equalVector = (a: Vec3, b: Vec3): boolean =>
  a.every((value, axis) => nearlyEqual(value, b[axis]))
const sameSampling = (a: ResultGrid, b: ResultGrid): boolean =>
  equalVector(a.origin, b.origin) &&
  a.steps.every((step, axis) => equalVector(step, b.steps[axis])) &&
  a.periodic.every((periodic, axis) => periodic === b.periodic[axis]) &&
  a.dimensions.every((size, axis) => size === b.dimensions[axis])

/** Subtraction in the first grid's domain. The caller must establish common units and registration. */
export async function differenceResultGrids(
  grid: ResultGrid,
  subtractGrid: ResultGrid,
  options: { readonly resample?: boolean; readonly checkpoint?: () => Promise<void> } = {}
): Promise<ScientificResult<ResultGrid>> {
  const inverse = gridInverse(subtractGrid)
  if (!gridInverse(grid) || !inverse)
    return failure('RESULT_GRID', 'Both fields must have valid grids.')
  const same = sameSampling(grid, subtractGrid)
  if (!same && !options.resample)
    return failure(
      'RESULT_GRID_REGISTRATION',
      'Confirm resampling to subtract differently sampled grids.'
    )
  const values = new Float64Array(grid.values.length)
  const [nx, ny] = grid.dimensions
  for (let index = 0; index < values.length; index++) {
    if (options.checkpoint && index % CHECKPOINT_INTERVAL === 0) await options.checkpoint()
    const other = same
      ? subtractGrid.values[index]
      : sampleCartesian(
          subtractGrid,
          inverse,
          pointAt(grid, [index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny))])
        )
    const value = other === undefined ? NaN : grid.values[index] - other
    if (!Number.isFinite(value))
      return failure(
        'RESULT_GRID_SAMPLE',
        'Both fields must cover every finite sample in the target grid.',
        { index }
      )
    values[index] = value
  }
  return success({ ...grid, values })
}

function tileShifts(grid: ResultGrid, tiles: readonly Vec3[] = [ZERO]): Vec3[] | undefined {
  if (!Array.isArray(tiles) || tiles.length > MAX_TILES) return undefined
  const result = new Map<string, Vec3>()
  for (const tile of tiles) {
    if (!isIntegerVector(tile) || tile.some((value, axis) => value !== 0 && !grid.periodic[axis]))
      return undefined
    const [x, y, z] = grid.dimensions
    const shift = multiplyMatrixVector(grid.steps, [x * tile[0], y * tile[1], z * tile[2]])
    if (!isFiniteVector(shift)) return undefined
    result.set(tile.join(','), shift)
  }
  return [...result.values()]
}

interface MeshWriter {
  readonly triangle: (a: Vec3, b: Vec3, c: Vec3) => boolean
  readonly finish: () => ScientificResult<ResultMesh>
}

function meshWriter(limit: number, getValue: (point: Vec3) => number | undefined): MeshWriter {
  let positions = new Float32Array(Math.min(limit, 1024) * 9)
  let values = new Float32Array(positions.length / 3)
  let count = 0
  let code: string | undefined
  return {
    triangle(a, b, c) {
      const ab = subtract(b, a)
      const ac = subtract(c, a)
      if (norm(cross(ab, ac)) <= ROUNDING * norm(ab) * norm(ac)) return true
      if (count === limit) {
        code = 'RESULT_MESH_BUDGET'
        return false
      }
      if (count * 9 === positions.length) {
        const larger = new Float32Array(Math.min(limit * 9, positions.length * 2))
        const moreValues = new Float32Array(larger.length / 3)
        larger.set(positions)
        moreValues.set(values)
        positions = larger
        values = moreValues
      }
      let vertex = count * 3
      for (const point of [a, b, c]) {
        const value = getValue(point)
        if (
          value === undefined ||
          !Number.isFinite(Math.fround(value)) ||
          !point.every((axis) => Number.isFinite(Math.fround(axis)))
        ) {
          code = 'RESULT_GRID_SAMPLE'
          return false
        }
        positions.set(point, vertex * 3)
        values[vertex++] = value
      }
      count++
      return true
    },
    finish() {
      if (code === 'RESULT_MESH_BUDGET')
        return failure(code, 'Result geometry exceeds the visible triangle budget.', { limit })
      if (code)
        return failure(
          code,
          'Result geometry or the coloring field is undefined at a generated vertex.'
        )
      return success({
        positions: positions.slice(0, count * 9),
        values: values.slice(0, count * 3)
      })
    }
  }
}

/** Clips against the BZ half-spaces in Cartesian reciprocal coordinates. */
function clipPolygon(input: readonly Vec3[], faces: readonly BrillouinZoneFace[]): readonly Vec3[] {
  let polygon = input
  for (const { normal, offset } of faces) {
    const clipped: Vec3[] = []
    const tolerance = ROUNDING * (Math.abs(offset) + Math.max(...polygon.map(norm)))
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index]
      const b = polygon[(index + 1) % polygon.length]
      const da = dot(a, normal) - offset
      const db = dot(b, normal) - offset
      const inside = da <= tolerance
      const nextInside = db <= tolerance
      if (inside) clipped.push(a)
      if (inside !== nextInside) {
        clipped.push(mixPoint(a, b, Math.max(0, Math.min(1, da / (da - db)))))
      }
    }
    if (clipped.length < 3) return []
    polygon = clipped
  }
  return polygon
}

const meshBudget = (limit: number = MAX_TRIANGLES): number | undefined =>
  Number.isSafeInteger(limit) && limit >= 0 && limit <= MAX_TRIANGLES ? limit : undefined

function isoTetrahedron(
  tetra: readonly number[],
  points: readonly Vec3[],
  distances: readonly number[],
  classify: (distance: number) => boolean,
  emit: (a: Vec3, b: Vec3, c: Vec3) => boolean
): boolean {
  const low = tetra.filter((i) => classify(distances[i]))
  const high = tetra.filter((i) => !classify(distances[i]))
  if (!low.length || !high.length) return true
  const towardsHigh = subtract(points[high[0]], points[low[0]])
  const edge = (a: number, b: number): Vec3 => {
    const absA = Math.abs(distances[a])
    const absB = Math.abs(distances[b])
    const largest = Math.max(absA, absB)
    return mixPoint(points[a], points[b], absA / largest / (absA / largest + absB / largest))
  }
  const oriented = (a: Vec3, b: Vec3, c: Vec3): boolean =>
    dot(cross(subtract(b, a), subtract(c, a)), towardsHigh) >= 0 ? emit(a, b, c) : emit(a, c, b)
  if (low.length === 1)
    return oriented(edge(low[0], high[0]), edge(low[0], high[1]), edge(low[0], high[2]))
  if (high.length === 1)
    return oriented(edge(low[0], high[0]), edge(low[1], high[0]), edge(low[2], high[0]))
  const a = edge(low[0], high[0])
  const b = edge(low[0], high[1])
  const c = edge(low[1], high[1])
  const d = edge(low[1], high[0])
  return oriented(a, b, c) && oriented(a, c, d)
}

function cellCount(grid: ResultGrid): Vec3 {
  const [x, y, z] = grid.dimensions
  return [
    x - Number(!grid.periodic[0]),
    y - Number(!grid.periodic[1]),
    z - Number(!grid.periodic[2])
  ]
}

async function meshGrid(
  grid: ResultGrid,
  surface: { threshold: number } | { plane: ResultSlicePlane },
  options: ResultMeshOptions,
  zone?: BrillouinZone
): Promise<ScientificResult<ResultMesh>> {
  const inverse = gridInverse(grid)
  const limit = meshBudget(options.maxTriangles)
  const shifts = inverse ? tileShifts(grid, options.tiles) : undefined
  const color = options.colorGrid
  const colorInverse = color ? gridInverse(color) : undefined
  if (!inverse || (color && !colorInverse) || !shifts)
    return failure(
      'RESULT_GRID',
      'Provide valid grid geometry, coloring field and periodic tile offsets.'
    )
  if (limit === undefined)
    return failure('RESULT_MESH_BUDGET', 'The layer triangle limit exceeds the result mesh budget.')
  const dimensions = cellCount(grid)
  const [nx, ny, nz] = dimensions
  const origins = shifts.map((shift) => add(grid.origin, shift))
  let classify = (distance: number) => distance < 0
  let distanceFields: readonly ((i: number, j: number, k: number) => number)[]
  if ('threshold' in surface) {
    const threshold = surface.threshold
    if (!Number.isFinite(threshold))
      return failure('RESULT_GRID_THRESHOLD', 'The threshold must be finite.')
    const distanceAt = (i: number, j: number, k: number) => gridValue(grid, i, j, k) - threshold
    distanceFields = origins.map(() => distanceAt)
  } else {
    const { point, normal } = surface.plane
    const length = isFiniteVector(normal) ? norm(normal) : NaN
    if (!isFiniteVector(point) || !Number.isFinite(length) || !length)
      return failure(
        'RESULT_GRID_PLANE',
        'Provide a finite plane point and a nonzero finite normal.'
      )
    const direction = scale(normal, 1 / length)
    const slopes = grid.steps.map((step) => dot(step, direction))
    const variation = Math.abs(nx * slopes[0]) + Math.abs(ny * slopes[1]) + Math.abs(nz * slopes[2])
    distanceFields = origins.map((origin) => {
      const atOrigin = dot(subtract(origin, point), direction)
      const tolerance = ROUNDING * (Math.abs(atOrigin) + variation)
      return (i, j, k) => {
        const distance = atOrigin + i * slopes[0] + j * slopes[1] + k * slopes[2]
        return Math.abs(distance) <= tolerance ? 0 : distance
      }
    })
    // Choose ties across the whole tile set so a shared plane face is emitted once.
    if (
      !distanceFields.some((field) =>
        corners.some(([i, j, k]) => field(i * nx, j * ny, k * nz) < 0)
      )
    )
      classify = (distance) => distance <= 0
  }
  const writer = meshWriter(limit, (point) => {
    if (color && colorInverse) return sampleCartesian(color, colorInverse, point)
    if ('threshold' in surface) return surface.threshold
    return sampleCartesian(grid, inverse, point)
  })
  if (!nx || !ny || !nz) return writer.finish()
  const distances = new Array<number>(8)
  const zoneIndices = zone?.vertices.map((point) =>
    multiplyMatrixVector(inverse, subtract(point, grid.origin))
  )
  const minimum =
    zoneIndices && dimensions.map((_, axis) => Math.min(...zoneIndices.map((point) => point[axis])))
  const maximum =
    zoneIndices && dimensions.map((_, axis) => Math.max(...zoneIndices.map((point) => point[axis])))
  let processed = 0
  for (let tile = 0; tile < origins.length; tile++) {
    const origin = origins[tile]
    const distanceAt = distanceFields[tile]
    const emit = (a: Vec3, b: Vec3, c: Vec3): boolean => {
      if (!zone) return writer.triangle(a, b, c)
      const polygon = clipPolygon([a, b, c], zone.faces)
      for (let index = 1; index + 1 < polygon.length; index++)
        if (!writer.triangle(polygon[0], polygon[index], polygon[index + 1])) return false
      return true
    }
    const offset = multiplyMatrixVector(inverse, shifts[tile])
    // Restrict reciprocal tiles to the BZ's grid-index bounding box. One cell
    // of padding absorbs roundoff when a clipping face meets a grid plane.
    const start = minimum
      ? minimum.map((low, axis) => Math.max(0, Math.floor(low - offset[axis]) - 1))
      : ZERO
    const end = maximum
      ? maximum.map((high, axis) => Math.min(dimensions[axis], Math.ceil(high - offset[axis]) + 1))
      : dimensions
    for (let k = start[2]; k < end[2]; k++) {
      for (let j = start[1]; j < end[1]; j++) {
        for (let i = start[0]; i < end[0]; i++) {
          if (options.checkpoint && processed++ % CHECKPOINT_INTERVAL === 0)
            await options.checkpoint()
          let low = 0
          for (let vertex = 0; vertex < corners.length; vertex++) {
            const [x, y, z] = corners[vertex]
            const distance = distanceAt(i + x, j + y, k + z)
            if (!Number.isFinite(distance))
              return failure('RESULT_GRID_SAMPLE', 'A grid sample is not finite.')
            distances[vertex] = distance
            if (classify(distance)) low++
          }
          if (low === 0 || low === 8) continue
          const points = corners.map(([x, y, z]) =>
            add(origin, multiplyMatrixVector(grid.steps, [i + x, j + y, k + z]))
          )
          for (const tetra of tetrahedra)
            if (!isoTetrahedron(tetra, points, distances, classify, emit)) return writer.finish()
        }
      }
    }
  }
  return writer.finish()
}

export function generateResultIsosurface(
  grid: ResultGrid,
  threshold: number,
  options: ResultMeshOptions = {}
): Promise<ScientificResult<ResultMesh>> {
  return meshGrid(grid, { threshold }, options)
}

export function generateResultSlice(
  grid: ResultGrid,
  plane: ResultSlicePlane,
  options: ResultMeshOptions = {}
): Promise<ScientificResult<ResultMesh>> {
  return meshGrid(grid, { plane }, options)
}

/** The grid samples one full reciprocal primitive cell with no duplicated periodic endpoints. */
export async function generateResultFermiSurface(
  grid: ResultGrid,
  cell: Cell,
  fermiEnergy: number,
  options: ResultMeshOptions = {}
): Promise<ScientificResult<ResultMesh>> {
  if (
    !gridInverse(grid) ||
    !grid.periodic.every(Boolean) ||
    grid.dimensions.some((size) => size < 2)
  )
    return failure(
      'RESULT_K_GRID',
      'A Fermi surface requires a complete periodic three-dimensional k grid.'
    )
  const reciprocal = reciprocalLattice(cell)
  if (!reciprocal.ok) return reciprocal
  const periods = grid.steps.map((step, axis) =>
    scale(step, grid.dimensions[axis])
  ) as unknown as Matrix3
  if (periods.some((period, axis) => !equalVector(period, reciprocal.value.basis[axis])))
    return failure('RESULT_K_GRID', 'K grid periods must match the reciprocal basis of the frame.')
  const zone = computeBrillouinZone(cell)
  if (!zone.ok) return zone
  const inverse = invertMatrix(periods)
  if (!inverse) return failure('RESULT_K_GRID', 'The periodic k grid is singular.')
  const coordinates = zone.value.vertices.map((point) =>
    multiplyMatrixVector(inverse, subtract(point, grid.origin))
  )
  const minimum = [0, 1, 2].map((axis) =>
    Math.floor(Math.min(...coordinates.map((point) => point[axis])))
  )
  const maximum = [0, 1, 2].map(
    (axis) => Math.ceil(Math.max(...coordinates.map((point) => point[axis]))) - 1
  )
  const count = maximum.reduce((product, high, axis) => product * (high - minimum[axis] + 1), 1)
  if (count > MAX_TILES || [...minimum, ...maximum].some((value) => !Number.isSafeInteger(value)))
    return failure(
      'RESULT_K_GRID_BUDGET',
      'The k grid needs too many periodic tiles to cover the Brillouin zone.'
    )
  const tiles: Vec3[] = []
  for (let k = minimum[2]; k <= maximum[2]; k++)
    for (let j = minimum[1]; j <= maximum[1]; j++)
      for (let i = minimum[0]; i <= maximum[0]; i++) tiles.push([i, j, k])
  return meshGrid(grid, { threshold: fermiEnergy }, { ...options, tiles }, zone.value)
}

export * from './result-structure'
