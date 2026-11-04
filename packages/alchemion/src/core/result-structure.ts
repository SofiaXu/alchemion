import { CALCULATION_LIMITS, type ResultFrame, type VibrationMode } from './calculation'
import { cellParameters, cellVolume, validateCell } from './cell'
import { periodicDistance, type DistanceBudget } from './construction-periodic'
import {
  add,
  cross,
  determinant,
  dot,
  invertMatrix,
  isFiniteVector,
  isIntegerVector,
  multiplyMatrices,
  multiplyMatrixVector,
  norm,
  scale,
  subtract,
  transpose
} from './math'
import { reciprocalLattice } from './reciprocal'
import { failure, success } from './result'
import { createStructureSnapshot } from './structure'
import type {
  AtomId,
  Cell,
  CellParameters,
  Diagnostic,
  Matrix3,
  MolecularAtom,
  PeriodicAtom,
  ScientificResult,
  StructureSnapshot,
  Vec3
} from './types'

const ROUNDING = 64 * Number.EPSILON
const IMAGE_CHECKS = 250_000
const GEOMETRY_CHECKS = 5_000_000
const ZERO: Vec3 = [0, 0, 0]

export interface ResultImage {
  /** Translation to add to the target fractional coordinates. */
  readonly image: Vec3
  readonly displacement: Vec3
  readonly ambiguous: boolean
}

function nearestImage(
  basis: Matrix3,
  inverse: Matrix3,
  delta: Vec3,
  budget: DistanceBudget
): ResultImage | undefined {
  const initial = delta.map(Math.round) as unknown as Vec3
  if (!isIntegerVector(initial)) return undefined
  const upper = norm(multiplyMatrixVector(basis, subtract(delta, initial)))
  const candidate: { offset?: Vec3; ambiguous?: boolean } = {}
  const distance = periodicDistance(delta, basis, inverse, upper, budget, false, candidate)
  if (distance === undefined || !candidate.offset) return undefined
  const displacement = multiplyMatrixVector(basis, subtract(delta, candidate.offset))
  const image = candidate.offset.map((offset) => (offset === 0 ? 0 : -offset)) as unknown as Vec3
  return { image, displacement, ambiguous: candidate.ambiguous === true }
}

/** Closest periodic representative under the full lattice metric, with bounded candidate work. */
export function closestResultImage(basis: Matrix3, delta: Vec3): ScientificResult<ResultImage> {
  const inverse =
    Array.isArray(basis) && basis.length === 3 && basis.every(isFiniteVector)
      ? invertMatrix(basis)
      : undefined
  if (!inverse || !isFiniteVector(delta))
    return failure(
      'RESULT_IMAGE',
      'Provide a nondegenerate basis and finite fractional displacement.'
    )
  const result = nearestImage(basis, inverse, delta, { remaining: IMAGE_CHECKS })
  return result
    ? success(result)
    : failure(
        'RESULT_IMAGE_BUDGET',
        'The lattice image search exceeded its numerical or work bounds.'
      )
}

export function foldResultKPoint(cell: Cell, fractional: Vec3): ScientificResult<Vec3> {
  const lattice = reciprocalLattice(cell)
  if (!lattice.ok) return lattice
  const folded = closestResultImage(lattice.value.basis, fractional)
  return folded.ok ? success(folded.value.displacement) : folded
}

export interface ResultComparisonPair {
  readonly referenceId: AtomId
  readonly targetId: AtomId
}

export interface ResultComparisonOptions {
  readonly pairs?: readonly ResultComparisonPair[]
  readonly fit?: boolean
  readonly removeCellDeformation?: boolean
}

export interface ResultComparison {
  readonly rmsd: number
  readonly atoms: readonly (ResultComparisonPair & {
    readonly from: Vec3
    readonly to: Vec3
    readonly displacement: Vec3
    readonly image?: Vec3
  })[]
  readonly targetPositions: readonly { readonly id: AtomId; readonly position: Vec3 }[]
  readonly unmatchedReference: readonly AtomId[]
  readonly unmatchedTarget: readonly AtomId[]
  readonly cell?: {
    readonly reference: CellParameters
    readonly target: CellParameters
    readonly basisDelta: Matrix3
    readonly volumeDelta: number
  }
}

