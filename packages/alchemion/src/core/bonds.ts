import { getElement } from './data'
import { compareStrings, deriveInstances } from './derivation'
import { invertMatrix, isFiniteVector, isIntegerVector, norm, subtract } from './math'
import { failure, failureFrom, success } from './result'
import { validateStructure } from './structure'
import {
  canonicalizeEndpoint,
  endpointKey,
  fractionalReach,
  resolveSymmetry,
  SPECIAL_POSITION_TOLERANCE,
  transformBondEndpoint
} from './symmetry'
import type {
  AtomInstance,
  BondEndpoint,
  DerivedBond,
  DerivedStructure,
  Diagnostic,
  ScientificResult,
  StructureSnapshot,
  SymmetryOperation,
  Vec3
} from './types'

export interface DerivationOptions {
  readonly neighborCells?: readonly Vec3[]
  readonly cutoff?:
    | { readonly kind: 'none' }
    | { readonly kind: 'fraction'; readonly width: Vec3 }
    | { readonly kind: 'bond' }
  readonly inferBonds?: boolean
}
const BOND_DISTANCE_TOLERANCE = 1e-8
const pairKey = (a: string, b: string): string =>
  JSON.stringify(compareStrings(a, b) <= 0 ? [a, b] : [b, a])

/** Inputs have already resolved special-position aliases; remove common translation in both directions. */
export function canonicalizeBondEndpoints(
  a: BondEndpoint,
  b: BondEndpoint
): readonly [BondEndpoint, BondEndpoint] {
  const forward: readonly [BondEndpoint, BondEndpoint] = [
    {
      sourceAtomId: a.sourceAtomId,
      symmetryOperationId: a.symmetryOperationId,
      integerCellOffset: [0, 0, 0]
    },
    {
      sourceAtomId: b.sourceAtomId,
      symmetryOperationId: b.symmetryOperationId,
      integerCellOffset: subtract(b.integerCellOffset, a.integerCellOffset)
    }
  ]
  const reverse: readonly [BondEndpoint, BondEndpoint] = [
    {
      sourceAtomId: b.sourceAtomId,
      symmetryOperationId: b.symmetryOperationId,
      integerCellOffset: [0, 0, 0]
    },
    {
      sourceAtomId: a.sourceAtomId,
      symmetryOperationId: a.symmetryOperationId,
      integerCellOffset: subtract(a.integerCellOffset, b.integerCellOffset)
    }
  ]
  return compareStrings(JSON.stringify(forward), JSON.stringify(reverse)) <= 0 ? forward : reverse
}

function radii(snapshot: StructureSnapshot): {
  values: Map<string, number>
  maximum: number
  diagnostics: Diagnostic[]
} {
  const values = new Map<string, number>()
  const diagnostics: Diagnostic[] = []
  let maximum = 0
  for (const atom of snapshot.atoms) {
    const radius = getElement(atom.element)?.covalentRadius?.value
    if (radius === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'BOND_RADIUS_MISSING',
        message:
          'No verified covalent radius is available; geometry cannot infer bonds for this atom.',
        context: { atomId: atom.id, element: atom.element }
      })
    } else {
      values.set(atom.id, radius)
      maximum = Math.max(maximum, radius)
    }
  }
  return { values, maximum, diagnostics }
}

function projectExplicitBonds(
  snapshot: StructureSnapshot,
  instances: readonly AtomInstance[],
  operations?: readonly SymmetryOperation[]
): ScientificResult<readonly DerivedBond[]> {
  if (!Array.isArray(snapshot.bonds))
    return failure('BONDS_INPUT', 'Structure bonds must be an array.')
  const aliasMap = new Map<string, AtomInstance>()
  const aliasesBySourceOperation = new Map<
    string,
    { readonly source: BondEndpoint; readonly instance: AtomInstance }[]
  >()
  for (const instance of instances) {
    for (const source of instance.equivalentSources) {
      aliasMap.set(endpointKey(source), instance)
      const key = JSON.stringify([source.sourceAtomId, source.symmetryOperationId])
      const entries = aliasesBySourceOperation.get(key) ?? []
      entries.push({ source, instance })
      aliasesBySourceOperation.set(key, entries)
    }
  }
  const bonds = new Map<string, DerivedBond>()
  const diagnostics: Diagnostic[] = []
  for (const bond of [...snapshot.bonds].sort((a, b) => compareStrings(a.id, b.id))) {
    if (!Array.isArray(bond.endpoints) || bond.endpoints.length !== 2)
      return failure('BOND_ENDPOINTS', 'Explicit bonds require two endpoints.')
    const orbit = snapshot.kind === 'periodic' ? operations! : [undefined]
    for (const operation of orbit) {
      const a = operation
        ? transformBondEndpoint(snapshot, bond.endpoints[0], operation, operations!)
        : canonicalizeEndpoint(snapshot, bond.endpoints[0], operations)
      const b = operation
        ? transformBondEndpoint(snapshot, bond.endpoints[1], operation, operations!)
        : canonicalizeEndpoint(snapshot, bond.endpoints[1], operations)
      if (!a.ok) return a
      if (!b.ok) return b
      const canonicalEndpoints = canonicalizeBondEndpoints(a.value, b.value)
      const key = JSON.stringify([a.value.sourceAtomId, a.value.symmetryOperationId])
      for (const { source, instance: left } of aliasesBySourceOperation.get(key) ?? []) {
        const common = subtract(source.integerCellOffset, a.value.integerCellOffset)
        const target: BondEndpoint = {
          sourceAtomId: b.value.sourceAtomId,
          symmetryOperationId: b.value.symmetryOperationId,
          integerCellOffset: [
            b.value.integerCellOffset[0] + common[0],
            b.value.integerCellOffset[1] + common[1],
            b.value.integerCellOffset[2] + common[2]
          ]
        }
        const right = aliasMap.get(endpointKey(target))
        if (!right) continue
        if (left.id === right.id)
          return failure('BOND_SELF', 'An explicit bond resolves to the same physical instance.', {
            bondId: bond.id
          })
        const displayKey = pairKey(left.id, right.id)
        const existing = bonds.get(displayKey)
        if (existing && existing.sourceBondId !== bond.id) {
          diagnostics.push({
            severity: 'warning',
            code: 'BOND_EXPLICIT_DUPLICATE',
            message: 'Duplicate explicit endpoint pairs use the lowest stable bond ID.',
            context: { bondId: bond.id }
          })
          continue
        }
        bonds.set(displayKey, {
          id: `bond:${displayKey}`,
          sourceBondId: bond.id,
          provenance: 'explicit',
          order: bond.order,
          endpoints:
            compareStrings(left.id, right.id) <= 0 ? [left.id, right.id] : [right.id, left.id],
          canonicalEndpoints
        })
      }
    }
  }
  return success(
    [...bonds.values()].sort((a, b) => compareStrings(a.id, b.id)),
    diagnostics
  )
}

