import { cartesianToFractional } from './cell'
import {
  add,
  invertMatrix,
  isFiniteVector,
  isIntegerVector,
  multiplyMatrixVector,
  subtract
} from './math'
import { failure, failureFrom, success } from './result'
import { validateStructure } from './structure'
import {
  applySymmetry,
  endpointKey,
  resolveSymmetry,
  SPECIAL_POSITION_TOLERANCE,
  translationVector
} from './symmetry'
import type { AtomInstance, BondEndpoint, ScientificResult, StructureSnapshot, Vec3 } from './types'

export interface InstanceOptions {
  readonly neighborCells?: readonly Vec3[]
  readonly cutoff?: { readonly kind: 'none' } | { readonly kind: 'fraction'; readonly width: Vec3 }
}

export const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function selectedCells(
  cells: readonly Vec3[] | undefined
): ScientificResult<readonly Vec3[]> {
  if (cells !== undefined && !Array.isArray(cells))
    return failure('NEIGHBOR_CELLS', 'Neighbor cells must be an array of integer triples.')
  const unique = new Map<string, Vec3>([['0,0,0', [0, 0, 0]]])
  for (const cell of cells ?? []) {
    if (!isIntegerVector(cell))
      return failure('NEIGHBOR_CELLS', 'Every neighbor cell must contain three safe integers.')
    unique.set(cell.join(','), [...cell] as unknown as Vec3)
  }
  return success([...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]))
}

const insideFraction = (position: Vec3, width: Vec3): boolean =>
  position.every(
    (value, index) =>
      value >= -width[index] - SPECIAL_POSITION_TOLERANCE &&
      value <= 1 + width[index] + SPECIAL_POSITION_TOLERANCE
  )
const instanceId = (endpoint: BondEndpoint): string => `atom:${endpointKey(endpoint)}`

/** Generate finite display instances; source coordinates are never wrapped in place. */
export function deriveInstances(
  snapshot: StructureSnapshot,
  options: InstanceOptions = {}
): ScientificResult<readonly AtomInstance[]> {
  if (
    !snapshot ||
    !Array.isArray(snapshot.atoms) ||
    !['periodic', 'molecular'].includes(snapshot.kind)
  )
    return failure('STRUCTURE_KIND', 'A periodic or molecular structure is required.')
  const structureErrors = validateStructure(snapshot).filter((entry) => entry.severity === 'error')
  if (structureErrors.length) return failureFrom(structureErrors)
  if (!options || typeof options !== 'object')
    return failure('DERIVATION_OPTIONS', 'Instance options must be an object.')
  const cells = selectedCells(options.neighborCells)
  if (!cells.ok) return cells
  if (
    options.cutoff !== undefined &&
    (!options.cutoff ||
      typeof options.cutoff !== 'object' ||
      !['none', 'fraction'].includes(options.cutoff.kind))
  )
    return failure('CUTOFF_KIND', 'Unsupported instance cutoff.')
  const fraction = options.cutoff?.kind === 'fraction' ? options.cutoff.width : undefined
  if (
    options.cutoff?.kind === 'fraction' &&
    (!isFiniteVector(fraction) || fraction.some((value) => value < 0))
  )
    return failure('CUTOFF_FRACTION', 'Fraction cutoff widths must be finite and nonnegative.')
  const ids = new Set<string>()
  for (const atom of snapshot.atoms) {
    if (!atom || typeof atom.id !== 'string' || !atom.id || ids.has(atom.id))
      return failure('ATOM_ID', 'Source atom IDs must be nonempty and unique.')
    ids.add(atom.id)
  }
  if (snapshot.kind === 'molecular') {
    if (fraction || cells.value.some((cell) => cell.some((value) => value !== 0)))
      return failure(
        'MOLECULAR_PERIODIC_OPTIONS',
        'Molecular structures do not have fractional cutoffs or neighbor cells.'
      )
    const instances: AtomInstance[] = []
    for (const atom of [...snapshot.atoms].sort((a, b) => compareStrings(a.id, b.id))) {
      if (!isFiniteVector(atom.cartesian))
        return failure('COORDINATE_NONFINITE', 'Molecular coordinates must be finite.', {
          atomId: atom.id
        })
      const source: BondEndpoint = {
        sourceAtomId: atom.id,
        symmetryOperationId: 'identity',
        integerCellOffset: [0, 0, 0]
      }
      instances.push({
        ...source,
        id: instanceId(source),
        cartesian: [...atom.cartesian] as unknown as Vec3,
        equivalentSources: [source]
      })
    }
    return success(instances)
  }
  const symmetry = resolveSymmetry(snapshot.symmetry, snapshot.cell)
  if (!symmetry.ok) return symmetry
  const all: AtomInstance[] = []
  // Buckets include the source ID; distinct source sites can never be merged.
  for (const atom of [...snapshot.atoms].sort((a, b) => compareStrings(a.id, b.id))) {
    if (!isFiniteVector(atom.fractional))
      return failure('COORDINATE_NONFINITE', 'Periodic coordinates must be finite.', {
        atomId: atom.id
      })
    const candidates: AtomInstance[] = []
    for (const operation of symmetry.value) {
      const raw = applySymmetry(operation, atom.fractional)
      if (!isFiniteVector(raw))
        return failure('COORDINATE_OVERFLOW', 'Symmetry operation overflowed.', { atomId: atom.id })
      const wrapOffset = raw.map(Math.floor) as unknown as Vec3
      if (!isIntegerVector(wrapOffset))
        return failure('COORDINATE_RANGE', 'Source normalization exceeds exact integer range.', {
          atomId: atom.id
        })
      const representative = subtract(raw, wrapOffset)
      for (const cell of cells.value) {
        const fractional = add(representative, cell)
        if (fraction && !insideFraction(fractional, fraction)) continue
        const integerCellOffset = subtract(cell, wrapOffset)
        if (!isIntegerVector(integerCellOffset))
          return failure('COORDINATE_RANGE', 'Instance translation exceeds exact integer range.', {
            atomId: atom.id
          })
        const source: BondEndpoint = {
          sourceAtomId: atom.id,
          symmetryOperationId: operation.id,
          integerCellOffset
        }
        const cartesian = multiplyMatrixVector(snapshot.cell.basis, fractional)
        if (!isFiniteVector(cartesian))
          return failure('COORDINATE_OVERFLOW', 'Instance Cartesian position overflowed.', {
            atomId: atom.id
          })
        candidates.push({
          ...source,
          id: instanceId(source),
          fractional,
          cartesian,
          equivalentSources: [source]
        })
      }
    }
    candidates.sort((a, b) => compareStrings(a.id, b.id))
    const buckets = new Map<string, number[]>()
    const unique: AtomInstance[] = []
    for (const candidate of candidates) {
      const bucket = candidate.fractional!.map((value) =>
        Math.floor(value / SPECIAL_POSITION_TOLERANCE)
      )
      let found: number | undefined
      for (let x = -1; x <= 1 && found === undefined; x++)
        for (let y = -1; y <= 1 && found === undefined; y++)
          for (let z = -1; z <= 1 && found === undefined; z++) {
            for (const index of buckets.get(`${bucket[0] + x},${bucket[1] + y},${bucket[2] + z}`) ??
              []) {
              if (
                candidate.fractional!.every(
                  (value, component) =>
                    Math.abs(value - unique[index].fractional![component]) <=
                    SPECIAL_POSITION_TOLERANCE
                )
              ) {
                found = index
                break
              }
            }
          }
      if (found !== undefined) {
        const existing = unique[found]
        unique[found] = {
          ...existing,
          equivalentSources: [...existing.equivalentSources, ...candidate.equivalentSources].sort(
            (a, b) => compareStrings(endpointKey(a), endpointKey(b))
          )
        }
      } else {
        const key = bucket.join(',')
        const entries = buckets.get(key) ?? []
        entries.push(unique.length)
        buckets.set(key, entries)
        unique.push(candidate)
      }
    }
    all.push(...unique)
  }
  return success(
    all.sort((a, b) => compareStrings(a.id, b.id)),
    symmetry.diagnostics
  )
}