const center = (points: readonly Vec3[]): Vec3 =>
  points.reduce((sum, point) => add(sum, scale(point, 1 / points.length)), ZERO)

function spansPlane(points: readonly Vec3[]): boolean {
  const origin = points[0]
  const deltas = points.map((point) => subtract(point, origin))
  const longest = deltas.reduce((a, b) => (norm(a) >= norm(b) ? a : b))
  const length = norm(longest)
  return (
    length > 0 &&
    deltas.some((delta) => norm(cross(scale(longest, 1 / length), delta)) > ROUNDING * length)
  )
}

/** Largest eigenvector of a symmetric 4x4 matrix by Jacobi rotations. */
function principalQuaternion(input: number[][]): readonly [number, number, number, number] {
  const vectors: number[][] = Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => Number(i === j))
  )
  const tolerance = ROUNDING * Math.max(...input.flat().map(Math.abs))
  for (let step = 0; step < 64; step++) {
    let p = 0
    let q = 1
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        if (Math.abs(input[i][j]) > Math.abs(input[p][q])) [p, q] = [i, j]
    if (Math.abs(input[p][q]) <= tolerance) break
    const angle = Math.atan2(2 * input[p][q], input[q][q] - input[p][p]) / 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const a = input[p][p]
    const b = input[p][q]
    const d = input[q][q]
    input[p][p] = c * c * a - 2 * s * c * b + s * s * d
    input[q][q] = s * s * a + 2 * s * c * b + c * c * d
    input[p][q] = input[q][p] = 0
    for (let row = 0; row < 4; row++) {
      if (row !== p && row !== q) {
        const x = input[row][p]
        const y = input[row][q]
        input[row][p] = input[p][row] = c * x - s * y
        input[row][q] = input[q][row] = s * x + c * y
      }
      const x = vectors[row][p]
      const y = vectors[row][q]
      vectors[row][p] = c * x - s * y
      vectors[row][q] = s * x + c * y
    }
  }
  let largest = 0
  for (let i = 1; i < 4; i++) if (input[i][i] > input[largest][largest]) largest = i
  return [vectors[0][largest], vectors[1][largest], vectors[2][largest], vectors[3][largest]]
}

function fitMolecule(
  reference: readonly Vec3[],
  target: readonly Vec3[]
): ((point: Vec3) => Vec3) | undefined {
  if (reference.length < 3 || !spansPlane(reference) || !spansPlane(target)) return undefined
  const referenceCenter = center(reference)
  const targetCenter = center(target)
  const left = target.map((point) => subtract(point, targetCenter))
  const right = reference.map((point) => subtract(point, referenceCenter))
  const maxLength = (points: readonly Vec3[]) =>
    points.reduce((max, point) => Math.max(max, norm(point)), 0)
  const leftSize = maxLength(left)
  const rightSize = maxLength(right)
  // Normalize the inputs before accumulating products, then use Horn's quaternion
  // solution. A unit quaternion always gives a proper (non-reflecting) rotation.
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0])
  for (let index = 0; index < left.length; index++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        covariance[i][j] += (left[index][i] / leftSize) * (right[index][j] / rightSize)
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = covariance
  const [w, x, y, z] = principalQuaternion([
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, xz + zx],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, xz + zx, yz + zy, -xx - yy + zz]
  ])
  const vector: Vec3 = [x, y, z]
  return (point) => {
    const relative = subtract(point, targetCenter)
    const twist = scale(cross(vector, relative), 2)
    return add(referenceCenter, add(relative, add(scale(twist, w), cross(vector, twist))))
  }
}

const ambiguityWarning = (context: Diagnostic['context']): Diagnostic => ({
  severity: 'warning',
  code: 'RESULT_IMAGE_AMBIGUOUS',
  message: 'Several periodic images are equally near. A deterministic nearest image is shown.',
  context
})

