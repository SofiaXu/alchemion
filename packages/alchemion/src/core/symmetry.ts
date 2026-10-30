import { SPACE_GROUP_SETTINGS } from './data'
import { validateCell } from './cell'
import {
  add,
  determinant,
  IDENTITY_MATRIX,
  isFiniteVector,
  isIntegerVector,
  multiplyMatrices,
  multiplyMatrixVector,
  norm,
  subtract,
  transpose
} from './math'
import { failure, failureFrom, success } from './result'
import type {
  BondEndpoint,
  Cell,
  Diagnostic,
  Matrix3,
  MolecularAtom,
  PeriodicAtom,
  Rational,
  ScientificResult,
  SpaceGroupIdentifier,
  StructureSnapshot,
  SymmetryInformation,
  SymmetryOperation,
  Vec3
} from './types'

export const SPECIAL_POSITION_TOLERANCE = 1e-6
export const IDENTITY_OPERATION: SymmetryOperation = {
  id: 'identity',
  rotation: IDENTITY_MATRIX,
  translation: [
    { numerator: 0, denominator: 1 },
    { numerator: 0, denominator: 1 },
    { numerator: 0, denominator: 1 }
  ]
}

const gcd = (a: number, b: number): number => {
  while (b) [a, b] = [b, a % b]
  return Math.abs(a)
}
function rational(numerator: number, denominator: number): Rational | undefined {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0)
    return undefined
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}
function plus(a: Rational, b: Rational): Rational | undefined {
  return rational(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator
  )
}
function constant(text: string): Rational | undefined {
  if (/^[+-]?\d+(?:\/\d+)?$/.test(text)) {
    const [n, d = '1'] = text.split('/')
    return rational(Number(n), Number(d))
  }
  if (/^[+-]?\d*\.\d+$/.test(text)) {
    const digits = text.split('.')[1].length
    return rational(Number(text.replace('.', '')), 10 ** digits)
  }
  return undefined
}

/** Parse only signed affine sums of x/y/z, integer coefficients and rational constants. */
export function parseSymmetryOperation(
  text: string,
  id: string
): ScientificResult<SymmetryOperation> {
  if (typeof text !== 'string' || typeof id !== 'string' || !id.trim())
    return failure('SYMMETRY_SYNTAX', 'A symmetry operation requires text and a nonempty ID.')
  const expressions = text.toLowerCase().replace(/\s+/g, '').split(',')
  if (expressions.length !== 3)
    return failure('SYMMETRY_SYNTAX', 'A symmetry operation requires three affine expressions.')
  const rows: number[][] = []
  const translations: Rational[] = []
  for (const expression of expressions) {
    const terms = expression.match(/[+-]?[^+-]+/g)
    if (!terms || terms.join('') !== expression)
      return failure('SYMMETRY_SYNTAX', 'Invalid affine expression.')
    const row = [0, 0, 0]
    let translation: Rational = { numerator: 0, denominator: 1 }
    for (const term of terms) {
      const variable = /^([+-]?)(?:(\d+)\*?)?([xyz])$/.exec(term)
      if (variable) {
        const coefficient = (variable[1] === '-' ? -1 : 1) * Number(variable[2] ?? 1)
        row['xyz'.indexOf(variable[3])] += coefficient
        if (!row.every(Number.isSafeInteger))
          return failure('SYMMETRY_SYNTAX', 'Rotation coefficients exceed exact integer range.')
      } else {
        const parsed = constant(term)
        const sum = parsed && plus(translation, parsed)
        if (!sum)
          return failure(
            'SYMMETRY_SYNTAX',
            'Only affine variables and exact rational translations are supported.'
          )
        translation = sum
      }
    }
    rows.push(row)
    translations.push(translation)
  }
  const rotation = transpose(rows as unknown as Matrix3)
  if (Math.abs(determinant(rotation)) !== 1)
    return failure(
      'SYMMETRY_ROTATION',
      'Symmetry rotation must be an invertible integer lattice matrix with determinant ±1.'
    )
  return success({
    id,
    rotation,
    translation: translations as unknown as SymmetryOperation['translation']
  })
}

