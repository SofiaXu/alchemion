import { canonicalizeBondEndpoints } from '../../../core/bonds'
import { createCell } from '../../../core/cell'
import { finishConstruction } from '../../../core/construction'
import {
  periodicBuckets,
  periodicDistance,
  wrapPosition
} from '../../../core/construction-periodic'
import type {
  ConstructionMapping,
  ConstructionOrigin,
  ConstructionResult
} from '../../../core/construction'
import { getSpaceGroupSetting } from '../../../core/data'
import {
  add,
  determinant,
  invertMatrix,
  multiplyMatrices,
  multiplyMatrixVector,
  norm,
  scale,
  subtract
} from '../../../core/math'
import { transformMobility } from '../../../core/mobility'
import { failure, failureFrom } from '../../../core/result'
import { createStructureSnapshot } from '../../../core/structure'
import { createSupercell } from '../../../core/supercell'
import { endpointKey } from '../../../core/symmetry'
import type {
  Diagnostic,
  JsonValue,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  SourceBond,
  Vec3
} from '../../../core/types'
import { findCrystalDataset } from './engine'
import type { SpglibDataset } from './engine'

export interface CrystalSymmetryOptions {
  readonly output?: 'recognition' | 'standard' | 'primitive'
  readonly distance?: number
  readonly angle?: number
  readonly hallNumber?: number
}

type Materialization = Extract<ReturnType<typeof createSupercell>, { ok: true }>['value']
const EPSILON = 1e-9
const ZERO: Vec3 = [0, 0, 0]
const speciesKey = (atom: PeriodicAtom) =>
  JSON.stringify([
    atom.element,
    atom.isotope ?? null,
    atom.occupancy?.kind === 'known' ? atom.occupancy.value : 1
  ])
const floorVector = (value: Vec3): Vec3 => [
  Math.floor(value[0] + EPSILON),
  Math.floor(value[1] + EPSILON),
  Math.floor(value[2] + EPSILON)
]
const roundVector = (value: Vec3): Vec3 => [
  Math.round(value[0]),
  Math.round(value[1]),
  Math.round(value[2])
]

interface SiteInput {
  readonly positions: Vec3[]
  readonly types: number[]
  readonly groupForAtom: Map<string, number>
}

function siteInput(snapshot: PeriodicStructureSnapshot): SiteInput | undefined {
  const groups: PeriodicAtom[][] = []
  const cutoff = 1e-7
  const buckets = periodicBuckets<PeriodicAtom[]>(
    snapshot.cell,
    invertMatrix(snapshot.cell.basis)!,
    cutoff
  )
  const budget = { remaining: 1_000_000 }
  for (const atom of snapshot.atoms) {
    if (atom.occupancy && atom.occupancy.kind !== 'known') return undefined
    let group: PeriodicAtom[] | undefined
    for (const candidate of buckets.near(atom.fractional)) {
      const distance = buckets.distance(atom.fractional, candidate.point, budget)
      if (distance === undefined) return undefined
      if (distance > cutoff) continue
      if (group) return undefined
      group = candidate.value
    }
    if (group) group.push(atom)
    else {
      group = [atom]
      groups.push(group)
      buckets.add(atom.fractional, group)
    }
  }
  const positions: Vec3[] = []
  const types: number[] = []
  const groupForAtom = new Map<string, number>()
  const typeIds = new Map<string, number>()
  for (const group of groups.values()) {
    const species = group.map(speciesKey).sort()
    if (
      new Set(species).size !== species.length ||
      group.reduce(
        (sum, atom) => sum + (atom.occupancy?.kind === 'known' ? atom.occupancy.value : 1),
        0
      ) >
        1 + EPSILON
    )
      return undefined
    const key = JSON.stringify(species)
    if (!typeIds.has(key)) typeIds.set(key, typeIds.size + 1)
    types.push(typeIds.get(key)!)
    for (const atom of group) groupForAtom.set(atom.id, positions.length)
    positions.push(wrapPosition(group[0].fractional))
  }
  return { positions, types, groupForAtom }
}