/** IDs or explicit one-to-one pairs establish correspondence. Element counts alone never do. */
export function compareResultStructures(
  reference: StructureSnapshot,
  target: StructureSnapshot,
  options: ResultComparisonOptions = {}
): ScientificResult<ResultComparison> {
  if (reference.kind !== target.kind)
    return failure(
      'RESULT_COMPARISON_KIND',
      'Comparison requires structures of the same periodicity.'
    )
  if (options.fit && reference.kind === 'periodic')
    return failure('RESULT_COMPARISON_FIT', 'Rigid fitting is defined for molecular coordinates.')
  const references = new Map<AtomId, MolecularAtom | PeriodicAtom>(
    reference.atoms.map((atom) => [atom.id, atom])
  )
  const targets = new Map<AtomId, MolecularAtom | PeriodicAtom>(
    target.atoms.map((atom) => [atom.id, atom])
  )
  const pairs =
    options.pairs ??
    reference.atoms.flatMap((atom) =>
      targets.get(atom.id)?.element === atom.element
        ? [{ referenceId: atom.id, targetId: atom.id }]
        : []
    )
  const usedReferences = new Set<AtomId>()
  const usedTargets = new Set<AtomId>()
  for (const pair of pairs) {
    const from = references.get(pair.referenceId)
    const to = targets.get(pair.targetId)
    if (
      !from ||
      !to ||
      from.element !== to.element ||
      usedReferences.has(from.id) ||
      usedTargets.has(to.id)
    )
      return failure(
        'RESULT_COMPARISON_MAPPING',
        'Pairs must identify distinct atoms of matching elements.',
        { ...pair }
      )
    usedReferences.add(from.id)
    usedTargets.add(to.id)
  }
  const unmatchedReference = reference.atoms
    .filter((atom) => !usedReferences.has(atom.id))
    .map((atom) => atom.id)
  const unmatchedTarget = target.atoms
    .filter((atom) => !usedTargets.has(atom.id))
    .map((atom) => atom.id)
  if (!pairs.length)
    return failure('RESULT_COMPARISON_EMPTY', 'Choose at least one matching atom pair.')
  const atoms: ResultComparison['atoms'][number][] = []
  let cell: ResultComparison['cell']
  let targetPositions: ResultComparison['targetPositions']
  const diagnostics: Diagnostic[] = []
  if (reference.kind === 'periodic' && target.kind === 'periodic') {
    const referenceParameters = cellParameters(reference.cell)
    const targetParameters = cellParameters(target.cell)
    const referenceVolume = cellVolume(reference.cell)
    const targetVolume = cellVolume(target.cell)
    if (!referenceParameters.ok) return referenceParameters
    if (!targetParameters.ok) return targetParameters
    if (!referenceVolume.ok) return referenceVolume
    if (!targetVolume.ok) return targetVolume
    cell = {
      reference: referenceParameters.value,
      target: targetParameters.value,
      basisDelta: [
        subtract(target.cell.basis[0], reference.cell.basis[0]),
        subtract(target.cell.basis[1], reference.cell.basis[1]),
        subtract(target.cell.basis[2], reference.cell.basis[2])
      ],
      volumeDelta: targetVolume.value - referenceVolume.value
    }
    const basis = options.removeCellDeformation ? reference.cell.basis : target.cell.basis
    const inverse = invertMatrix(basis)!
    const budget = { remaining: GEOMETRY_CHECKS }
    const shown = new Map<AtomId, Vec3>()
    for (const pair of pairs) {
      const a = (references.get(pair.referenceId) as PeriodicAtom).fractional
      const b = (targets.get(pair.targetId) as PeriodicAtom).fractional
      const from = multiplyMatrixVector(reference.cell.basis, a)
      const inTarget = options.removeCellDeformation ? a : multiplyMatrixVector(inverse, from)
      const result = nearestImage(basis, inverse, subtract(b, inTarget), budget)
      if (!result)
        return failure(
          'RESULT_IMAGE_BUDGET',
          'The comparison exceeded its periodic image search bounds.',
          { ...pair }
        )
      const to = add(from, result.displacement)
      shown.set(pair.targetId, to)
      atoms.push({ ...pair, from, to, displacement: result.displacement, image: result.image })
      if (result.ambiguous && diagnostics.length < 16)
        diagnostics.push(ambiguityWarning({ ...pair }))
    }
    targetPositions = target.atoms.map((atom) => ({
      id: atom.id,
      position: shown.get(atom.id) ?? multiplyMatrixVector(basis, atom.fractional)
    }))
  } else if (target.kind === 'molecular') {
    const from = pairs.map((pair) => (references.get(pair.referenceId) as MolecularAtom).cartesian)
    const to = pairs.map((pair) => (targets.get(pair.targetId) as MolecularAtom).cartesian)
    const transform = options.fit ? fitMolecule(from, to) : (point: Vec3) => point
    if (!transform)
      return failure(
        'RESULT_COMPARISON_FIT',
        'Rigid fitting requires at least three noncollinear pairs.'
      )
    targetPositions = target.atoms.map((atom) => ({
      id: atom.id,
      position: transform(atom.cartesian)
    }))
    pairs.forEach((pair, index) => {
      const endpoint = transform(to[index])
      atoms.push({
        ...pair,
        from: from[index],
        to: endpoint,
        displacement: subtract(endpoint, from[index])
      })
    })
  } else {
    return failure(
      'RESULT_COMPARISON_KIND',
      'Comparison requires structures of the same periodicity.'
    )
  }
  const rmsd = Math.sqrt(
    atoms.reduce((sum, atom) => sum + dot(atom.displacement, atom.displacement) / atoms.length, 0)
  )
  if (!Number.isFinite(rmsd))
    return failure(
      'RESULT_COMPARISON_NUMERICAL',
      'Comparison displacements exceeded the numerical bounds.'
    )
  return success(
    { rmsd, atoms, targetPositions, unmatchedReference, unmatchedTarget, cell },
    diagnostics
  )
}

