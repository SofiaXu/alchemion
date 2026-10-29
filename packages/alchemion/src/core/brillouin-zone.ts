import {
  add,
  cross,
  determinant,
  dot,
  invertMatrix,
  isFiniteVector,
  multiplyMatrixVector,
  norm,
  scale,
  subtract,
  transpose
} from './math'
import { reciprocalLattice } from './reciprocal'
import { failure, success } from './result'
import type { Cell, Matrix3, ScientificResult, Vec3 } from './types'

export interface BrillouinZoneOptions {
  readonly maxShell?: number
  readonly maxCandidates?: number
}
export interface BrillouinZoneFace {
  /** Counterclockwise when viewed from outside the polyhedron. */
  readonly vertices: readonly number[]
  readonly reciprocalIndex: Vec3
  readonly normal: Vec3
  readonly offset: number
}
export interface BrillouinZone {
  readonly vertices: readonly Vec3[]
  readonly faces: readonly BrillouinZoneFace[]
  readonly triangles: readonly (readonly [number, number, number])[]
  readonly volume: number
  readonly unit: 'angstrom^-1'
  readonly volumeUnit: 'angstrom^-3'
  readonly convergence: {
    readonly shell: number
    readonly candidates: number
    readonly omittedVectorLowerBound: number
    readonly maxVertexRadius: number
  }
}

interface Face {
  points: Vec3[]
  reciprocalIndex: Vec3
  normal: Vec3
  offset: number
}

// Roundoff guard after scaling the largest reciprocal basis vector to unit length.
const EPS = 64 * Number.EPSILON
const tolerance = (...values: number[]) => EPS * Math.max(1, ...values.map(Math.abs))
const close = (a: Vec3, b: Vec3) => norm(subtract(a, b)) <= tolerance(norm(a), norm(b))
const compareVectors = (a: Vec3, b: Vec3) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

function uniquePoints(points: readonly Vec3[]): Vec3[] {
  const result: Vec3[] = []
  for (const point of points)
    if (!result.some((candidate) => close(candidate, point))) result.push(point)
  return result
}

