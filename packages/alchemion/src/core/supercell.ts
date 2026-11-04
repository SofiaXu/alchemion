import { canonicalizeBondEndpoints } from './bonds'
import { createCell } from './cell'
import { compareStrings, deriveInstances } from './derivation'
import { integerCellTransform } from './integer-cell'
import { add, isIntegerVector, multiplyMatrices, multiplyMatrixVector, subtract } from './math'
import { transformMobility } from './mobility'
import { failure, failureFrom, success } from './result'
import { createStructureSnapshot } from './structure'
import {
  applySymmetry,
  createEndpointResolver,
  endpointKey,
  IDENTITY_OPERATION,
  resolveSymmetry
} from './symmetry'
import type {
  AtomId,
  AtomInstance,
  BondEndpoint,
  BondId,
  Diagnostic,
  JsonValue,
  Matrix3,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  SourceBond,
  StructureSnapshot,
  Vec3
} from './types'

export interface SupercellAtomMapping {
  readonly atomId: AtomId
  readonly source: BondEndpoint
  readonly equivalentSources: readonly BondEndpoint[]
}
export interface SupercellBondMapping {
  readonly bondId: BondId
  readonly sourceBondId: BondId
}
export interface SupercellResult {
  readonly snapshot: PeriodicStructureSnapshot
  readonly atomMapping: readonly SupercellAtomMapping[]
  readonly bondMapping: readonly SupercellBondMapping[]
}

/** Internal allocation boundary: document stores reserve IDs across undo branches. */
export interface SupercellIdAllocator {
  atom(): AtomId
  bond(): BondId
}

const MAX_SUPERCELL_ATOMS = 100_000
const translated = (endpoint: BondEndpoint, cell: Vec3): BondEndpoint => ({
  sourceAtomId: endpoint.sourceAtomId,
  symmetryOperationId: endpoint.symmetryOperationId,
  integerCellOffset: endpoint.integerCellOffset.map(
    (value, i) => value + cell[i]
  ) as unknown as Vec3
})
const siteKey = (instanceId: string, cell: Vec3): string => JSON.stringify([instanceId, ...cell])

/** Construct a new P1 source; displaying neighbor cells is deliberately a separate operation. */
export function createSupercell(
  snapshot: StructureSnapshot,
  repetitionsOrMatrix: Vec3 | Matrix3
): ScientificResult<SupercellResult> {
  const atoms = new Set(
    Array.isArray(snapshot?.atoms)
      ? snapshot.atoms.flatMap((atom) => (typeof atom?.id === 'string' ? [atom.id] : []))
      : []
  )
  const bonds = new Set(
    Array.isArray(snapshot?.bonds)
      ? snapshot.bonds.flatMap((bond) => (typeof bond?.id === 'string' ? [bond.id] : []))
      : []
  )
  let atomSequence = 0
  let bondSequence = 0
  const next = (kind: 'atom' | 'bond'): string => {
    const used = kind === 'atom' ? atoms : bonds
    let id: string
    do {
      id = `supercell:${kind}:${kind === 'atom' ? ++atomSequence : ++bondSequence}`
    } while (used.has(id))
    used.add(id)
    return id
  }
  return buildSupercell(snapshot, repetitionsOrMatrix, {
    atom: () => next('atom'),
    bond: () => next('bond')
  })
}