/** In each new cell use its metric to choose the image nearest the previous unfolded fractional position. */
export async function unfoldResultFrames(
  frames: readonly ResultFrame[],
  checkpoint?: () => Promise<void>
): Promise<ScientificResult<readonly ResultFrame[]>> {
  if (
    frames.length > CALCULATION_LIMITS.frames ||
    frames.reduce((sum, frame) => sum + frame.structure.atoms.length, 0) >
      CALCULATION_LIMITS.atomFrames
  )
    return failure(
      'RESULT_TRAJECTORY_BUDGET',
      'The trajectory exceeds the frame or atom-frame budget.'
    )
  if (!frames.length || frames[0].structure.kind === 'molecular') {
    return frames.every(({ structure }) => structure.kind === 'molecular')
      ? success(frames)
      : failure('RESULT_TRAJECTORY_MAPPING', 'Trajectory frames must have the same periodicity.')
  }
  const first = frames[0].structure
  let previous = new Map(first.atoms.map((atom) => [atom.id, atom]))
  const result = [frames[0]]
  const diagnostics: Diagnostic[] = []
  const budget = { remaining: GEOMETRY_CHECKS }
  let atomCount = 0
  for (const frame of frames.slice(1)) {
    const structure = frame.structure
    const context = { frameId: frame.id }
    if (structure.kind !== 'periodic' || structure.atoms.length !== previous.size)
      return failure(
        'RESULT_TRAJECTORY_MAPPING',
        'Trajectory frames must have corresponding atoms.',
        context
      )
    const inverse = invertMatrix(structure.cell.basis)
    if (!inverse)
      return failure('RESULT_TRAJECTORY_CELL', 'A trajectory frame has a singular cell.', context)
    const atoms: PeriodicAtom[] = []
    for (const atom of structure.atoms) {
      if (checkpoint && atomCount++ % 4096 === 0) await checkpoint()
      const reference = previous.get(atom.id)
      const location = { ...context, atomId: atom.id }
      if (reference?.element !== atom.element)
        return failure(
          'RESULT_TRAJECTORY_MAPPING',
          'Trajectory atom identities or elements changed.',
          location
        )
      const image = nearestImage(
        structure.cell.basis,
        inverse,
        subtract(atom.fractional, reference.fractional),
        budget
      )
      if (!image)
        return failure(
          'RESULT_IMAGE_BUDGET',
          'The trajectory exceeded its periodic image search bounds.',
          location
        )
      atoms.push({ ...atom, fractional: add(atom.fractional, image.image) })
      if (image.ambiguous && diagnostics.length < 16) diagnostics.push(ambiguityWarning(location))
    }
    const snapshot = createStructureSnapshot({ ...structure, atoms })
    if (!snapshot.ok) return snapshot
    result.push({ ...frame, structure: snapshot.value })
    previous = new Map(atoms.map((atom) => [atom.id, atom]))
  }
  return success(result, diagnostics)
}

