import { getElement } from './data'
import { compareStrings, deriveInstances, mergeEquivalentInstances } from './derivation'
import {
  add,
  cross,
  dot,
  invertMatrix,
  isFiniteVector,
  isIntegerVector,
  multiplyMatrixVector,
  norm,
  scale,
  subtract
} from './math'
import { failure, failureFrom, success } from './result'
import { endpointKey, fractionalReach, SPECIAL_POSITION_TOLERANCE } from './symmetry'
import type {
  AtomId,
  AtomInstance,
  BondEndpoint,
  Diagnostic,
  ScientificResult,
  StructureSnapshot,
  Vec3
} from './types'

export interface CoordinationRule {
  readonly elements: readonly [string, string]
  readonly minDistance?: number
  readonly maxDistance: number
}
export interface CoordinationOptions {
  readonly centerAtomIds: readonly AtomId[]
  readonly rules: readonly CoordinationRule[]
}
export interface CoordinationNeighbor {
  readonly instance: AtomInstance
  readonly distance: number
}
export interface CoordinationPolyhedron {
  readonly vertices: readonly Vec3[]
  readonly vertexNeighborIndices: readonly (readonly number[])[]
  readonly faces: readonly (readonly number[])[]
  readonly triangles: readonly (readonly [number, number, number])[]
  readonly volume: number
  readonly unit: 'angstrom'
  readonly volumeUnit: 'angstrom^3'
}
export interface CoordinationCenter {
  readonly center: AtomInstance
  readonly neighbors: readonly CoordinationNeighbor[]
  readonly coordinationNumber: number
  readonly polyhedron?: CoordinationPolyhedron
}
export interface CoordinationResult {
  readonly centers: readonly CoordinationCenter[]
  readonly unit: 'angstrom'
}

const DISTANCE_TOLERANCE = 1e-8
const MAX_CANDIDATES = 100_000
const MAX_SEARCH_POSITIONS = 5_000_000
const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort(compareStrings))

/** Also used by viewer option validation; an empty rule set deliberately selects no neighbors. */
export function validateCoordinationRules(
  rules: readonly CoordinationRule[]
): readonly Diagnostic[] {
  if (!Array.isArray(rules))
    return [
      {
        severity: 'error',
        code: 'COORDINATION_RULES',
        message: 'Coordination rules must be an array.'
      }
    ]
  const seen = new Set<string>()
  const diagnostics: Diagnostic[] = []
  for (const rule of rules) {
    if (
      !rule ||
      !Array.isArray(rule.elements) ||
      rule.elements.length !== 2 ||
      rule.elements.some(
        (element: unknown) => typeof element !== 'string' || !getElement(element)
      ) ||
      !Number.isFinite(rule.maxDistance) ||
      rule.maxDistance <= 0 ||
      (rule.minDistance !== undefined &&
        (!Number.isFinite(rule.minDistance) ||
          rule.minDistance < 0 ||
          rule.minDistance > rule.maxDistance))
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'COORDINATION_RULE',
        message:
          'Each coordination rule requires two known elements and finite distances with 0 <= minimum <= maximum and maximum > 0.'
      })
      continue
    }
    const key = pairKey(rule.elements[0], rule.elements[1])
    if (seen.has(key))
      diagnostics.push({
        severity: 'error',
        code: 'COORDINATION_RULE_DUPLICATE',
        message: 'An unordered element pair may have only one coordination rule.',
        context: { elements: rule.elements }
      })
    seen.add(key)
  }
  return diagnostics
}

type Triangle = readonly [number, number, number]
interface HullFace {
  readonly vertices: Triangle
  readonly normal: Vec3
  readonly offset: number
}