/** Geometry-only single bonds, plus projected explicit bonds with precedence. */
export function inferBonds(
  snapshot: StructureSnapshot,
  instances: readonly AtomInstance[]
): ScientificResult<readonly DerivedBond[]> {
  if (!snapshot || !Array.isArray(snapshot.atoms) || !Array.isArray(instances))
    return failure(
      'BONDS_INPUT',
      'Bond inference requires a source structure and finite instances.'
    )
  const structureErrors = validateStructure(snapshot).filter((entry) => entry.severity === 'error')
  if (structureErrors.length) return failureFrom(structureErrors)
  if (instances.some((instance) => !instance || typeof instance.id !== 'string'))
    return failure('INSTANCE_INPUT', 'Every bond instance requires an ID.')
  const operationResult =
    snapshot.kind === 'periodic'
      ? resolveSymmetry(snapshot.symmetry, snapshot.cell)
      : success<readonly SymmetryOperation[]>([])
  if (!operationResult.ok) return operationResult
  const sourceIds = new Set(snapshot.atoms.map((atom) => atom.id))
  const operationIds = new Set(
    snapshot.kind === 'periodic'
      ? operationResult.value.map((operation) => operation.id)
      : ['identity']
  )
  const validSource = (source: BondEndpoint, atomId: string): boolean =>
    Boolean(source) &&
    source.sourceAtomId === atomId &&
    sourceIds.has(atomId) &&
    operationIds.has(source.symmetryOperationId) &&
    isIntegerVector(source.integerCellOffset) &&
    (snapshot.kind === 'periodic' || source.integerCellOffset.every((component) => component === 0))
  const radiusData = radii(snapshot)
  const cellSize = 2.4 * radiusData.maximum + BOND_DISTANCE_TOLERANCE
  const buckets = new Map<string, AtomInstance[]>()
  const bonds = new Map<string, DerivedBond>()
  const ids = new Set<string>()
  for (const instance of [...instances].sort((a, b) => compareStrings(a.id, b.id))) {
    if (
      !instance ||
      !isFiniteVector(instance.cartesian) ||
      ids.has(instance.id) ||
      !Array.isArray(instance.equivalentSources)
    )
      return failure(
        'INSTANCE_INPUT',
        'Bond instances require finite coordinates, unique IDs and provenance.'
      )
    ids.add(instance.id)
    if (
      !validSource(instance, instance.sourceAtomId) ||
      instance.equivalentSources.length === 0 ||
      !instance.equivalentSources.every((source: BondEndpoint) =>
        validSource(source, instance.sourceAtomId)
      )
    )
      return failure(
        'INSTANCE_SOURCE',
        'Bond instance provenance must reference an existing source atom, operation and integer offset.',
        { instanceId: instance.id }
      )
    const radius = radiusData.values.get(instance.sourceAtomId)
    if (radius === undefined) continue
    const bucket = instance.cartesian.map((value: number) => Math.floor(value / cellSize))
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          for (const other of buckets.get(`${bucket[0] + x},${bucket[1] + y},${bucket[2] + z}`) ??
            []) {
            const distance = norm(subtract(instance.cartesian, other.cartesian))
            const threshold = 1.2 * (radius + radiusData.values.get(other.sourceAtomId)!)
            if (
              distance <= 0.1 + BOND_DISTANCE_TOLERANCE ||
              distance > threshold + BOND_DISTANCE_TOLERANCE
            )
              continue
            const key = pairKey(instance.id, other.id)
            bonds.set(key, {
              id: `bond:${key}`,
              provenance: 'inferred',
              order: 'single',
              endpoints:
                compareStrings(instance.id, other.id) <= 0
                  ? [instance.id, other.id]
                  : [other.id, instance.id],
              canonicalEndpoints: canonicalizeBondEndpoints(instance, other)
            })
          }
        }
    const key = bucket.join(',')
    const entries = buckets.get(key) ?? []
    entries.push(instance)
    buckets.set(key, entries)
  }
  const explicit = projectExplicitBonds(snapshot, instances, operationResult.value)
  if (!explicit.ok) return explicit
  for (const bond of explicit.value) bonds.set(pairKey(...bond.endpoints), bond)
  return success(
    [...bonds.values()].sort((a, b) => compareStrings(a.id, b.id)),
    [...operationResult.diagnostics, ...radiusData.diagnostics, ...explicit.diagnostics]
  )
}