/** Invert the exact provenance transform for an edited display position. */
export function sourcePositionFromInstance(
  snapshot: StructureSnapshot,
  instance: AtomInstance,
  cartesian: Vec3
): ScientificResult<Vec3> {
  if (
    !snapshot ||
    !Array.isArray(snapshot.atoms) ||
    !['periodic', 'molecular'].includes(snapshot.kind)
  )
    return failure('STRUCTURE_KIND', 'A periodic or molecular structure is required.')
  const structureErrors = validateStructure(snapshot).filter((entry) => entry.severity === 'error')
  if (structureErrors.length) return failureFrom(structureErrors)
  if (!isFiniteVector(cartesian) || !instance || !isIntegerVector(instance.integerCellOffset))
    return failure(
      'INSTANCE_POSITION',
      'Instance edit requires a finite position and integer provenance.'
    )
  if (!snapshot.atoms.some((atom) => atom.id === instance.sourceAtomId))
    return failure('INSTANCE_SOURCE', 'Instance references a missing source atom.')
  if (snapshot.kind === 'molecular') {
    if (
      instance.symmetryOperationId !== 'identity' ||
      instance.integerCellOffset.some((value) => value !== 0)
    )
      return failure('INSTANCE_SOURCE', 'Molecular instance provenance is invalid.')
    return success([...cartesian] as unknown as Vec3)
  }
  const symmetry = resolveSymmetry(snapshot.symmetry, snapshot.cell)
  if (!symmetry.ok) return symmetry
  const operation = symmetry.value.find((entry) => entry.id === instance.symmetryOperationId)
  if (!operation)
    return failure('INSTANCE_OPERATION', 'Instance references a missing symmetry operation.')
  const fractional = cartesianToFractional(snapshot.cell, cartesian)
  if (!fractional.ok) return fractional
  const inverse = invertMatrix(operation.rotation)
  if (!inverse)
    return failure('SYMMETRY_ROTATION', 'Instance symmetry operation is not invertible.')
  const source = multiplyMatrixVector(
    inverse,
    subtract(subtract(fractional.value, translationVector(operation)), instance.integerCellOffset)
  )
  return isFiniteVector(source)
    ? success(source)
    : failure('COORDINATE_OVERFLOW', 'Instance inverse mapping overflowed.')
}