/** Spatial symmetry transforms Cartesian vectors by A R A⁻¹, with parity for axial vectors. */
export function transformResultVector(
  vector: Vec3,
  fractionalRotation: Matrix3,
  cell: Cell,
  kind: 'polar' | 'axial'
): ScientificResult<Vec3> {
  const issues = validateCell(cell)
  if (issues.length) return { ok: false, diagnostics: issues }
  if (
    !isFiniteVector(vector) ||
    !Array.isArray(fractionalRotation) ||
    fractionalRotation.length !== 3 ||
    !fractionalRotation.every(isFiniteVector) ||
    (kind !== 'polar' && kind !== 'axial')
  )
    return failure(
      'RESULT_VECTOR',
      'Provide a vector, symmetry rotation and polar or axial convention.'
    )
  const rotation = multiplyMatrices(
    multiplyMatrices(cell.basis, fractionalRotation),
    invertMatrix(cell.basis)!
  )
  const parity = determinant(rotation)
  if (
    rotation.some((axis, i) =>
      rotation.some((other, j) => Math.abs(dot(axis, other) - Number(i === j)) > 1e-6)
    ) ||
    !Number.isFinite(parity)
  ) {
    return failure(
      'RESULT_VECTOR_SYMMETRY',
      'The symmetry rotation does not preserve the Cartesian metric.'
    )
  }
  const transformed = multiplyMatrixVector(rotation, vector)
  return isFiniteVector(transformed)
    ? success(scale(transformed, kind === 'axial' ? Math.sign(parity) : 1))
    : failure('RESULT_VECTOR', 'Vector transformation exceeded the numerical bounds.')
}

export function validateResultModeSupercell(
  mode: VibrationMode,
  matrix: Matrix3
): ScientificResult<Matrix3> {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 3 ||
    !matrix.every(isIntegerVector) ||
    !Number.isSafeInteger(determinant(matrix)) ||
    determinant(matrix) <= 0
  )
    return failure(
      'RESULT_MODE_SUPERCELL',
      'A mode supercell requires an integer, right-handed transformation.'
    )
  const q = mode.q ?? ZERO
  if (!isFiniteVector(q)) return failure('RESULT_MODE_Q', 'Mode q coordinates must be finite.')
  const transformed = multiplyMatrixVector(transpose(matrix), q)
  if (
    transformed.some(
      (component) =>
        !Number.isSafeInteger(Math.round(component)) ||
        Math.abs(component - Math.round(component)) > 1e-8
    )
  )
    return failure(
      'RESULT_MODE_COMMENSURATE',
      'The mode q point is not commensurate with the supercell.'
    )
  return success(matrix)
}

/** Real part of a complex displacement under the lattice-translation phase convention. */
export function resultModeDisplacement(
  mode: VibrationMode,
  atomIndex: number,
  cellOffset: Vec3,
  phaseRadians: number,
  amplitude = 1
): ScientificResult<Vec3> {
  const real = mode.real[atomIndex]
  const imaginary = mode.imag === undefined ? ZERO : mode.imag[atomIndex]
  const mass = mode.masses === undefined ? 1 : mode.masses[atomIndex]
  const q = mode.q ?? ZERO
  if (
    !isFiniteVector(real) ||
    !isFiniteVector(imaginary) ||
    !isFiniteVector(q) ||
    !isIntegerVector(cellOffset) ||
    !Number.isFinite(phaseRadians) ||
    !Number.isFinite(amplitude) ||
    amplitude < 0 ||
    !Number.isFinite(mass) ||
    mass <= 0
  )
    return failure(
      'RESULT_MODE',
      'The selected atom requires a valid mode, phase, amplitude and mass convention.'
    )
  const phase = phaseRadians + 2 * Math.PI * (dot(q, cellOffset) % 1)
  const displacement = scale(
    subtract(scale(real, Math.cos(phase)), scale(imaginary, Math.sin(phase))),
    amplitude / Math.sqrt(mass)
  )
  return isFiniteVector(displacement)
    ? success(displacement)
    : failure('RESULT_MODE', 'Mode displacement exceeded the numerical bounds.')
}