/** Incremental convex hull of neighbor centers; no rendering or reciprocal-space dependency. */
function convexHull(
  neighbors: readonly CoordinationNeighbor[],
  center: Vec3
): ScientificResult<CoordinationPolyhedron | undefined> {
  if (neighbors.length < 4) return success(undefined)
  const radius = neighbors.reduce(
    (maximum, neighbor) => Math.max(maximum, norm(subtract(neighbor.instance.cartesian, center))),
    0
  )
  if (!Number.isFinite(radius))
    return failure(
      'COORDINATION_DISTANCE_RANGE',
      'A polyhedron radius exceeds finite numerical range.'
    )
  if (radius <= 1e-9) return success(undefined)
  const epsilon = Math.max(1e-12, 1e-9 / radius)
  const points: Vec3[] = []
  const absolute: Vec3[] = []
  const neighborIndices: number[][] = []
  const buckets = new Map<string, number[]>()
  for (let neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex++) {
    const neighbor = neighbors[neighborIndex]
    const point = scale(subtract(neighbor.instance.cartesian, center), 1 / radius)
    const bucket = point.map((value) => Math.floor(value / epsilon))
    let duplicate: number | undefined
    for (let x = -1; x <= 1 && duplicate === undefined; x++)
      for (let y = -1; y <= 1 && duplicate === undefined; y++)
        for (let z = -1; z <= 1 && duplicate === undefined; z++)
          duplicate = (
            buckets.get(`${bucket[0] + x},${bucket[1] + y},${bucket[2] + z}`) ?? []
          ).find((index) => norm(subtract(point, points[index])) <= epsilon)
    if (duplicate !== undefined) {
      neighborIndices[duplicate].push(neighborIndex)
      continue
    }
    const key = bucket.join(',')
    const entries = buckets.get(key) ?? []
    entries.push(points.length)
    buckets.set(key, entries)
    points.push(point)
    absolute.push(neighbor.instance.cartesian)
    neighborIndices.push([neighborIndex])
  }
  if (points.length < 4) return success(undefined)
  const a = 0
  let b = 1
  for (let i = 2; i < points.length; i++)
    if (norm(subtract(points[i], points[a])) > norm(subtract(points[b], points[a]))) b = i
  const line = subtract(points[b], points[a])
  if (norm(line) <= epsilon) return success(undefined)
  let c = -1,
    area = 0
  for (let i = 0; i < points.length; i++) {
    const value = norm(cross(line, subtract(points[i], points[a])))
    if (value > area) {
      c = i
      area = value
    }
  }
  if (c < 0 || area <= epsilon * norm(line)) return success(undefined)
  const plane = scale(cross(line, subtract(points[c], points[a])), 1 / area)
  let d = -1,
    height = 0
  for (let i = 0; i < points.length; i++) {
    const value = Math.abs(dot(plane, subtract(points[i], points[a])))
    if (value > height) {
      d = i
      height = value
    }
  }
  if (d < 0 || height <= epsilon) return success(undefined)
  const interior = scale(add(add(points[a], points[b]), add(points[c], points[d])), 0.25)
  const face = (indices: Triangle): HullFace | undefined => {
    const [i, j, k] = indices
    let normal = cross(subtract(points[j], points[i]), subtract(points[k], points[i]))
    const length = norm(normal)
    if (length <= epsilon * epsilon) return undefined
    normal = scale(normal, 1 / length)
    let vertices = indices
    if (dot(normal, subtract(interior, points[i])) > 0) {
      normal = scale(normal, -1)
      vertices = [i, k, j]
    }
    return { vertices, normal, offset: dot(normal, points[i]) }
  }
  let hull = [
    [a, b, c],
    [a, d, b],
    [a, c, d],
    [b, d, c]
  ].map((indices) => face(indices as unknown as Triangle)!)
  const initial = new Set([a, b, c, d])
  for (let index = 0; index < points.length; index++) {
    if (initial.has(index)) continue
    const visible = hull.filter(
      (entry) => dot(entry.normal, points[index]) - entry.offset > epsilon
    )
    if (!visible.length) continue
    const edges = new Map<string, readonly [number, number]>()
    for (const entry of visible)
      for (let edge = 0; edge < 3; edge++) {
        const left = entry.vertices[edge],
          right = entry.vertices[(edge + 1) % 3]
        const key = left < right ? `${left},${right}` : `${right},${left}`
        if (edges.has(key)) edges.delete(key)
        else edges.set(key, [left, right])
      }
    const removed = new Set(visible)
    hull = hull.filter((entry) => !removed.has(entry))
    for (const [left, right] of edges.values()) {
      const next = face([left, right, index])
      if (next) hull.push(next)
    }
  }
  const groups: { normal: Vec3; offset: number; indices: Set<number> }[] = []
  for (const entry of hull) {
    let group = groups.find(
      (other) =>
        norm(subtract(other.normal, entry.normal)) <= 1e-8 &&
        Math.abs(other.offset - entry.offset) <= 4 * epsilon
    )
    if (!group) {
      group = { normal: entry.normal, offset: entry.offset, indices: new Set() }
      groups.push(group)
    }
    for (const index of entry.vertices) group.indices.add(index)
  }
  const faces: number[][] = []
  for (const group of groups) {
    const indices = [...group.indices]
    const origin = points[indices[0]]
    const axis: Vec3 = Math.abs(group.normal[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]
    const tangent = cross(group.normal, axis)
    const u = scale(tangent, 1 / norm(tangent)),
      v = cross(group.normal, u)
    const projected = indices
      .map((index) => ({
        index,
        x: dot(subtract(points[index], origin), u),
        y: dot(subtract(points[index], origin), v)
      }))
      .sort((p, q) => p.x - q.x || p.y - q.y || p.index - q.index)
    const turn = (
      p: (typeof projected)[number],
      q: (typeof projected)[number],
      r: (typeof projected)[number]
    ) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
    const chain = (values: typeof projected) => {
      const result: typeof projected = []
      for (const point of values) {
        while (
          result.length >= 2 &&
          turn(result[result.length - 2], result[result.length - 1], point) <= epsilon * epsilon
        )
          result.pop()
        result.push(point)
      }
      result.pop()
      return result
    }
    const polygon = [...chain(projected), ...chain([...projected].reverse())].map(
      (point) => point.index
    )
    if (polygon.length < 3) return success(undefined)
    faces.push(polygon)
  }
  const used = [...new Set(faces.flat())].sort((i, j) => i - j)
  const compact = new Map(used.map((index, next) => [index, next]))
  const resultFaces = faces.map((polygon) => polygon.map((index) => compact.get(index)!))
  const triangles: Triangle[] = []
  let volume = 0
  const edges = new Map<string, number>()
  for (const polygon of faces) {
    for (let i = 0; i < polygon.length; i++) {
      const left = polygon[i],
        right = polygon[(i + 1) % polygon.length]
      const key = left < right ? `${left},${right}` : `${right},${left}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
    for (let i = 1; i < polygon.length - 1; i++) {
      volume += dot(points[polygon[0]], cross(points[polygon[i]], points[polygon[i + 1]])) / 6
      triangles.push([
        compact.get(polygon[0])!,
        compact.get(polygon[i])!,
        compact.get(polygon[i + 1])!
      ])
    }
  }
  if (
    [...edges.values()].some((count) => count !== 2) ||
    !Number.isFinite(volume) ||
    volume <= epsilon ** 3
  )
    return success(undefined)
  // Multiplying radius cubed first can overflow even when a thin hull's actual volume is finite.
  // Start with the normalized volume so every scaling step stays within the final magnitude.
  let physicalVolume = volume
  for (let dimension = 0; dimension < 3; dimension++) {
    if (radius > 1 && physicalVolume > Number.MAX_VALUE / radius)
      return failure(
        'COORDINATION_VOLUME_RANGE',
        'The coordination polyhedron volume exceeds finite positive numerical range.'
      )
    physicalVolume *= radius
    if (!Number.isFinite(physicalVolume) || physicalVolume <= 0)
      return failure(
        'COORDINATION_VOLUME_RANGE',
        'The coordination polyhedron volume exceeds finite positive numerical range.'
      )
  }
  return success({
    vertices: used.map((index) => absolute[index]),
    vertexNeighborIndices: used.map((index) => neighborIndices[index]),
    faces: resultFaces,
    triangles,
    volume: physicalVolume,
    unit: 'angstrom',
    volumeUnit: 'angstrom^3'
  })
}

/** Analyze explicitly selected source atoms using complete periodic geometry, independent of display. */
export function analyzeCoordination(
  snapshot: StructureSnapshot,
  options: CoordinationOptions
): ScientificResult<CoordinationResult> {
  if (
    !options ||
    !Array.isArray(options.centerAtomIds) ||
    options.centerAtomIds.some((id) => typeof id !== 'string' || !id)
  )
    return failure('COORDINATION_CENTERS', 'Coordination centers must be stable source atom IDs.')
  const ruleErrors = validateCoordinationRules(options.rules)
  if (ruleErrors.length) return failureFrom(ruleErrors)
  const base = deriveInstances(snapshot)
  if (!base.ok) return base
  const sourceAtoms = new Map(snapshot.atoms.map((atom) => [atom.id, atom]))
  const centerIds = [...new Set(options.centerAtomIds)].sort(compareStrings)
  if (centerIds.some((id) => !sourceAtoms.has(id)))
    return failure(
      'COORDINATION_CENTER_MISSING',
      'A coordination center references a missing source atom.'
    )
  const representatives = new Map<AtomId, AtomInstance>()
  for (const instance of base.value)
    if (!representatives.has(instance.sourceAtomId))
      representatives.set(instance.sourceAtomId, instance)
  const centers = centerIds.map((id) => representatives.get(id)!)
  if (!centers.length) return success({ centers: [], unit: 'angstrom' }, base.diagnostics)
  if (!options.rules.length)
    return success(
      {
        centers: centers.map((center) => ({ center, neighbors: [], coordinationNumber: 0 })),
        unit: 'angstrom'
      },
      base.diagnostics
    )
  const maximum =
    options.rules.reduce((maximum, rule) => Math.max(maximum, rule.maxDistance), 0) +
    DISTANCE_TOLERANCE
  const rules = new Map(options.rules.map((rule) => [pairKey(...rule.elements), rule]))
  const candidates: AtomInstance[] = []
  if (snapshot.kind === 'molecular') {
    if (base.value.length > MAX_CANDIDATES)
      return failure(
        'COORDINATION_BUDGET',
        'The candidate search exceeds the 100,000 unique-image budget.'
      )
    for (const instance of base.value) candidates.push(instance)
  } else {
    const reach = fractionalReach(invertMatrix(snapshot.cell.basis)!, maximum)
    if (!isFiniteVector(reach))
      return failure(
        'COORDINATION_BUDGET',
        'The periodic candidate search exceeds its finite range.'
      )
    const low = [0, 1, 2].map((axis) =>
      centers.reduce((value, center) => Math.min(value, center.fractional![axis]), Infinity)
    )
    const high = [0, 1, 2].map((axis) =>
      centers.reduce((value, center) => Math.max(value, center.fractional![axis]), -Infinity)
    )
    const cartLow = [0, 1, 2].map(
      (axis) =>
        centers.reduce((value, center) => Math.min(value, center.cartesian[axis]), Infinity) -
        maximum
    )
    const cartHigh = [0, 1, 2].map(
      (axis) =>
        centers.reduce((value, center) => Math.max(value, center.cartesian[axis]), -Infinity) +
        maximum
    )
    const bySource = new Map<AtomId, AtomInstance[]>()
    for (const instance of base.value) {
      const entries = bySource.get(instance.sourceAtomId) ?? []
      entries.push(instance)
      bySource.set(instance.sourceAtomId, entries)
    }
    let searchPositions = 0
    for (const sites of bySource.values()) {
      let entries: AtomInstance[] = []
      for (const instance of sites) {
        const minimum = instance.fractional!.map((value, i) =>
          Math.ceil(low[i] - reach[i] - value)
        ) as unknown as Vec3
        const maximumCell = instance.fractional!.map((value, i) =>
          Math.floor(high[i] + reach[i] - value)
        ) as unknown as Vec3
        if (!isIntegerVector(minimum) || !isIntegerVector(maximumCell))
          return failure(
            'COORDINATION_BUDGET',
            'The periodic candidate search exceeds exact integer range.'
          )
        const dimensions = maximumCell.map((value, i) => Math.max(0, value - minimum[i] + 1))
        if (!Number.isSafeInteger(dimensions.reduce((product, value) => product * value, 1)))
          return failure(
            'COORDINATION_SEARCH_BUDGET',
            'The periodic search range exceeds exact integer arithmetic.'
          )
        for (let x = minimum[0]; x <= maximumCell[0]; x++)
          for (let y = minimum[1]; y <= maximumCell[1]; y++)
            for (let z = minimum[2]; z <= maximumCell[2]; z++) {
              if (++searchPositions > MAX_SEARCH_POSITIONS)
                return failure(
                  'COORDINATION_SEARCH_BUDGET',
                  'The bounded candidate search exceeded 5,000,000 lattice positions.'
                )
              const cell: Vec3 = [x, y, z]
              const fractional = add(instance.fractional!, cell)
              const cartesian = multiplyMatrixVector(snapshot.cell.basis, fractional)
              if (!isFiniteVector(cartesian))
                return failure(
                  'COORDINATION_BUDGET',
                  'A candidate image has nonfinite coordinates.'
                )
              if (cartesian.some((value, i) => value < cartLow[i] || value > cartHigh[i])) continue
              const shift = (source: BondEndpoint): BondEndpoint => ({
                ...source,
                integerCellOffset: add(source.integerCellOffset, cell)
              })
              const endpoint = shift(instance)
              if (!isIntegerVector(endpoint.integerCellOffset))
                return failure(
                  'COORDINATION_BUDGET',
                  'A candidate image exceeds exact integer range.'
                )
              entries.push({
                ...endpoint,
                id: `atom:${endpointKey(endpoint)}`,
                fractional,
                cartesian,
                equivalentSources: instance.equivalentSources.map(shift)
              })
              if (entries.length > MAX_CANDIDATES) {
                entries = mergeEquivalentInstances(entries)
                if (candidates.length + entries.length > MAX_CANDIDATES)
                  return failure(
                    'COORDINATION_BUDGET',
                    'The candidate search exceeds the 100,000 unique-image budget.'
                  )
              }
            }
      }
      const merged = mergeEquivalentInstances(entries)
      if (candidates.length + merged.length > MAX_CANDIDATES)
        return failure(
          'COORDINATION_BUDGET',
          'The candidate search exceeds the 100,000 unique-image budget.'
        )
      for (const instance of merged) candidates.push(instance)
    }
  }
  if (candidates.length > MAX_CANDIDATES)
    return failure(
      'COORDINATION_BUDGET',
      'The candidate search exceeds the 100,000 unique-image budget.'
    )
  const buckets = new Map<string, AtomInstance[]>()
  for (const instance of candidates) {
    const key = instance.cartesian.map((value) => Math.floor(value / maximum)).join(',')
    const entries = buckets.get(key) ?? []
    entries.push(instance)
    buckets.set(key, entries)
  }
  const diagnostics: Diagnostic[] = [...base.diagnostics]
  const result: CoordinationCenter[] = []
  for (const center of centers) {
    const bucket = center.cartesian.map((value) => Math.floor(value / maximum))
    const neighbors: CoordinationNeighbor[] = []
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          for (const instance of buckets.get(
            `${bucket[0] + x},${bucket[1] + y},${bucket[2] + z}`
          ) ?? []) {
            if (
              instance.sourceAtomId === center.sourceAtomId &&
              (snapshot.kind === 'periodic'
                ? instance.fractional!.every(
                    (value, i) =>
                      Math.abs(value - center.fractional![i]) <= SPECIAL_POSITION_TOLERANCE
                  )
                : instance.cartesian.every(
                    (value, i) => Math.abs(value - center.cartesian[i]) <= 1e-9
                  ))
            )
              continue
            const rule = rules.get(
              pairKey(
                sourceAtoms.get(center.sourceAtomId)!.element,
                sourceAtoms.get(instance.sourceAtomId)!.element
              )
            )
            if (!rule) continue
            const distance = norm(subtract(instance.cartesian, center.cartesian))
            if (!Number.isFinite(distance))
              return failure(
                'COORDINATION_DISTANCE_RANGE',
                'A neighbor distance exceeds finite numerical range.'
              )
            if (
              distance < (rule.minDistance ?? 0) - DISTANCE_TOLERANCE ||
              distance > rule.maxDistance + DISTANCE_TOLERANCE
            )
              continue
            neighbors.push({ instance, distance })
          }
    neighbors.sort(
      (a, b) => a.distance - b.distance || compareStrings(a.instance.id, b.instance.id)
    )
    const hull = convexHull(neighbors, center.cartesian)
    if (!hull.ok)
      return failureFrom(
        hull.diagnostics.map((entry) => ({
          ...entry,
          context: { ...entry.context, atomId: center.sourceAtomId }
        }))
      )
    const polyhedron = hull.value
    if (!polyhedron)
      diagnostics.push({
        severity: 'info',
        code: 'COORDINATION_POLYHEDRON_DEGENERATE',
        message:
          'The neighbor centers do not form a nondegenerate closed three-dimensional polyhedron.',
        context: { atomId: center.sourceAtomId, coordinationNumber: neighbors.length }
      })
    result.push({
      center,
      neighbors,
      coordinationNumber: neighbors.length,
      ...(polyhedron ? { polyhedron } : {})
    })
  }
  return success({ centers: result, unit: 'angstrom' }, diagnostics)
}