function orderFace(points: readonly Vec3[], normal: Vec3): Vec3[] {
  const result = uniquePoints(points)
  if (result.length < 3) return []
  const center = scale(result.reduce(add, [0, 0, 0] as Vec3), 1 / result.length)
  const axis: Vec3 =
    Math.abs(normal[0]) <= Math.abs(normal[1]) && Math.abs(normal[0]) <= Math.abs(normal[2])
      ? [1, 0, 0]
      : Math.abs(normal[1]) <= Math.abs(normal[2])
        ? [0, 1, 0]
        : [0, 0, 1]
  const tangent = cross(normal, axis)
  const u = scale(tangent, 1 / norm(tangent)),
    v = cross(normal, u)
  result.sort(
    (a, b) =>
      Math.atan2(dot(subtract(a, center), v), dot(subtract(a, center), u)) -
      Math.atan2(dot(subtract(b, center), v), dot(subtract(b, center), u))
  )
  // A plane through an existing edge can create a redundant collinear vertex.
  let changed = true
  while (changed && result.length >= 3) {
    changed = false
    for (let i = 0; i < result.length; i++) {
      const before = subtract(result[i], result[(i + result.length - 1) % result.length])
      const after = subtract(result[(i + 1) % result.length], result[i])
      if (norm(cross(before, after)) <= EPS * norm(before) * norm(after)) {
        result.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return result.length >= 3 ? result : []
}

/** Six ±basis planes give a bounded parallelepiped; no arbitrary clipping box. */
function initialPolyhedron(basis: Matrix3): Face[] | undefined {
  const dualInverse = invertMatrix(transpose(basis))
  if (!dualInverse) return undefined
  const corners: { sign: Vec3; point: Vec3 }[] = []
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const sign: Vec3 = [x, y, z]
        corners.push({
          sign,
          point: multiplyMatrixVector(dualInverse, [
            (x * dot(basis[0], basis[0])) / 2,
            (y * dot(basis[1], basis[1])) / 2,
            (z * dot(basis[2], basis[2])) / 2
          ])
        })
      }
  if (corners.some(({ point }) => !isFiniteVector(point))) return undefined
  const faces: Face[] = []
  for (let i = 0; i < 3; i++)
    for (const sign of [-1, 1]) {
      const normal = scale(basis[i], sign / norm(basis[i]))
      const index: number[] = [0, 0, 0]
      index[i] = sign
      const points = orderFace(
        corners.filter((corner) => corner.sign[i] === sign).map(({ point }) => point),
        normal
      )
      if (points.length < 3) return undefined
      faces.push({
        points,
        normal,
        offset: norm(basis[i]) / 2,
        reciprocalIndex: index as unknown as Vec3
      })
    }
  return faces
}

function clip(
  faces: readonly Face[],
  normal: Vec3,
  offset: number,
  reciprocalIndex: Vec3
): Face[] | undefined {
  const all = faces.flatMap((face) => face.points)
  if (!all.some((point) => dot(normal, point) - offset > tolerance(norm(point), offset)))
    return [...faces]
  const caps: Vec3[] = []
  const result: Face[] = []
  for (const face of faces) {
    const polygon: Vec3[] = []
    for (let i = 0; i < face.points.length; i++) {
      const previous = face.points[(i + face.points.length - 1) % face.points.length]
      const current = face.points[i]
      const previousDistance = dot(normal, previous) - offset
      const currentDistance = dot(normal, current) - offset
      const previousInside = previousDistance <= tolerance(norm(previous), offset)
      const currentInside = currentDistance <= tolerance(norm(current), offset)
      if (previousInside !== currentInside) {
        const t = Math.max(0, Math.min(1, previousDistance / (previousDistance - currentDistance)))
        const point = add(previous, scale(subtract(current, previous), t))
        if (!isFiniteVector(point)) return undefined
        polygon.push(point)
        caps.push(point)
      }
      if (currentInside) {
        polygon.push(current)
        if (Math.abs(currentDistance) <= tolerance(norm(current), offset)) caps.push(current)
      }
    }
    const points = orderFace(polygon, face.normal)
    if (points.length) result.push({ ...face, points })
  }
  const cap = orderFace(caps, normal)
  if (cap.length < 3 || result.length < 3) return undefined
  result.push({ points: cap, normal, offset, reciprocalIndex })
  return result
}

function finish(
  faces: readonly Face[],
  scaleFactor: number,
  expectedVolume: number,
  shell: number,
  candidates: number,
  omittedBound: number
): ScientificResult<BrillouinZone> {
  const points = uniquePoints(faces.flatMap((face) => face.points)).sort(compareVectors)
  const indexed: BrillouinZoneFace[] = faces
    .map((face) => {
      const indices = face.points.map((point) =>
        points.findIndex((candidate) => close(candidate, point))
      )
      const first = indices.indexOf(Math.min(...indices))
      return {
        vertices: [...indices.slice(first), ...indices.slice(0, first)],
        reciprocalIndex: face.reciprocalIndex,
        normal: face.normal,
        offset: face.offset * scaleFactor
      }
    })
    .sort((a, b) => compareVectors(a.reciprocalIndex, b.reciprocalIndex))
  const triangles: [number, number, number][] = []
  const edgeUse = new Map<string, { count: number; direction: number }>()
  for (const face of indexed) {
    for (let i = 0; i < face.vertices.length; i++) {
      const a = face.vertices[i],
        b = face.vertices[(i + 1) % face.vertices.length]
      if (a === b) return failure('BZ_NUMERICAL', 'Clipping produced a zero-length edge.')
      const key = `${Math.min(a, b)},${Math.max(a, b)}`
      const usage = edgeUse.get(key) ?? { count: 0, direction: 0 }
      usage.count++
      usage.direction += a < b ? 1 : -1
      edgeUse.set(key, usage)
    }
    for (let i = 1; i < face.vertices.length - 1; i++)
      triangles.push([face.vertices[0], face.vertices[i], face.vertices[i + 1]])
  }
  if ([...edgeUse.values()].some((edge) => edge.count !== 2 || edge.direction !== 0))
    return failure('BZ_NUMERICAL', 'Clipping did not produce a closed oriented polyhedron.')
  const normalizedVolume = triangles.reduce(
    (sum, [a, b, c]) => sum + dot(points[a], cross(points[b], points[c])) / 6,
    0
  )
  const volume = normalizedVolume * scaleFactor ** 3
  if (
    !(volume > 0) ||
    !Number.isFinite(volume) ||
    Math.abs(volume - expectedVolume) > 1e-9 + 1e-10 * Math.max(volume, expectedVolume) ||
    Math.abs(volume / expectedVolume - 1) > 1e-7
  ) {
    return failure('BZ_NUMERICAL', 'The closed polyhedron failed the reciprocal-cell volume check.')
  }
  const vertices = points.map((point) => scale(point, scaleFactor))
  if (!vertices.every(isFiniteVector))
    return failure('BZ_NUMERICAL', 'Brillouin-zone vertices overflowed.')
  return success({
    vertices,
    faces: indexed,
    triangles,
    volume,
    unit: 'angstrom^-1',
    volumeUnit: 'angstrom^-3',
    convergence: {
      shell,
      candidates,
      omittedVectorLowerBound: omittedBound * scaleFactor,
      maxVertexRadius: Math.max(...vertices.map(norm))
    }
  })
}

export function computeBrillouinZone(
  cell: Cell,
  options: BrillouinZoneOptions = {}
): ScientificResult<BrillouinZone> {
  if (!options || typeof options !== 'object')
    return failure('BZ_OPTIONS', 'BZ options must be an object.')
  const maxShell = options.maxShell ?? 64,
    maxCandidates = options.maxCandidates ?? 250_000
  if (
    !Number.isSafeInteger(maxShell) ||
    maxShell < 1 ||
    !Number.isSafeInteger(maxCandidates) ||
    maxCandidates < 1
  )
    return failure('BZ_OPTIONS', 'BZ budgets must be positive safe integers.')
  const reciprocal = reciprocalLattice(cell)
  if (!reciprocal.ok) return reciprocal
  const expectedVolume = determinant(reciprocal.value.basis)
  const scaleFactor = Math.max(...reciprocal.value.basis.map(norm))
  if (
    !(expectedVolume > 0) ||
    !Number.isFinite(expectedVolume) ||
    !(scaleFactor > 0) ||
    !Number.isFinite(scaleFactor)
  )
    return failure('BZ_NUMERICAL', 'Reciprocal volume cannot be represented finitely.')
  const basis: Matrix3 = [
    scale(reciprocal.value.basis[0], 1 / scaleFactor),
    scale(reciprocal.value.basis[1], 1 / scaleFactor),
    scale(reciprocal.value.basis[2], 1 / scaleFactor)
  ]
  const inverse = invertMatrix(basis)
  let faces = initialPolyhedron(basis)
  if (!inverse || !faces)
    return failure('BZ_NUMERICAL', 'The initial reciprocal halfspaces are numerically singular.')
  const inverseFrobenius = Math.hypot(...inverse.flat())
  let candidates = 0
  for (let shell = 1; shell <= maxShell; shell++) {
    for (let x = -shell; x <= shell; x++)
      for (let y = -shell; y <= shell; y++)
        for (let z = -shell; z <= shell; z++) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== shell) continue
          if (++candidates > maxCandidates)
            return failure(
              'BZ_BUDGET',
              'BZ candidate budget was exhausted before completeness was proved.',
              { shell, maxCandidates }
            )
          const index: Vec3 = [x, y, z]
          const vector = multiplyMatrixVector(basis, index)
          const length = norm(vector)
          if (!(length > 0) || !Number.isFinite(length))
            return failure('BZ_NUMERICAL', 'A nonzero reciprocal vector could not be represented.')
          const clipped = clip(faces, scale(vector, 1 / length), length / 2, index)
          if (!clipped)
            return failure('BZ_NUMERICAL', 'Halfspace clipping became numerically degenerate.', {
              shell
            })
          faces = clipped
        }
    const radius = Math.max(...faces.flatMap((face) => face.points.map(norm)))
    // ||Bh|| >= ||h||₂/||B⁻¹||F and every omitted integer h has ||h||₂ >= shell+1.
    const lowerBound = ((shell + 1) / inverseFrobenius) * (1 - 1e-12)
    if (lowerBound > 2 * radius + tolerance(radius))
      return finish(faces, scaleFactor, expectedVolume, shell, candidates, lowerBound)
  }
  return failure('BZ_BUDGET', 'BZ shell budget was exhausted before completeness was proved.', {
    maxShell,
    candidates
  })
}