/** The sole construction algorithm, shared by the pure API and one-transaction editing. */
export function buildSupercell(
  input: StructureSnapshot,
  repetitionsOrMatrix: Vec3 | Matrix3,
  allocate: SupercellIdAllocator
): ScientificResult<SupercellResult> {
  if (input?.kind !== 'periodic')
    return failure(
      'SUPERCELL_PERIODIC_REQUIRED',
      'Supercell construction requires a periodic source.'
    )
  const repetitions = isIntegerVector(repetitionsOrMatrix) ? repetitionsOrMatrix : undefined
  if (
    repetitions?.some((value) => value <= 0) ||
    (Array.isArray(repetitionsOrMatrix) &&
      !repetitions &&
      repetitionsOrMatrix.every((value) => typeof value === 'number'))
  )
    return failure(
      'SUPERCELL_REPETITIONS',
      'Supercell repetitions must be three positive safe integers.'
    )
  const matrix: Matrix3 = repetitions
    ? [
        [repetitions[0], 0, 0],
        [0, repetitions[1], 0],
        [0, 0, repetitions[2]]
      ]
    : (repetitionsOrMatrix as Matrix3)
  const transform = integerCellTransform(matrix, MAX_SUPERCELL_ATOMS)
  if (!transform.ok) return transform
  const { index: cells, inverse } = transform.value
  const checked = createStructureSnapshot(input)
  if (!checked.ok) return checked
  const source = checked.value as PeriodicStructureSnapshot
  const basis = multiplyMatrices(source.cell.basis, matrix)
  const cellResult = createCell({ basis })
  if (!cellResult.ok) return cellResult
  if (source.atoms.length > MAX_SUPERCELL_ATOMS)
    return failure('SUPERCELL_BUDGET', 'The requested supercell exceeds the 100,000-atom budget.')
  const stereo = source.bonds.find((bond) => bond.stereo !== undefined)
  if (stereo)
    return failure(
      'SUPERCELL_STEREO_UNSUPPORTED',
      'Crystallographic construction does not project drawing stereo markers.',
      { bondId: stereo.id }
    )
  const symmetry = resolveSymmetry(source.symmetry, source.cell)
  if (!symmetry.ok) return symmetry
  const base = deriveInstances(source)
  if (!base.ok) return base
  if (
    !Number.isSafeInteger(base.value.length * cells) ||
    base.value.length * cells > MAX_SUPERCELL_ATOMS
  )
    return failure('SUPERCELL_BUDGET', 'The requested supercell exceeds the 100,000-atom budget.')
  const diagnostics: Diagnostic[] = [...checked.diagnostics, ...base.diagnostics]
  const sourceAtoms = new Map(source.atoms.map((atom) => [atom.id, atom]))
  const aliases = new Map<string, AtomInstance>()
  for (const instance of base.value)
    for (const alias of instance.equivalentSources) aliases.set(endpointKey(alias), instance)
  const operationMap = new Map(symmetry.value.map((operation) => [operation.id, operation]))
  const endpointResolver = createEndpointResolver(source, symmetry.value)
  const atomMapping: SupercellAtomMapping[] = []
  const bondMapping: SupercellBondMapping[] = []
  const atoms: PeriodicAtom[] = []
  const bonds: SourceBond[] = []
  const outputSites = new Map<string, { id: AtomId; wrap: Vec3 }>()
  const labels = new Set(
    source.atoms.flatMap((atom) => (atom.label === undefined ? [] : [atom.label]))
  )
  let labelSequence = 0
  const replicaCells = transform.value.representatives()
  if (!replicaCells)
    return failure('SUPERCELL_MATRIX_RANGE', 'Cell representatives exceed exact integer range.')
  const representatives = new Map(replicaCells.map((cell) => [transform.value.key(cell), cell]))
  const replicaPositions = replicaCells.map((cell) => ({
    cell,
    fractional: transform.value.fractionalRepresentative(cell)
  }))
  for (const original of source.atoms)
    if (original.coordinateUncertainties)
      diagnostics.push({
        severity: 'warning',
        code: 'EDIT_COORDINATE_UNCERTAINTY_CLEARED',
        message:
          'Constructed coordinates no longer carry the original coordinate measurement uncertainty.',
        context: { atomId: original.id }
      })
  for (const instance of base.value) {
    const original = sourceAtoms.get(instance.sourceAtomId)!
    const mobility = transformMobility(
      original.movable,
      multiplyMatrices(inverse, operationMap.get(instance.symmetryOperationId)!.rotation),
      original.id
    )
    if (!mobility.ok) return mobility
    if (original.movable) {
      for (const alias of instance.equivalentSources) {
        const alternative = transformMobility(
          original.movable,
          multiplyMatrices(inverse, operationMap.get(alias.symmetryOperationId)!.rotation),
          original.id
        )
        if (!alternative.ok) return alternative
        if (alternative.value?.some((value, axis) => value !== mobility.value?.[axis]))
          return failure(
            'MOBILITY_ALIAS_CONFLICT',
            'Equivalent source images have different mobility.',
            {
              atomId: original.id
            }
          )
      }
    }
    const transformed = multiplyMatrixVector(inverse, instance.fractional!)
    for (const replica of replicaPositions) {
      const { cell } = replica
      const id = allocate.atom()
      const unwrapped = repetitions
        ? (instance.fractional!.map(
            (value, i) => (value + cell[i]) / repetitions[i]
          ) as unknown as Vec3)
        : add(transformed, replica.fractional)
      const wrap = unwrapped.map(Math.floor) as unknown as Vec3
      if (!isIntegerVector(wrap))
        return failure(
          'SUPERCELL_MATRIX_RANGE',
          'Transformed positions exceed exact integer range.'
        )
      const fractional = subtract(unwrapped, wrap)
      const sourceOffset = transform.value.translateBack(cell, wrap)
      if (!sourceOffset)
        return failure(
          'SUPERCELL_MATRIX_RANGE',
          'Mapped source offsets exceed exact integer range.'
        )
      let label: string | undefined
      if (original.label !== undefined) {
        do {
          label = `${original.label}_${++labelSequence}`
        } while (labels.has(label))
        labels.add(label)
      }
      atoms.push({
        ...original,
        coordinateUncertainties: undefined,
        id,
        fractional,
        ...(mobility.value ? { movable: mobility.value } : {}),
        ...(label !== undefined ? { label } : {})
      })
      outputSites.set(siteKey(instance.id, cell), { id, wrap })
      const mapped = translated(instance, sourceOffset)
      const equivalentSources = instance.equivalentSources.map((alias) =>
        translated(alias, sourceOffset)
      )
      if (
        ![mapped, ...equivalentSources].every((endpoint) =>
          isIntegerVector(endpoint.integerCellOffset)
        )
      )
        return failure('SUPERCELL_MATRIX_RANGE', 'Source provenance exceeds exact integer range.')
      atomMapping.push({
        atomId: id,
        source: mapped,
        equivalentSources
      })
    }
  }
  const baseEndpoint = (endpoint: BondEndpoint) => {
    const atom = sourceAtoms.get(endpoint.sourceAtomId)!
    const operation = operationMap.get(endpoint.symmetryOperationId)!
    const raw = applySymmetry(operation, atom.fractional)
    const wrap = raw.map(Math.floor) as unknown as Vec3
    const alias: BondEndpoint = {
      ...endpoint,
      integerCellOffset: wrap.map((value) => -value) as unknown as Vec3
    }
    const instance = aliases.get(endpointKey(alias))
    const cell = endpoint.integerCellOffset.map((value, i) => value + wrap[i]) as unknown as Vec3
    return instance && isIntegerVector(cell) ? { instance, cell } : undefined
  }
  const seenBonds = new Map<string, BondId>()
  for (const bond of [...source.bonds].sort((a, b) => compareStrings(a.id, b.id))) {
    for (const operation of symmetry.value) {
      const transformed = bond.endpoints.map((endpoint) =>
        endpointResolver.transform(endpoint, operation)
      )
      for (const result of transformed) if (!result.ok) return result
      const left = baseEndpoint(transformed[0].ok ? transformed[0].value : bond.endpoints[0])
      const right = baseEndpoint(transformed[1].ok ? transformed[1].value : bond.endpoints[1])
      if (!left || !right)
        return failure(
          'SUPERCELL_BOND_MAPPING',
          'An explicit bond cannot be mapped to the expanded source.',
          { bondId: bond.id }
        )
      for (const cell of replicaCells) {
        const rightCell = right.cell.map(
          (value, i) => value + cell[i] - left.cell[i]
        ) as unknown as Vec3
        if (!isIntegerVector(rightCell))
          return failure(
            'SUPERCELL_BOND_MAPPING',
            'An explicit bond translation exceeds exact integer range.',
            { bondId: bond.id }
          )
        const representative = representatives.get(transform.value.key(rightCell))
        const a = outputSites.get(siteKey(left.instance.id, cell))!
        const b = representative && outputSites.get(siteKey(right.instance.id, representative))
        const quotient = representative && transform.value.decompose(rightCell, representative)
        const offset = b && quotient && add(quotient, subtract(b.wrap, a.wrap))
        if (!b || !offset || !isIntegerVector(offset))
          return failure(
            'SUPERCELL_BOND_MAPPING',
            'An explicit bond cannot be mapped to the expanded source.',
            { bondId: bond.id }
          )
        const endpoints: readonly [BondEndpoint, BondEndpoint] = [
          { sourceAtomId: a.id, symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] },
          { sourceAtomId: b.id, symmetryOperationId: 'identity', integerCellOffset: offset }
        ]
        const key = JSON.stringify(canonicalizeBondEndpoints(...endpoints))
        const existing = seenBonds.get(key)
        if (existing) {
          if (existing !== bond.id)
            diagnostics.push({
              severity: 'warning',
              code: 'BOND_EXPLICIT_DUPLICATE',
              message: 'Duplicate explicit endpoint pairs use the lowest stable source bond ID.',
              context: { bondId: bond.id }
            })
          continue
        }
        seenBonds.set(key, bond.id)
        const id = allocate.bond()
        bonds.push({ ...bond, id, endpoints })
        bondMapping.push({ bondId: id, sourceBondId: bond.id })
      }
    }
  }
  const basisChanged = matrix.some((column, i) =>
    column.some((value, j) => value !== Number(i === j))
  )
  if (basisChanged && source.cell.parameterUncertainties)
    diagnostics.push({
      severity: 'warning',
      code: 'EDIT_CELL_UNCERTAINTY_CLEARED',
      message:
        'Constructed cell vectors no longer carry the original cell measurement uncertainties.'
    })
  const provenance = {
    ...(repetitions ? { schemaVersion: 1, repetitions } : { schemaVersion: 2, matrix }),
    sourceCell: source.cell,
    sourceSymmetry: symmetry.value,
    atomMapping,
    bondMapping,
    ...(source.metadata?.alchemionSupercell !== undefined
      ? { parent: source.metadata.alchemionSupercell }
      : {})
  } as unknown as JsonValue
  const result = createStructureSnapshot({
    ...source,
    cell: {
      basis,
      ...(!basisChanged && source.cell.parameterUncertainties
        ? { parameterUncertainties: source.cell.parameterUncertainties }
        : {})
    },
    atoms,
    bonds,
    symmetry: { operations: [IDENTITY_OPERATION], spaceGroup: { hallNumber: 1 } },
    metadata: { ...source.metadata, alchemionSupercell: provenance }
  })
  if (!result.ok) return failureFrom([...diagnostics, ...result.diagnostics])
  // Keep all returned metadata plain, isolated and recursively frozen by the snapshot factory.
  const stored = result.value.metadata!.alchemionSupercell as unknown as {
    atomMapping: readonly SupercellAtomMapping[]
    bondMapping: readonly SupercellBondMapping[]
  }
  return success(
    {
      snapshot: result.value as PeriodicStructureSnapshot,
      atomMapping: stored.atomMapping,
      bondMapping: stored.bondMapping
    },
    [...diagnostics, ...result.diagnostics]
  )
}
