import { validateCell } from './cell'
import { getElement } from './data'
import { isFiniteVector, isIntegerVector } from './math'
import { failureFrom, success } from './result'
import { createEndpointResolver, resolveSymmetry } from './symmetry'
import type {
  BondEndpoint,
  Diagnostic,
  DiagnosticContext,
  ScientificResult,
  StructureSnapshot,
  SymmetryOperation
} from './types'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

function serializable(value: unknown, ancestors = new Set<object>(), depth = 0): boolean {
  if (depth > 128) return false
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || ancestors.has(value)) return false
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false
  ancestors.add(value)
  const valid = Object.values(value).every((item) => serializable(item, ancestors, depth + 1))
  ancestors.delete(value)
  return valid
}

export function validateStructure(input: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const error = (code: string, message: string, context?: DiagnosticContext) =>
    diagnostics.push({ severity: 'error', code, message, ...(context ? { context } : {}) })
  if (!record(input))
    return [
      {
        severity: 'error',
        code: 'STRUCTURE_INPUT',
        message: 'Structure must be a plain data object.'
      }
    ]
  if (!serializable(input))
    return [
      {
        severity: 'error',
        code: 'STRUCTURE_SERIALIZATION',
        message: 'Structure must contain finite, acyclic JSON data only.'
      }
    ]
  if (input.kind !== 'periodic' && input.kind !== 'molecular')
    error('STRUCTURE_KIND', 'Structure kind must be periodic or molecular.')
  if (!Array.isArray(input.atoms)) error('STRUCTURE_ATOMS', 'Structure atoms must be an array.')
  if (!Array.isArray(input.bonds)) error('STRUCTURE_BONDS', 'Structure bonds must be an array.')
  if (input.title !== undefined && typeof input.title !== 'string')
    error('STRUCTURE_TITLE', 'Structure title must be a string.')
  if (input.metadata !== undefined && !record(input.metadata))
    error('STRUCTURE_METADATA', 'Structure metadata must be a JSON object.')
  if (
    input.stereoAbsolute !== undefined &&
    (input.kind !== 'molecular' || typeof input.stereoAbsolute !== 'boolean')
  )
    error('MOLECULE_STEREO_FLAG', 'Absolute stereochemistry requires a molecular boolean flag.')
  if (diagnostics.length) return diagnostics

  const snapshot = input as unknown as StructureSnapshot
  const validateProvenance = (entry: unknown, context: DiagnosticContext) => {
    if (
      entry !== undefined &&
      (!record(entry) ||
        !validId(entry.source) ||
        (entry.version !== undefined && typeof entry.version !== 'string') ||
        (entry.reference !== undefined && typeof entry.reference !== 'string'))
    )
      error(
        'PROVENANCE_INPUT',
        'Provenance requires a nonempty source and optional string version/reference.',
        context
      )
  }
  let operations: readonly SymmetryOperation[] | undefined
  if (snapshot.kind === 'periodic') {
    const cellDiagnostics = validateCell(snapshot.cell)
    diagnostics.push(...cellDiagnostics)
    if (!cellDiagnostics.length) {
      const resolved = resolveSymmetry(snapshot.symmetry, snapshot.cell)
      if (resolved.ok) {
        operations = resolved.value
        diagnostics.push(...resolved.diagnostics)
      } else {
        diagnostics.push(
          ...resolved.diagnostics.map((item): Diagnostic =>
            item.code === 'SYMMETRY_AMBIGUOUS' || item.code === 'SYMMETRY_UNRESOLVED'
              ? { ...item, severity: 'warning' }
              : item
          )
        )
      }
    }
  } else if ('cell' in input || 'symmetry' in input) {
    error(
      'MOLECULE_PERIODIC_FIELDS',
      'A molecular structure cannot carry a cell or symmetry information.'
    )
  }

  function scientificValue(
    value: unknown,
    field: string,
    atomId: string,
    minimum?: number,
    maximum?: number
  ) {
    if (value === undefined) return
    if (!record(value) || !['known', 'unknown', 'not-applicable'].includes(String(value.kind))) {
      error(
        'SCIENTIFIC_VALUE',
        'Scientific values require an explicit known/unknown/not-applicable state.',
        { atomId, field }
      )
      return
    }
    if (value.kind !== 'known') {
      if ('value' in value || 'standardUncertainty' in value)
        error('SCIENTIFIC_VALUE', 'Unknown values cannot carry a numerical value or uncertainty.', {
          atomId,
          field
        })
      return
    }
    if (
      typeof value.value !== 'number' ||
      !Number.isFinite(value.value) ||
      (minimum !== undefined && value.value < minimum) ||
      (maximum !== undefined && value.value > maximum)
    ) {
      error('SCIENTIFIC_VALUE_RANGE', 'Scientific value is non-finite or out of range.', {
        atomId,
        field
      })
    }
    if (
      value.standardUncertainty !== undefined &&
      (typeof value.standardUncertainty !== 'number' ||
        !Number.isFinite(value.standardUncertainty) ||
        value.standardUncertainty < 0)
    )
      error('SCIENTIFIC_UNCERTAINTY', 'Standard uncertainty must be finite and nonnegative.', {
        atomId,
        field
      })
    if (value.literal !== undefined && typeof value.literal !== 'string')
      error('SCIENTIFIC_LITERAL', 'A scientific literal must be a string.', { atomId, field })
    validateProvenance(value.provenance, { atomId, field })
  }

  const atomIds = new Set<string>()
  for (const item of input.atoms as unknown[]) {
    if (!record(item)) {
      error('ATOM_INPUT', 'Atom must be an object.')
      continue
    }
    if (!validId(item.id)) {
      error('ATOM_ID', 'Atom ID must be a nonempty string.')
      continue
    }
    const atomId = item.id
    validateProvenance(item.provenance, { atomId })
    if (atomIds.has(atomId)) error('ATOM_ID_DUPLICATE', 'Atom IDs must be unique.', { atomId })
    atomIds.add(atomId)
    if (typeof item.element !== 'string' || !getElement(item.element))
      error('ATOM_ELEMENT', 'Unknown element symbol.', { atomId })
    if (item.label !== undefined && typeof item.label !== 'string')
      error('ATOM_LABEL', 'Atom label must be a string.', { atomId })
    const field = snapshot.kind === 'periodic' ? 'fractional' : 'cartesian'
    const otherField = snapshot.kind === 'periodic' ? 'cartesian' : 'fractional'
    if (!isFiniteVector(item[field]) || otherField in item)
      error(
        'ATOM_COORDINATE',
        'Atom requires exactly the coordinate frame declared by its structure.',
        { atomId, field }
      )
    scientificValue(item.occupancy, 'occupancy', atomId, 0, 1)
    scientificValue(item.displacementU, 'displacementU', atomId, 0)
    scientificValue(item.oxidationState, 'oxidationState', atomId)
    for (const property of ['isotope', 'formalCharge', 'atomMap'] as const) {
      const value = item[property]
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) ||
          (property === 'isotope' && (value as number) <= 0) ||
          (property === 'atomMap' && (value as number) < 0))
      )
        error('ATOM_PROPERTY', 'Invalid integer chemical property.', { atomId, field: property })
    }
    if (
      item.radical !== undefined &&
      !['singlet', 'doublet', 'triplet'].includes(String(item.radical))
    )
      error('ATOM_RADICAL', 'Unsupported radical state.', { atomId })
    if (item.metadata !== undefined && !record(item.metadata))
      error('ATOM_METADATA', 'Atom metadata must be a JSON object.', { atomId })
    if (item.coordinateUncertainties !== undefined) {
      const measurement = item.coordinateUncertainties
      if (
        !record(measurement) ||
        !['fractional', 'cartesian'].includes(String(measurement.frame)) ||
        !isFiniteVector(measurement.standardUncertainties) ||
        measurement.standardUncertainties.some((value) => value < 0) ||
        (measurement.literals !== undefined &&
          (!Array.isArray(measurement.literals) ||
            measurement.literals.length !== 3 ||
            measurement.literals.some((value) => typeof value !== 'string')))
      )
        error('COORDINATE_UNCERTAINTY', 'Invalid coordinate measurement information.', { atomId })
    }
  }

  const bondIds = new Set<string>()
  const endpointResolver = diagnostics.some((entry) => entry.severity === 'error')
    ? undefined
    : createEndpointResolver(snapshot, operations)
  for (const item of input.bonds as unknown[]) {
    if (!record(item)) {
      error('BOND_INPUT', 'Bond must be an object.')
      continue
    }
    if (!validId(item.id)) {
      error('BOND_ID', 'Bond ID must be a nonempty string.')
      continue
    }
    const bondId = item.id
    validateProvenance(item.provenance, { bondId })
    if (bondIds.has(bondId)) error('BOND_ID_DUPLICATE', 'Bond IDs must be unique.', { bondId })
    bondIds.add(bondId)
    if (!['single', 'double', 'triple', 'aromatic'].includes(String(item.order)))
      error('BOND_ORDER', 'Unsupported bond order.', { bondId })
    if (
      item.stereo !== undefined &&
      !['up', 'down', 'either', 'cis', 'trans'].includes(String(item.stereo))
    )
      error('BOND_STEREO', 'Unsupported bond stereo property.', { bondId })
    if (item.metadata !== undefined && !record(item.metadata))
      error('BOND_METADATA', 'Bond metadata must be a JSON object.', { bondId })
    if (!Array.isArray(item.endpoints) || item.endpoints.length !== 2) {
      error('BOND_ENDPOINTS', 'Bond must have two endpoints.', { bondId })
      continue
    }
    let endpointsValid = true
    for (const endpoint of item.endpoints as unknown[]) {
      if (
        !record(endpoint) ||
        !validId(endpoint.sourceAtomId) ||
        !validId(endpoint.symmetryOperationId) ||
        !isIntegerVector(endpoint.integerCellOffset)
      ) {
        error(
          'BOND_ENDPOINT',
          'Bond endpoint requires source ID, operation ID and integer cell offset.',
          { bondId }
        )
        endpointsValid = false
        continue
      }
      if (!atomIds.has(endpoint.sourceAtomId)) {
        error('BOND_DANGLING', 'Bond references a missing source atom.', {
          bondId,
          atomId: endpoint.sourceAtomId
        })
        endpointsValid = false
      }
      if (snapshot.kind === 'molecular') {
        if (
          endpoint.symmetryOperationId !== 'identity' ||
          endpoint.integerCellOffset.some((value) => value !== 0)
        ) {
          error('BOND_PERIODIC_ENDPOINT', 'Molecular endpoints require identity and zero offset.', {
            bondId
          })
          endpointsValid = false
        }
      } else if (!operations?.some((operation) => operation.id === endpoint.symmetryOperationId)) {
        error('BOND_OPERATION', 'Bond references an unresolved symmetry operation.', {
          bondId,
          operationId: endpoint.symmetryOperationId
        })
        endpointsValid = false
      }
    }
    if (endpointsValid && !diagnostics.some((entry) => entry.severity === 'error')) {
      const [a, b] = item.endpoints as unknown as readonly [BondEndpoint, BondEndpoint]
      const same = endpointResolver!.same(a, b)
      if (!same.ok) diagnostics.push(...same.diagnostics)
      else if (same.value)
        error('BOND_SELF', 'Both endpoints resolve to the same physical source instance.', {
          bondId
        })
    }
  }
  // Parity refers to stable bonded neighbours, rather than mutable file numbering.
  for (const item of input.atoms as unknown[]) {
    if (!record(item) || item.stereoParity === undefined) continue
    const atomId = String(item.id)
    const stereo = item.stereoParity
    if (
      snapshot.kind !== 'molecular' ||
      !record(stereo) ||
      !['odd', 'even', 'either'].includes(String(stereo.parity)) ||
      !Array.isArray(stereo.referenceAtoms) ||
      stereo.referenceAtoms.length !== 4
    ) {
      error(
        'ATOM_STEREO_PARITY',
        'Tetrahedral parity requires four molecular neighbour references.',
        { atomId }
      )
      continue
    }
    const refs = stereo.referenceAtoms as unknown[]
    const explicit = refs.filter((id) => id !== null)
    const neighbours = new Set<string>()
    for (const bond of input.bonds as unknown[]) {
      if (!record(bond) || !Array.isArray(bond.endpoints) || bond.endpoints.length !== 2) continue
      const [a, b] = bond.endpoints
      if (!record(a) || !record(b)) continue
      if (a.sourceAtomId === atomId && typeof b.sourceAtomId === 'string')
        neighbours.add(b.sourceAtomId)
      if (b.sourceAtomId === atomId && typeof a.sourceAtomId === 'string')
        neighbours.add(a.sourceAtomId)
    }
    if (
      refs.filter((id) => id === null).length > 1 ||
      new Set(explicit).size !== explicit.length ||
      explicit.length !== neighbours.size ||
      explicit.some(
        (id) => !validId(id) || id === atomId || !atomIds.has(id) || !neighbours.has(id)
      )
    )
      error(
        'ATOM_STEREO_REFERENCE',
        'Parity references must match distinct bonded neighbours and at most one implicit H.',
        { atomId }
      )
  }
  return diagnostics
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export function createStructureSnapshot(
  input: StructureSnapshot
): ScientificResult<StructureSnapshot> {
  const diagnostics = [...validateStructure(input)]
  if (diagnostics.some((item) => item.severity === 'error')) return failureFrom(diagnostics)
  const snapshot = JSON.parse(JSON.stringify(input)) as StructureSnapshot
  for (const atom of snapshot.atoms) {
    if (atom.occupancy === undefined) {
      Object.assign(atom, {
        occupancy: {
          kind: 'known',
          value: 1,
          provenance: { source: 'alchemion-default', version: 'M3' }
        }
      })
      diagnostics.push({
        severity: 'info',
        code: 'OCCUPANCY_DEFAULT',
        message: 'Missing occupancy defaults to one.',
        context: { atomId: atom.id }
      })
    }
  }
  return success(freeze(snapshot), diagnostics)
}