/** Complete deterministic derivation. The selected cell set is always the display permission boundary. */
export function deriveStructure(
  snapshot: StructureSnapshot,
  options: DerivationOptions = {}
): ScientificResult<DerivedStructure> {
  if (
    !snapshot ||
    !Array.isArray(snapshot.atoms) ||
    !['periodic', 'molecular'].includes(snapshot.kind)
  )
    return failure('STRUCTURE_KIND', 'A periodic or molecular structure is required.')
  if (
    !options ||
    typeof options !== 'object' ||
    (options.inferBonds !== undefined && typeof options.inferBonds !== 'boolean')
  )
    return failure('DERIVATION_OPTIONS', 'Invalid structure derivation options.')
  if (
    options.cutoff !== undefined &&
    (!options.cutoff ||
      typeof options.cutoff !== 'object' ||
      !['none', 'fraction', 'bond'].includes(options.cutoff.kind))
  )
    return failure('CUTOFF_KIND', 'Unknown cutoff kind.')
  if (snapshot.kind === 'molecular' && options.cutoff?.kind === 'bond')
    return failure('MOLECULAR_PERIODIC_OPTIONS', 'Bond cutoff requires a periodic structure.')
  const instances = deriveInstances(snapshot, {
    neighborCells: options.neighborCells,
    cutoff: options.cutoff?.kind === 'bond' ? undefined : options.cutoff
  })
  if (!instances.ok) return instances
  let searchInstances = instances.value
  // For a primary-cell point, |Δf_i| <= ||row_i(A^-1)|| * dmax.
  // This bound covers oblique lattices and translations spanning arbitrarily many cells.
  if (snapshot.kind === 'periodic' && options.cutoff?.kind === 'bond') {
    const inverse = invertMatrix(snapshot.cell.basis)!
    const maximumDistance = 2.4 * radii(snapshot).maximum + BOND_DISTANCE_TOLERANCE
    const reach = fractionalReach(inverse, maximumDistance)
    searchInstances = instances.value.filter((instance) =>
      instance.fractional!.every(
        (value, index) =>
          value >= -reach[index] - SPECIAL_POSITION_TOLERANCE &&
          value <= 1 + reach[index] + SPECIAL_POSITION_TOLERANCE
      )
    )
  }
  const operationResult =
    snapshot.kind === 'periodic'
      ? resolveSymmetry(snapshot.symmetry, snapshot.cell)
      : success<readonly SymmetryOperation[]>([])
  if (!operationResult.ok) return operationResult
  const computed =
    options.inferBonds === false
      ? projectExplicitBonds(snapshot, instances.value, operationResult.value)
      : inferBonds(snapshot, searchInstances)
  if (!computed.ok) return computed
  let bonds = computed.value
  const diagnostics = [...instances.diagnostics, ...computed.diagnostics]
  if (options.cutoff?.kind === 'bond') {
    // Explicit bonds can be longer than the geometric radius rule.
    const explicit = projectExplicitBonds(snapshot, instances.value, operationResult.value)
    if (!explicit.ok) return explicit
    const combined = new Map(bonds.map((bond) => [pairKey(...bond.endpoints), bond]))
    for (const bond of explicit.value) combined.set(pairKey(...bond.endpoints), bond)
    bonds = [...combined.values()].sort((a, b) => compareStrings(a.id, b.id))
    const primary = new Set(
      instances.value
        .filter((instance) => instance.fractional!.every((value) => value >= 0 && value < 1))
        .map((instance) => instance.id)
    )
    const kept = new Set(primary)
    for (const bond of bonds)
      if (primary.has(bond.endpoints[0]) || primary.has(bond.endpoints[1])) {
        kept.add(bond.endpoints[0])
        kept.add(bond.endpoints[1])
      }
    return success(
      {
        atoms: instances.value.filter((instance) => kept.has(instance.id)),
        bonds: bonds.filter((bond) => kept.has(bond.endpoints[0]) && kept.has(bond.endpoints[1]))
      },
      diagnostics
    )
  }
  return success({ atoms: instances.value, bonds }, diagnostics)
}