export function validateSymmetryOperations(
  operations: readonly SymmetryOperation[],
  cell: Cell
): readonly Diagnostic[] {
  const errors = validateCell(cell)
  if (errors.length) return errors
  if (!Array.isArray(operations) || operations.length === 0)
    return [
      {
        severity: 'error',
        code: 'SYMMETRY_OPERATIONS',
        message: 'At least one symmetry operation is required.'
      }
    ]
  const diagnostics: Diagnostic[] = []
  const ids = new Set<string>()
  const metric = multiplyMatrices(transpose(cell.basis), cell.basis)
  const metricScale = Math.max(...metric.flat().map(Math.abs))
  for (const operation of operations) {
    if (
      !operation ||
      typeof operation.id !== 'string' ||
      !operation.id.trim() ||
      ids.has(operation.id)
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'SYMMETRY_ID',
        message: 'Symmetry operation IDs must be nonempty and unique.'
      })
      continue
    }
    ids.add(operation.id)
    const matrix = operation.rotation
    if (
      !Array.isArray(matrix) ||
      matrix.length !== 3 ||
      !matrix.every(isIntegerVector) ||
      Math.abs(determinant([matrix[0], matrix[1], matrix[2]])) !== 1
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'SYMMETRY_ROTATION',
        message: 'Invalid integer symmetry rotation.',
        context: { operationId: operation.id }
      })
      continue
    }
    if (
      !Array.isArray(operation.translation) ||
      operation.translation.length !== 3 ||
      operation.translation.some(
        (entry: Rational) =>
          !entry ||
          !Number.isSafeInteger(entry.numerator) ||
          !Number.isSafeInteger(entry.denominator) ||
          entry.denominator <= 0
      )
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'SYMMETRY_TRANSLATION',
        message: 'Symmetry translation must contain three exact rational values.',
        context: { operationId: operation.id }
      })
      continue
    }
    const rotation: Matrix3 = [matrix[0], matrix[1], matrix[2]]
    const transformed = multiplyMatrices(transpose(rotation), multiplyMatrices(metric, rotation))
    const residual =
      Math.max(
        ...transformed.flat().map((value, index) => Math.abs(value - metric.flat()[index]))
      ) / metricScale
    if (residual > 1e-6)
      diagnostics.push({
        severity: 'error',
        code: 'SYMMETRY_METRIC',
        message: 'Symmetry rotation is inconsistent with the cell metric.',
        context: { operationId: operation.id, residual }
      })
  }
  return diagnostics
}

const normalizedName = (text: string): string => text.replace(/[\s_]/g, '').toLowerCase()
function settingMatches(
  setting: (typeof SPACE_GROUP_SETTINGS)[number],
  identifier: SpaceGroupIdentifier
): boolean {
  return (
    (identifier.itNumber === undefined || setting.itNumber === identifier.itNumber) &&
    (identifier.hallNumber === undefined || setting.hallNumber === identifier.hallNumber) &&
    (identifier.hallSymbol === undefined ||
      normalizedName(setting.hallSymbol) === normalizedName(identifier.hallSymbol)) &&
    (identifier.hermannMauguin === undefined ||
      [setting.hermannMauguin, setting.hermannMauguinFull].some(
        (name) => normalizedName(name) === normalizedName(identifier.hermannMauguin!)
      )) &&
    (identifier.choice === undefined || setting.choice === identifier.choice)
  )
}
function operationSignature(operation: SymmetryOperation): string {
  return JSON.stringify([
    operation.rotation,
    operation.translation.map(({ numerator, denominator }) => {
      const reduced = ((numerator % denominator) + denominator) % denominator
      return rational(reduced, denominator)
    })
  ])
}
function sameOperations(a: readonly SymmetryOperation[], b: readonly SymmetryOperation[]): boolean {
  const sa = new Set(a.map(operationSignature)),
    sb = new Set(b.map(operationSignature))
  return sa.size === sb.size && [...sa].every((entry) => sb.has(entry))
}