function transformCrystal(
  source: PeriodicStructureSnapshot,
  expanded: Materialization,
  sites: SiteInput,
  data: SpglibDataset,
  output: 'standard' | 'primitive',
  tolerance: number,
  parameters: Record<string, JsonValue>,
  diagnostics: Diagnostic[]
): ScientificResult<ConstructionResult<PeriodicStructureSnapshot>> {
  const oldBasis = expanded.snapshot.cell.basis
  const standardInverse = invertMatrix(data.transformation)
  if (!standardInverse)
    return failure('CRYSTAL_CONVERSION_BASIS', 'The recognized basis transformation is singular.')
  let basis =
    output === 'standard' ? multiplyMatrices(oldBasis, standardInverse) : data.primitiveBasis
  const reverseNormal = determinant(basis) < 0
  if (reverseNormal) basis = [basis[0], basis[1], scale(basis[2], -1)]
  const cell = createCell({ basis })
  if (!cell.ok) return cell
  const inverseBasis = invertMatrix(basis)!
  const transform = multiplyMatrices(inverseBasis, oldBasis)
  const inverse = invertMatrix(transform)!
  const shift: Vec3 =
    output === 'primitive'
      ? ZERO
      : reverseNormal
        ? [data.originShift[0], data.originShift[1], -data.originShift[2]]
        : data.originShift
  const preimage = Array.from({ length: 8 }, (_, i) =>
    multiplyMatrixVector(inverse, subtract([i & 1, (i >> 1) & 1, i >> 2], shift))
  )
  const low = [0, 1, 2].map((axis) => Math.min(...preimage.map((point) => point[axis])))
  const high = [0, 1, 2].map((axis) => Math.max(...preimage.map((point) => point[axis])))
  const atoms: PeriodicAtom[] = []
  const atomOrigins = new Map<string, ConstructionOrigin[]>()
  const oldSources = new Map(expanded.atomMapping.map((entry) => [entry.atomId, entry]))
  const oldAtoms = new Map(expanded.snapshot.atoms.map((entry) => [entry.id, entry]))
  const oldBonds = new Map(expanded.bondMapping.map((entry) => [entry.bondId, entry.sourceBondId]))
  const reserved = new Set(source.atoms.map(({ id }) => id))
  const reservedBonds = new Set(source.bonds.map(({ id }) => id))
  const labels = new Set<string>()
  const imageBudget = { remaining: 2_000_000 }
  interface RecordEntry {
    atom: PeriodicAtom
    old: PeriodicAtom
    offset: Vec3
  }
  const records = new Map<string, RecordEntry[]>()
  const groupKey = (atom: PeriodicAtom) =>
    `${data.primitiveSites[sites.groupForAtom.get(atom.id)!]}:${speciesKey(atom)}`
  const project = (point: Vec3) => add(multiplyMatrixVector(transform, point), shift)
  const locate = (atom: PeriodicAtom, point: Vec3) => {
    let best: { record: RecordEntry; offset: Vec3; error: number } | undefined
    for (const record of records.get(groupKey(atom)) ?? []) {
      if (--imageBudget.remaining < 0) break
      const delta = subtract(point, record.atom.fractional)
      const image: { offset?: Vec3 } = {}
      const error = periodicDistance(
        delta,
        basis,
        inverseBasis,
        best?.error ?? tolerance + EPSILON,
        imageBudget,
        false,
        image
      )
      if (error !== undefined && image.offset && error <= (best?.error ?? tolerance + EPSILON))
        best = { record, offset: image.offset, error }
    }
    return best
  }
  let iterations = 0
  let nextId = 0
  let lostUncertainty = Boolean(source.cell.parameterUncertainties)
  for (const old of expanded.snapshot.atoms) {
    const movable = transformMobility(old.movable, transform, old.id)
    if (!movable.ok) return movable
    const start = low.map((bound, axis) => Math.ceil(bound - old.fractional[axis] - EPSILON))
    const end = high.map((bound, axis) => Math.floor(bound - old.fractional[axis] + EPSILON))
    const budget = end.reduce(
      (product, bound, axis) => product * Math.max(0, bound - start[axis] + 1),
      1
    )
    iterations += budget
    if (
      !Number.isSafeInteger(iterations) ||
      iterations > 2_000_000 ||
      ![...start, ...end].every(Number.isSafeInteger)
    )
      return failure(
        'CRYSTAL_CONVERSION_BUDGET',
        'The basis conversion exceeds its lattice image budget.'
      )
    for (let x = start[0]; x <= end[0]; x++)
      for (let y = start[1]; y <= end[1]; y++)
        for (let z = start[2]; z <= end[2]; z++) {
          const offset: Vec3 = [x, y, z]
          const fractional = project(add(old.fractional, offset))
          if (
            floorVector(fractional).some((component) => component !== 0) ||
            locate(old, fractional)
          )
            continue
          if (atoms.length >= 100_000)
            return failure(
              'CRYSTAL_CONVERSION_BUDGET',
              'The converted cell exceeds its atom budget.'
            )
          let id: string
          do id = `crystal:atom:${++nextId}`
          while (reserved.has(id))
          const { coordinateUncertainties, label: sourceLabel, ...attributes } = old
          lostUncertainty ||= Boolean(coordinateUncertainties)
          let label = sourceLabel
          for (let suffix = 2; label && labels.has(label); suffix++)
            label = `${sourceLabel}_${suffix}`
          if (label) labels.add(label)
          const atom = {
            ...attributes,
            id,
            fractional,
            ...(label ? { label } : {})
          }
          if (movable.value) atom.movable = movable.value
          else delete atom.movable
          atoms.push(atom)
          const key = groupKey(old)
          const group = records.get(key) ?? []
          group.push({ atom, old, offset })
          records.set(key, group)
          atomOrigins.set(id, [])
        }
  }
  const copyOrigin = (id: string, old: PeriodicAtom, offset: Vec3, outputCellOffset?: Vec3) => {
    const mapping = oldSources.get(old.id)!
    for (const endpoint of [mapping.source, ...mapping.equivalentSources]) {
      const shifted = { ...endpoint, integerCellOffset: add(endpoint.integerCellOffset, offset) }
      const entries = atomOrigins.get(id)!
      if (!entries.some((entry) => endpointKey(entry.endpoint!) === endpointKey(shifted)))
        entries.push({
          input: 'source',
          sourceId: endpoint.sourceAtomId,
          endpoint: shifted,
          ...(outputCellOffset ? { outputCellOffset } : {})
        })
    }
  }
  for (const group of records.values())
    for (const record of group) copyOrigin(record.atom.id, record.old, record.offset)
  let largestResidual = 0
  for (const old of expanded.snapshot.atoms) {
    const point = project(old.fractional)
    const equivalent = locate(old, point)
    if (!equivalent)
      return failure(
        'CRYSTAL_CONVERSION_MAPPING',
        'A source atom has no equivalent in the converted cell.',
        { atomId: old.id }
      )
    largestResidual = Math.max(largestResidual, equivalent.error)
    const representative = equivalent.record.atom
    const mobility = transformMobility(old.movable, transform, old.id)
    if (!mobility.ok) return mobility
    if (
      JSON.stringify(mobility.value ?? [true, true, true]) !==
        JSON.stringify(representative.movable ?? [true, true, true]) ||
      old.formalCharge !== representative.formalCharge ||
      old.radical !== representative.radical ||
      old.atomMap !== representative.atomMap ||
      (old.occupancy?.kind === 'known' ? old.occupancy.standardUncertainty : undefined) !==
        (representative.occupancy?.kind === 'known'
          ? representative.occupancy.standardUncertainty
          : undefined) ||
      JSON.stringify(old.oxidationState) !== JSON.stringify(representative.oxidationState) ||
      JSON.stringify(old.displacementU) !== JSON.stringify(representative.displacementU)
    )
      return failure(
        'CRYSTAL_CONVERSION_PROPERTIES',
        'Equivalent atoms have incompatible source properties.',
        { atomId: old.id }
      )
    const oldOffset = roundVector(scale(multiplyMatrixVector(inverse, equivalent.offset), -1))
    if (
      norm(subtract(multiplyMatrixVector(transform, oldOffset), scale(equivalent.offset, -1))) <=
      EPSILON
    )
      copyOrigin(representative.id, old, oldOffset)
    else copyOrigin(representative.id, old, ZERO, equivalent.offset)
  }
  const bonds: SourceBond[] = []
  const bondOrigins = new Map<string, ConstructionOrigin[]>()
  const seenBonds = new Map<string, SourceBond>()
  let nextBond = 0
  for (const bond of expanded.snapshot.bonds) {
    const [left, right] = bond.endpoints
    const leftAtom = oldAtoms.get(left.sourceAtomId)!
    const rightAtom = oldAtoms.get(right.sourceAtomId)!
    const delta = subtract(right.integerCellOffset, left.integerCellOffset)
    for (const { atom } of records.get(groupKey(leftAtom)) ?? []) {
      const shiftToLeft = subtract(
        multiplyMatrixVector(inverse, subtract(atom.fractional, shift)),
        leftAtom.fractional
      )
      const rightPoint = project(add(add(rightAtom.fractional, shiftToLeft), delta))
      const match = locate(rightAtom, rightPoint)
      if (!match)
        return failure(
          'CRYSTAL_CONVERSION_BOND',
          'An explicit bond cannot be represented in the converted cell.',
          { bondId: oldBonds.get(bond.id) }
        )
      const endpoints = canonicalizeBondEndpoints(
        { sourceAtomId: atom.id, symmetryOperationId: 'identity', integerCellOffset: ZERO },
        {
          sourceAtomId: match.record.atom.id,
          symmetryOperationId: 'identity',
          integerCellOffset: match.offset
        }
      )
      if (endpointKey(endpoints[0]) === endpointKey(endpoints[1]))
        return failure(
          'CRYSTAL_CONVERSION_BOND',
          'A source bond collapses to a single site in the converted cell.'
        )
      const key = endpoints.map(endpointKey).join('|')
      const previous = seenBonds.get(key)
      if (previous && (previous.order !== bond.order || previous.stereo !== bond.stereo))
        return failure(
          'CRYSTAL_CONVERSION_BOND',
          'Equivalent bonds have conflicting scientific attributes.'
        )
      let id = previous?.id
      if (id === undefined) {
        do id = `crystal:bond:${++nextBond}`
        while (reservedBonds.has(id))
        const converted = { ...bond, id, endpoints }
        seenBonds.set(key, converted)
        bonds.push(converted)
        bondOrigins.set(id, [])
      }
      const sourceId = oldBonds.get(bond.id)!
      if (!bondOrigins.get(id)!.some((entry) => entry.sourceId === sourceId))
        bondOrigins.get(id)!.push({ input: 'source', sourceId })
    }
  }
  const volumeRatio = determinant(basis) / determinant(oldBasis)
  if (imageBudget.remaining < 0)
    return failure('CRYSTAL_CONVERSION_BUDGET', 'Periodic site matching exceeded its image budget.')
  const expectedAtoms = volumeRatio * expanded.snapshot.atoms.length
  const expectedBonds = volumeRatio * expanded.snapshot.bonds.length
  if (Math.abs(atoms.length - expectedAtoms) > 1e-5 * Math.max(1, expectedAtoms))
    return failure(
      'CRYSTAL_CONVERSION_COUNT',
      'The converted cell does not conserve occupancy sites by volume.'
    )
  if (Math.abs(bonds.length - expectedBonds) > 1e-5 * Math.max(1, expectedBonds))
    return failure(
      'CRYSTAL_CONVERSION_BOND',
      'The explicit bond topology is incompatible with the converted lattice periodicity.'
    )
  if (lostUncertainty)
    diagnostics.push({
      severity: 'warning',
      code: 'CRYSTAL_CONVERSION_UNCERTAINTY',
      message: 'The transformed cell and positions do not retain source measurement uncertainty.'
    })
  if (largestResidual > EPSILON)
    diagnostics.push({
      severity: 'warning',
      code: 'CRYSTAL_CONVERSION_RESIDUAL',
      message:
        'Equivalent positions differ within the requested tolerance. The result uses source representatives.',
      context: { largestResidual }
    })
  const mappings = (entries: Map<string, ConstructionOrigin[]>): ConstructionMapping[] =>
    [...entries].map(([id, origins]) => ({ id, origins }))
  return finishConstruction(
    {
      kind: 'periodic',
      title: source.title,
      cell: cell.value,
      atoms,
      bonds,
      metadata: source.metadata
    },
    mappings(atomOrigins),
    mappings(bondOrigins),
    { ...parameters, output, transform, originShift: shift, largestResidual },
    diagnostics
  )
}

