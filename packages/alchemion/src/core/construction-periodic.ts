import type { ConstructionMapping } from './construction'
import { invertMatrix, multiplyMatrixVector, norm, subtract } from './math'
import { fractionalReach } from './symmetry'
import { createSupercell, type SupercellResult } from './supercell'
import type { Cell, Matrix3, ScientificResult, StructureSnapshot, Vec3 } from './types'

export const MAX_CONSTRUCTION_ATOMS = 100_000
export const MAX_CONSTRUCTION_CHECKS = 5_000_000

export const wrapPosition = (position: Vec3): Vec3 => [
  position[0] - Math.floor(position[0]),
  position[1] - Math.floor(position[1]),
  position[2] - Math.floor(position[2])
]

export function periodicSource(input: StructureSnapshot): ScientificResult<SupercellResult> {
  return createSupercell(input, [1, 1, 1])
}

export function periodicMapping(
  source: SupercellResult,
  input = 'source'
): { atoms: ConstructionMapping[]; bonds: ConstructionMapping[] } {
  return {
    atoms: source.atomMapping.map(({ atomId, equivalentSources }) => ({
      id: atomId,
      origins: equivalentSources.map((endpoint) => ({
        input,
        sourceId: endpoint.sourceAtomId,
        endpoint
      }))
    })),
    bonds: source.bondMapping.map(({ bondId, sourceBondId }) => ({
      id: bondId,
      origins: [{ input, sourceId: sourceBondId }]
    }))
  }
}

export interface DistanceBudget {
  remaining: number
}

/** Every image inside the Cartesian cutoff lies inside the inverse-basis component bounds. */
export function periodicDistance(
  delta: Vec3,
  basis: Matrix3,
  inverse: Matrix3,
  cutoff: number,
  budget: DistanceBudget,
  excludeUntranslated = false,
  nearestImage?: { offset?: Vec3; ambiguous?: boolean }
): number | undefined {
  const reach = fractionalReach(inverse, cutoff)
  const lower = reach.map((width, axis) => Math.ceil(delta[axis] - width - 1e-12))
  const upper = reach.map((width, axis) => Math.floor(delta[axis] + width + 1e-12))
  if (![...lower, ...upper].every(Number.isSafeInteger)) return undefined
  let nearest = Infinity
  for (let x = lower[0]; x <= upper[0]; x++)
    for (let y = lower[1]; y <= upper[1]; y++)
      for (let z = lower[2]; z <= upper[2]; z++) {
        if (--budget.remaining < 0) return undefined
        if (excludeUntranslated && x === 0 && y === 0 && z === 0) continue
        const offset: Vec3 = [x, y, z]
        const distance = norm(multiplyMatrixVector(basis, subtract(delta, offset)))
        const tied =
          nearestImage &&
          Number.isFinite(nearest) &&
          Math.abs(distance - nearest) <= 64 * Number.EPSILON * Math.max(distance, nearest)
        if (distance < nearest) {
          nearest = distance
          if (nearestImage) {
            nearestImage.offset = offset
            nearestImage.ambiguous = !!tied
          }
        } else if (tied) {
          nearestImage.ambiguous = true
        }
      }
  return nearest
}

/** Fractional buckets select candidates; the full Cartesian metric decides contact. */
export function periodicBuckets<T>(cell: Cell, inverse: Matrix3, cutoff: number) {
  const counts = fractionalReach(inverse, cutoff).map((reach) =>
    Math.max(1, Math.min(4096, Math.floor(1 / reach)))
  )
  const bins = new Map<string, { readonly point: Vec3; readonly value: T }[]>()
  const coordinates = (point: Vec3) =>
    wrapPosition(point).map((value, axis) =>
      Math.min(counts[axis] - 1, Math.floor(value * counts[axis]))
    )
  return {
    add(point: Vec3, value: T) {
      const key = coordinates(point).join(',')
      const contents = bins.get(key) ?? []
      contents.push({ point, value })
      bins.set(key, contents)
    },
    *near(point: Vec3) {
      const offsets = coordinates(point).map((value, axis) => [
        ...new Set([-1, 0, 1].map((offset) => (value + offset + counts[axis]) % counts[axis]))
      ])
      for (const x of offsets[0])
        for (const y of offsets[1])
          for (const z of offsets[2]) yield* bins.get(`${x},${y},${z}`) ?? []
    },
    distance(a: Vec3, b: Vec3, budget: DistanceBudget, excludeUntranslated = false) {
      if (--budget.remaining < 0) return undefined
      return periodicDistance(
        subtract(a, b),
        cell.basis,
        inverse,
        cutoff,
        budget,
        excludeUntranslated
      )
    }
  }
}

export const inverseCell = (cell: Cell): Matrix3 | undefined => invertMatrix(cell.basis)

/** Mulberry32 uses only specified 32-bit integer arithmetic. */
export function constructionRandom(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

export const validConstructionSeed = (seed: number): boolean =>
  Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff

export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}