/** Explicit operations are authoritative; identifiers never silently select an ambiguous setting. */
export function resolveSymmetry(
  information: SymmetryInformation | undefined,
  cell: Cell
): ScientificResult<readonly SymmetryOperation[]> {
  const cellErrors = validateCell(cell)
  if (cellErrors.length) return failureFrom(cellErrors)
  if (
    information !== undefined &&
    (information === null || typeof information !== 'object' || Array.isArray(information))
  )
    return failure('SYMMETRY_INFORMATION', 'Symmetry information must be an object.')
  const identifier = information?.spaceGroup
  if (identifier !== undefined) {
    if (identifier === null || typeof identifier !== 'object' || Array.isArray(identifier))
      return failure('SYMMETRY_IDENTIFIER', 'Space-group identifiers must be an object.')
    if (
      (identifier.itNumber !== undefined &&
        (!Number.isSafeInteger(identifier.itNumber) ||
          identifier.itNumber < 1 ||
          identifier.itNumber > 230)) ||
      (identifier.hallNumber !== undefined &&
        (!Number.isSafeInteger(identifier.hallNumber) ||
          identifier.hallNumber < 1 ||
          identifier.hallNumber > 530))
    )
      return failure(
        'SYMMETRY_IDENTIFIER',
        'IT and Hall identifiers must be integers in the supported range.'
      )
    for (const field of ['hallSymbol', 'hermannMauguin', 'choice'] as const) {
      const value = identifier[field]
      if (
        value !== undefined &&
        (typeof value !== 'string' || (field !== 'choice' && !value.trim()))
      )
        return failure(
          'SYMMETRY_IDENTIFIER',
          'Space-group names and setting choices must be strings.',
          { field }
        )
    }
  }
  const hasIdentifier = identifier && Object.values(identifier).some((value) => value !== undefined)
  const matches = hasIdentifier
    ? SPACE_GROUP_SETTINGS.filter((entry) => settingMatches(entry, identifier))
    : []
  if (information?.operations !== undefined) {
    const errors = validateSymmetryOperations(information.operations, cell)
    if (errors.length) return failureFrom(errors)
    const diagnostics: Diagnostic[] = []
    if (
      hasIdentifier &&
      !matches.some((entry) => sameOperations(entry.operations, information.operations!))
    ) {
      diagnostics.push({
        severity: 'warning',
        code: 'SYMMETRY_IDENTIFIER_CONFLICT',
        message:
          'Explicit operations differ from the supplied space-group identifiers; the explicit operations are used.'
      })
    }
    return success(
      JSON.parse(
        JSON.stringify(
          [...information.operations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        )
      ) as SymmetryOperation[],
      diagnostics
    )
  }
  if (hasIdentifier) {
    if (matches.length === 0)
      return failure(
        'SYMMETRY_UNRESOLVED',
        'No verified setting matches the space-group identifiers.'
      )
    if (matches.length > 1)
      return failure('SYMMETRY_AMBIGUOUS', 'Space-group identifiers require an explicit setting.', {
        hallNumbers: matches.map((entry) => entry.hallNumber)
      })
    const operations = matches[0].operations
    const errors = validateSymmetryOperations(operations, cell)
    if (errors.length) return failureFrom(errors)
    return success(JSON.parse(JSON.stringify(operations)) as SymmetryOperation[])
  }
  return success(
    [JSON.parse(JSON.stringify(IDENTITY_OPERATION)) as SymmetryOperation],
    [
      {
        severity: 'warning',
        code: 'SYMMETRY_IDENTITY_ASSUMED',
        message: 'No symmetry information was supplied; only the identity operation is used.'
      }
    ]
  )
}

export const translationVector = (operation: SymmetryOperation): Vec3 =>
  operation.translation.map((entry) => entry.numerator / entry.denominator) as unknown as Vec3
export const applySymmetry = (operation: SymmetryOperation, fractional: Vec3): Vec3 =>
  add(multiplyMatrixVector(operation.rotation, fractional), translationVector(operation))
export const endpointKey = (endpoint: BondEndpoint): string =>
  JSON.stringify([
    endpoint.sourceAtomId,
    endpoint.symmetryOperationId,
    ...endpoint.integerCellOffset
  ])

export interface EndpointPosition {
  readonly fractional?: Vec3
  readonly cartesian: Vec3
}
type AtomLookup = ReadonlyMap<string, PeriodicAtom | MolecularAtom>

export function resolveBondEndpoint(
  snapshot: StructureSnapshot,
  endpoint: BondEndpoint,
  operations?: readonly SymmetryOperation[]
): ScientificResult<EndpointPosition> {
  return resolveEndpoint(snapshot, endpoint, operations)
}

function resolveEndpoint(
  snapshot: StructureSnapshot,
  endpoint: BondEndpoint,
  operations?: readonly SymmetryOperation[],
  atoms?: AtomLookup
): ScientificResult<EndpointPosition> {
  if (!endpoint || !isIntegerVector(endpoint.integerCellOffset))
    return failure('BOND_ENDPOINT', 'Bond endpoint requires an integer cell offset.')
  if (snapshot.kind === 'molecular') {
    const atom = (
      atoms
        ? atoms.get(endpoint.sourceAtomId)
        : snapshot.atoms.find((entry) => entry.id === endpoint.sourceAtomId)
    ) as MolecularAtom | undefined
    if (!atom) return failure('BOND_ATOM', 'Bond endpoint references a missing source atom.')
    if (
      endpoint.symmetryOperationId !== 'identity' ||
      endpoint.integerCellOffset.some((value) => value !== 0)
    )
      return failure(
        'BOND_MOLECULAR_ENDPOINT',
        'Molecular endpoints require identity and zero translation.'
      )
    if (!isFiniteVector(atom.cartesian))
      return failure('COORDINATE_NONFINITE', 'Molecular atom coordinates must be finite.')
    return success({ cartesian: [...atom.cartesian] as unknown as Vec3 })
  }
  const atom = (
    atoms
      ? atoms.get(endpoint.sourceAtomId)
      : snapshot.atoms.find((entry) => entry.id === endpoint.sourceAtomId)
  ) as PeriodicAtom | undefined
  if (!atom) return failure('BOND_ATOM', 'Bond endpoint references a missing source atom.')
  const resolved = operations
    ? success(operations)
    : resolveSymmetry(snapshot.symmetry, snapshot.cell)
  if (!resolved.ok) return resolved
  const operation = resolved.value.find((entry) => entry.id === endpoint.symmetryOperationId)
  if (!operation)
    return failure('BOND_OPERATION', 'Bond endpoint references a missing symmetry operation.', {
      operationId: endpoint.symmetryOperationId
    })
  if (!isFiniteVector(atom.fractional))
    return failure('COORDINATE_NONFINITE', 'Periodic atom coordinates must be finite.')
  const fractional = add(applySymmetry(operation, atom.fractional), endpoint.integerCellOffset)
  const cartesian = multiplyMatrixVector(snapshot.cell.basis, fractional)
  if (!isFiniteVector(fractional) || !isFiniteVector(cartesian))
    return failure('COORDINATE_OVERFLOW', 'Endpoint coordinates exceed finite numerical range.')
  return success({ fractional, cartesian })
}

export function isSamePhysicalEndpoint(
  snapshot: StructureSnapshot,
  a: BondEndpoint,
  b: BondEndpoint,
  operations?: readonly SymmetryOperation[]
): ScientificResult<boolean> {
  return samePhysicalEndpoint(snapshot, a, b, operations)
}

function samePhysicalEndpoint(
  snapshot: StructureSnapshot,
  a: BondEndpoint,
  b: BondEndpoint,
  operations?: readonly SymmetryOperation[],
  atoms?: AtomLookup
): ScientificResult<boolean> {
  const pa = resolveEndpoint(snapshot, a, operations, atoms),
    pb = resolveEndpoint(snapshot, b, operations, atoms)
  if (!pa.ok) return pa
  if (!pb.ok) return pb
  if (a.sourceAtomId !== b.sourceAtomId) return success(false)
  const delta = subtract(
    pa.value.fractional ?? pa.value.cartesian,
    pb.value.fractional ?? pb.value.cartesian
  )
  return success(
    delta.every(
      (value) =>
        Math.abs(value) <= (snapshot.kind === 'periodic' ? SPECIAL_POSITION_TOLERANCE : 1e-9)
    )
  )
}

/** Resolve special-position aliases to a deterministic operation and offset. */
export function canonicalizeEndpoint(
  snapshot: StructureSnapshot,
  endpoint: BondEndpoint,
  operations?: readonly SymmetryOperation[]
): ScientificResult<BondEndpoint> {
  return canonicalEndpoint(snapshot, endpoint, operations)
}

function canonicalEndpoint(
  snapshot: StructureSnapshot,
  endpoint: BondEndpoint,
  operations?: readonly SymmetryOperation[],
  atoms?: AtomLookup
): ScientificResult<BondEndpoint> {
  const position = resolveEndpoint(snapshot, endpoint, operations, atoms)
  if (!position.ok) return position
  if (snapshot.kind === 'molecular') return success({ ...endpoint, integerCellOffset: [0, 0, 0] })
  const resolved = operations
    ? success(operations)
    : resolveSymmetry(snapshot.symmetry, snapshot.cell)
  if (!resolved.ok) return resolved
  return endpointAtPosition(
    snapshot,
    endpoint.sourceAtomId,
    position.value.fractional!,
    resolved.value,
    atoms
  )
}

function endpointAtPosition(
  snapshot: Extract<StructureSnapshot, { kind: 'periodic' }>,
  sourceAtomId: string,
  position: Vec3,
  operations: readonly SymmetryOperation[],
  atoms?: AtomLookup
): ScientificResult<BondEndpoint> {
  const atom = (
    atoms ? atoms.get(sourceAtomId) : snapshot.atoms.find((entry) => entry.id === sourceAtomId)
  ) as PeriodicAtom
  const aliases: BondEndpoint[] = []
  for (const operation of operations) {
    const difference = subtract(position, applySymmetry(operation, atom.fractional))
    const offset = difference.map((value) => Math.round(value)) as unknown as Vec3
    if (
      isIntegerVector(offset) &&
      difference.every(
        (value, index) => Math.abs(value - offset[index]) <= SPECIAL_POSITION_TOLERANCE
      )
    )
      aliases.push({ sourceAtomId, symmetryOperationId: operation.id, integerCellOffset: offset })
  }
  aliases.sort((a, b) =>
    endpointKey(a) < endpointKey(b) ? -1 : endpointKey(a) > endpointKey(b) ? 1 : 0
  )
  return aliases.length
    ? success(aliases[0])
    : failure('BOND_ENDPOINT', 'Endpoint has no resolvable symmetry source.')
}

export function transformBondEndpoint(
  snapshot: StructureSnapshot,
  endpoint: BondEndpoint,
  operation: SymmetryOperation,
  operations: readonly SymmetryOperation[]
): ScientificResult<BondEndpoint> {
  return transformedEndpoint(snapshot, endpoint, operation, operations)
}

function transformedEndpoint(
  snapshot: StructureSnapshot,
  endpoint: BondEndpoint,
  operation: SymmetryOperation,
  operations: readonly SymmetryOperation[],
  atoms?: AtomLookup
): ScientificResult<BondEndpoint> {
  if (snapshot.kind === 'molecular') return canonicalEndpoint(snapshot, endpoint, operations, atoms)
  const position = resolveEndpoint(snapshot, endpoint, operations, atoms)
  if (!position.ok) return position
  return endpointAtPosition(
    snapshot,
    endpoint.sourceAtomId,
    applySymmetry(operation, position.value.fractional!),
    operations,
    atoms
  )
}

/** A request-local index. It is never cached or reused after a source transaction. */
export function createEndpointResolver(
  snapshot: StructureSnapshot,
  operations?: readonly SymmetryOperation[]
) {
  const atoms: AtomLookup = new Map(snapshot.atoms.map((atom) => [atom.id, atom]))
  return {
    resolve: (endpoint: BondEndpoint) => resolveEndpoint(snapshot, endpoint, operations, atoms),
    same: (a: BondEndpoint, b: BondEndpoint) =>
      samePhysicalEndpoint(snapshot, a, b, operations, atoms),
    canonicalize: (endpoint: BondEndpoint) =>
      canonicalEndpoint(snapshot, endpoint, operations, atoms),
    transform: (endpoint: BondEndpoint, operation: SymmetryOperation) =>
      transformedEndpoint(snapshot, endpoint, operation, operations ?? [], atoms)
  }
}

/** Fractional reach implied by a Cartesian radius, including oblique/multicell neighbors. */
export function fractionalReach(inverseBasis: Matrix3, distance: number): Vec3 {
  return transpose(inverseBasis).map((row) => norm(row) * distance) as unknown as Vec3
}