export async function analyzeCrystalSymmetry(
  snapshot: PeriodicStructureSnapshot,
  options: CrystalSymmetryOptions = {}
): Promise<ScientificResult<ConstructionResult<PeriodicStructureSnapshot>>> {
  const { distance = 0.001, angle = -1, hallNumber = 0, output = 'recognition' } = options
  if (
    !Number.isFinite(distance) ||
    distance <= 0 ||
    !(angle === -1 || (Number.isFinite(angle) && angle > 0 && angle < 180)) ||
    (hallNumber !== 0 && !getSpaceGroupSetting(hallNumber)) ||
    !['recognition', 'standard', 'primitive'].includes(output)
  )
    return failure(
      'CRYSTAL_SYMMETRY_OPTIONS',
      'Use a positive distance tolerance, angle tolerance in degrees or -1, and a known Hall setting.'
    )
  const checked = createStructureSnapshot(snapshot)
  if (!checked.ok) return checked
  if (checked.value.kind !== 'periodic')
    return failure('CRYSTAL_SYMMETRY_SOURCE', 'Symmetry recognition requires a periodic source.')
  const geometry =
    output === 'recognition'
      ? {
          ...checked.value,
          atoms: checked.value.atoms.map((atom) => {
            const site = { ...atom }
            delete site.movable
            return site
          }),
          bonds: []
        }
      : checked.value
  const expanded = createSupercell(geometry, [1, 1, 1])
  if (!expanded.ok) return expanded
  if (!expanded.value.snapshot.atoms.length || expanded.value.snapshot.atoms.length > 10_000)
    return failure(
      'CRYSTAL_SYMMETRY_BUDGET',
      'Symmetry search requires between 1 and 10,000 materialized atoms.'
    )
  const sites = siteInput(expanded.value.snapshot)
  if (!sites)
    return failure(
      'CRYSTAL_SYMMETRY_OCCUPANCY',
      'Symmetry recognition requires known and compatible co-located occupancies.'
    )
  const data = await findCrystalDataset(
    snapshot.cell.basis,
    sites.positions,
    sites.types,
    hallNumber,
    distance,
    angle
  )
  if (typeof data === 'number')
    return failureFrom([
      ...expanded.diagnostics,
      {
        severity: 'error',
        code: 'CRYSTAL_SYMMETRY_SEARCH',
        message: 'spglib could not determine a compatible space group.',
        context: { spglibError: data }
      }
    ])
  const setting = getSpaceGroupSetting(data.hallNumber)
  const representative = new Map<string, string>()
  const byId = new Map(expanded.value.snapshot.atoms.map((atom) => [atom.id, atom]))
  const orbits: Record<string, JsonValue>[] = []
  for (const entry of expanded.value.atomMapping) {
    const index = sites.groupForAtom.get(entry.atomId)!
    const orbit = data.equivalentSites[index]
    const speciesOrbit = `${orbit}:${speciesKey(byId.get(entry.atomId)!)}`
    if (!representative.has(speciesOrbit))
      representative.set(speciesOrbit, entry.source.sourceAtomId)
    orbits.push({
      endpoint: { ...entry.source },
      orbit,
      representativeSourceId: representative.get(speciesOrbit)!
    })
  }
  const parameters = {
    output,
    distance,
    angle,
    hallNumber: data.hallNumber,
    itNumber: data.itNumber,
    hallSymbol: setting?.hallSymbol ?? '',
    hermannMauguin: setting?.hermannMauguin ?? '',
    transformation: data.transformation,
    originShift: data.originShift,
    operations: data.operations.map(({ rotation, translation }) => ({ rotation, translation })),
    orbits
  }
  if (output !== 'recognition')
    return transformCrystal(snapshot, expanded.value, sites, data, output, distance, parameters, [
      ...expanded.diagnostics
    ])
  return finishConstruction(
    snapshot,
    snapshot.atoms.map(({ id }) => ({ id, origins: [{ input: 'source', sourceId: id }] })),
    snapshot.bonds.map(({ id }) => ({ id, origins: [{ input: 'source', sourceId: id }] })),
    parameters,
    expanded.diagnostics
  )
}
