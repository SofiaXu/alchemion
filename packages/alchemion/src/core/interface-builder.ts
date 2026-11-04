import { createCell, validateCell } from './cell'
import { finishConstruction } from './construction'
import type { ConstructionMapping, ConstructionResult } from './construction'
import {
  MAX_CONSTRUCTION_ATOMS,
  MAX_CONSTRUCTION_CHECKS,
  periodicBuckets,
  periodicMapping
} from './construction-periodic'
import {
  add,
  cross,
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
import { transformMobility } from './mobility'
import { failure, success } from './result'
import { createStructureSnapshot } from './structure'
import { createSupercell } from './supercell'
import { surfaceFrame } from './surface'
import type {
  Cell,
  Diagnostic,
  JsonValue,
  Matrix3,
  MolecularStructureSnapshot,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  SourceBond,
  StructureSnapshot,
  Vec3
} from './types'

export interface InterfaceMatchOptions {
  readonly rotation?: number
  /** Maximum absolute principal stretch minus one. */
  readonly maxStrain?: number
  readonly maxAngleMismatch?: number
  readonly maxAreaMultiple?: number
  readonly maxMatches?: number
}

export interface InterfaceMatch {
  readonly referenceMatrix: Matrix3
  readonly overlayerMatrix: Matrix3
  readonly rotation: number
  readonly angularAdjustment: number
  readonly strain: number
  readonly area: number
}

export interface InterfaceOptions {
  readonly match: InterfaceMatch
  readonly gap: number
  readonly vacuum: number
  /** In-plane translation in fractions of the matched reference basis. */
  readonly translation?: readonly [number, number]
  readonly minimumDistance?: number
}

export interface AdsorbateOptions {
  readonly anchorAtomId: string
  /** Target point in Cartesian angstroms. Height is along the oriented surface normal. */
  readonly target: Vec3
  readonly height: number
  readonly rotation?: { readonly axis: Vec3; readonly angle: number }
  readonly minimumDistance?: number
}

const NORMAL_AXIS: Vec3 = [0, 0, 1]
const RADIANS = Math.PI / 180
const DEFAULT_CONTACT = 0.5
const planar = ([a, b]: Matrix3): Matrix3 => [[a[0], a[1], 0], [b[0], b[1], 0], NORMAL_AXIS]
const positive = (value: number) => Number.isFinite(value) && value > 0
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0

function planeRotation(degrees: number): Matrix3 {
  const radians = (degrees % 360) * RADIANS
  const cosine = Math.cos(radians),
    sine = Math.sin(radians)
  return [[cosine, sine, 0], [-sine, cosine, 0], NORMAL_AXIS]
}

function sourcePlane(cell: Cell): Matrix3 {
  return planar(multiplyMatrices(transpose(surfaceFrame(cell)), cell.basis))
}

function planarSupercells(basis: Matrix3, limit: number): Matrix3[] {
  const cells: Matrix3[] = []
  // A column Hermite form enumerates sublattices once. A short basis makes matching
  // independent of the incidental shear in the input axes.
  for (let a = 1; a <= limit; a++)
    for (let b = 1; a * b <= limit; b++)
      for (let offset = 0; offset < a; offset++) {
        let x: Vec3 = [a, 0, 0],
          y: Vec3 = [offset, b, 0]
        for (let step = 0; step < 128; step++) {
          const u = multiplyMatrixVector(basis, x),
            v = multiplyMatrixVector(basis, y)
          if (norm(v) < norm(u) * (1 - 1e-12)) {
            ;[x, y] = [y, scale(x, -1)]
            continue
          }
          const axis = scale(u, 1 / norm(u))
          const projection = dot(axis, v) / norm(u)
          if (Math.abs(projection) <= 0.5 + 1e-12) break
          const next = subtract(y, scale(x, Math.round(projection)))
          if (!isIntegerVector(next)) break
          y = next
        }
        cells.push([x, y, NORMAL_AXIS])
      }
  return cells
}

function strainOf(transform: Matrix3) {
  const [[a, c], [b, d]] = transform
  const trace = Math.hypot(a + d, c - b)
  const difference = Math.hypot(a - d, c + b)
  const largest = (trace + difference) / 2
  const smallest = (a * d - b * c) / largest
  return {
    strain: Math.max(Math.abs(largest - 1), Math.abs(smallest - 1)),
    angularAdjustment: Math.atan2(c - b, a + d) / RADIANS
  }
}

export function findInterfaceMatches(
  reference: StructureSnapshot,
  overlayer: StructureSnapshot,
  options: InterfaceMatchOptions = {}
): ScientificResult<readonly InterfaceMatch[]> {
  if (reference?.kind !== 'periodic' || overlayer?.kind !== 'periodic')
    return failure('INTERFACE_SOURCE', 'Interface matching requires two periodic surfaces.')
  const diagnostics = [...validateCell(reference.cell), ...validateCell(overlayer.cell)]
  if (diagnostics.length) return { ok: false, diagnostics }
  const {
    rotation = 0,
    maxStrain = 0.05,
    maxAngleMismatch = 1,
    maxAreaMultiple = 8,
    maxMatches = 12
  } = options
  if (
    !Number.isFinite(rotation) ||
    !nonnegative(maxStrain) ||
    maxStrain >= 1 ||
    !nonnegative(maxAngleMismatch) ||
    maxAngleMismatch > 180 ||
    !Number.isSafeInteger(maxAreaMultiple) ||
    maxAreaMultiple < 1 ||
    maxAreaMultiple > 16 ||
    !Number.isSafeInteger(maxMatches) ||
    maxMatches < 1 ||
    maxMatches > 100
  )
    return failure('INTERFACE_OPTIONS', 'Invalid rotation, mismatch thresholds or matching budget.')
  const referenceBasis = sourcePlane(reference.cell)
  const rotatedBasis = multiplyMatrices(planeRotation(rotation), sourcePlane(overlayer.cell))
  const candidates = planarSupercells(rotatedBasis, maxAreaMultiple).flatMap(([u, v]) =>
    (
      [
        [u, v],
        [v, scale(u, -1)],
        [scale(u, -1), scale(v, -1)],
        [scale(v, -1), u]
      ] as const
    ).flatMap(([first, second]) => {
      const matrix: Matrix3 = [first, second, NORMAL_AXIS]
      const inverse = invertMatrix(multiplyMatrices(rotatedBasis, matrix))
      return inverse ? [{ matrix, inverse }] : []
    })
  )
  const matches: InterfaceMatch[] = []
  for (const referenceMatrix of planarSupercells(referenceBasis, maxAreaMultiple)) {
    const basis = multiplyMatrices(referenceBasis, referenceMatrix)
    const area = norm(cross(basis[0], basis[1]))
    if (!positive(area)) continue
    for (const candidate of candidates) {
      const { strain, angularAdjustment } = strainOf(multiplyMatrices(basis, candidate.inverse))
      if (!(strain <= maxStrain + 1e-12 && Math.abs(angularAdjustment) <= maxAngleMismatch + 1e-12))
        continue
      matches.push({
        referenceMatrix,
        overlayerMatrix: candidate.matrix,
        rotation,
        strain,
        angularAdjustment,
        area
      })
    }
  }
  return success(
    matches
      .sort(
        (a, b) =>
          Math.round(a.strain * 1e10) - Math.round(b.strain * 1e10) ||
          a.area - b.area ||
          Math.abs(a.angularAdjustment) - Math.abs(b.angularAdjustment)
      )
      .slice(0, maxMatches)
  )
}

const planarMatrix = (matrix: Matrix3) =>
  Array.isArray(matrix) &&
  matrix.length === 3 &&
  [0, 1, 2].every((i) => isIntegerVector(matrix[i])) &&
  matrix[0][2] === 0 &&
  matrix[1][2] === 0 &&
  matrix[2][0] === 0 &&
  matrix[2][1] === 0 &&
  matrix[2][2] === 1

function overlap(
  cell: Cell,
  left: readonly PeriodicAtom[],
  right: readonly PeriodicAtom[],
  distance: number,
  includeAdsorbateImages = false
): ScientificResult<undefined> {
  if (distance === 0) return success(undefined)
  if ([...left, ...right].some((atom) => !isFiniteVector(atom.fractional)))
    return failure('SURFACE_POSITION', 'Constructed positions must be finite.')
  const bins = periodicBuckets<string>(cell, invertMatrix(cell.basis)!, distance)
  const budget = { remaining: MAX_CONSTRUCTION_CHECKS }
  for (const atom of left) bins.add(atom.fractional, atom.id)
  for (const atom of right)
    for (const neighbor of bins.near(atom.fractional)) {
      const separation = bins.distance(atom.fractional, neighbor.point, budget)
      if (separation === undefined)
        return failure(
          'SURFACE_CONTACT_BUDGET',
          'Periodic contact checks exceeded their bounded range.'
        )
      if (separation < distance)
        return success(undefined, [
          {
            severity: 'warning',
            code: 'SURFACE_OVERLAP',
            message: 'The two inputs have atoms closer than the selected minimum distance.',
            context: { firstAtomId: neighbor.value, secondAtomId: atom.id, distance: separation }
          }
        ])
    }
  if (includeAdsorbateImages) {
    const imageBins = periodicBuckets<string>(cell, invertMatrix(cell.basis)!, distance)
    for (const atom of right) imageBins.add(atom.fractional, atom.id)
    for (const atom of right)
      for (const neighbor of imageBins.near(atom.fractional)) {
        const separation = imageBins.distance(atom.fractional, neighbor.point, budget, true)
        if (separation === undefined)
          return failure(
            'SURFACE_CONTACT_BUDGET',
            'Periodic contact checks exceeded their bounded range.'
          )
        if (separation < distance)
          return success(undefined, [
            {
              severity: 'warning',
              code: 'ADSORBATE_IMAGE_OVERLAP',
              message: 'The adsorbate overlaps a periodic image.',
              context: { firstAtomId: neighbor.value, secondAtomId: atom.id, distance: separation }
            }
          ])
      }
  }
  return success(undefined)
}

function joinedMetadata(
  reference: PeriodicStructureSnapshot,
  overlayer: StructureSnapshot,
  key: string
): NonNullable<StructureSnapshot['metadata']> {
  const record = (value: JsonValue | undefined) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Readonly<Record<string, JsonValue>>)
      : undefined
  const primary = record(reference.metadata?.alchemionFormats)
  const secondary = record(overlayer.metadata?.alchemionFormats)
  const metadata: Record<string, JsonValue> = {
    ...reference.metadata,
    [key]: { title: overlayer.title ?? null, metadata: overlayer.metadata ?? {} }
  }
  if (secondary?.schemaVersion === 1 && Array.isArray(secondary.losses))
    metadata.alchemionFormats = {
      ...(primary?.schemaVersion === 1 ? primary : {}),
      schemaVersion: 1,
      losses: [...(Array.isArray(primary?.losses) ? primary.losses : []), ...secondary.losses],
      ...(secondary.sourceMeasurements
        ? {
            sourceMeasurements: {
              ...record(primary?.sourceMeasurements),
              secondary: secondary.sourceMeasurements
            }
          }
        : {})
    }
  return metadata
}

export function createInterface(
  reference: StructureSnapshot,
  overlayer: StructureSnapshot,
  options: InterfaceOptions
): ScientificResult<ConstructionResult<PeriodicStructureSnapshot>> {
  if (reference?.kind !== 'periodic' || overlayer?.kind !== 'periodic')
    return failure('INTERFACE_SOURCE', 'Interface construction requires two periodic surfaces.')
  if (!options?.match || !positive(options.gap) || !positive(options.vacuum))
    return failure('INTERFACE_OPTIONS', 'Select a match and positive gap and vacuum.')
  const { match, gap, vacuum, translation = [0, 0], minimumDistance = DEFAULT_CONTACT } = options
  if (
    !planarMatrix(match.referenceMatrix) ||
    !planarMatrix(match.overlayerMatrix) ||
    !Number.isFinite(match.rotation) ||
    !nonnegative(minimumDistance) ||
    !Array.isArray(translation) ||
    translation.length !== 2 ||
    !Number.isFinite(translation[0]) ||
    !Number.isFinite(translation[1])
  )
    return failure(
      'INTERFACE_OPTIONS',
      'Interface transforms must preserve the normal lattice direction.'
    )
  const first = createSupercell(reference, match.referenceMatrix)
  if (!first.ok) return first
  const second = createSupercell(overlayer, match.overlayerMatrix)
  if (!second.ok) return second
  const a = first.value.snapshot,
    b = second.value.snapshot
  if (
    !a.atoms.length ||
    !b.atoms.length ||
    a.atoms.length + b.atoms.length > MAX_CONSTRUCTION_ATOMS
  )
    return failure(
      'INTERFACE_BUDGET',
      'Two nonempty layers must fit within the construction atom budget.'
    )
  const frame = surfaceFrame(reference.cell)
  const normal = frame[2]
  const otherFrame = surfaceFrame(overlayer.cell)
  const referenceBasis = multiplyMatrices(sourcePlane(reference.cell), match.referenceMatrix)
  const rotation = planeRotation(match.rotation)
  const rotatedBasis = multiplyMatrices(
    rotation,
    multiplyMatrices(sourcePlane(overlayer.cell), match.overlayerMatrix)
  )
  const inverse = invertMatrix(rotatedBasis)
  if (!inverse) return failure('INTERFACE_DEGENERATE', 'The matched surface basis is degenerate.')
  const affine = multiplyMatrices(referenceBasis, inverse)
  const { strain, angularAdjustment } = strainOf(affine)
  const upperMap = multiplyMatrices(
    frame,
    multiplyMatrices(affine, multiplyMatrices(rotation, transpose(otherFrame)))
  )
  const mappedUpperBasis = multiplyMatrices(upperMap, b.cell.basis)
  const projectionRange = (layer: PeriodicStructureSnapshot, basis: Matrix3) => {
    let min = Infinity,
      max = -Infinity
    for (const atom of layer.atoms) {
      const height = dot(multiplyMatrixVector(basis, atom.fractional), normal)
      min = Math.min(min, height)
      max = Math.max(max, height)
    }
    return { min, max, span: max - min }
  }
  const lower = projectionRange(a, a.cell.basis)
  const upper = projectionRange(b, mappedUpperBasis)
  const cell = createCell({
    basis: [a.cell.basis[0], a.cell.basis[1], scale(normal, lower.span + gap + upper.span + vacuum)]
  })
  if (!cell.ok) return cell
  const outputInverse = invertMatrix(cell.value.basis)!
  const diagnostics: Diagnostic[] = [...first.diagnostics, ...second.diagnostics]
  const atoms: PeriodicAtom[] = []
  const bonds: SourceBond[] = []
  const atomMapping: ConstructionMapping[] = []
  const bondMapping: ConstructionMapping[] = []
  const layers = [
    {
      input: 'reference',
      built: first.value,
      basis: a.cell.basis,
      offset: scale(normal, vacuum / 2 - lower.min)
    },
    {
      input: 'overlayer',
      built: second.value,
      basis: mappedUpperBasis,
      offset: add(
        scale(normal, vacuum / 2 + lower.span + gap - upper.min),
        multiplyMatrixVector(a.cell.basis, [translation[0], translation[1], 0])
      )
    }
  ]
  for (const layer of layers) {
    const mappings = periodicMapping(layer.built, layer.input)
    const transform = multiplyMatrices(outputInverse, layer.basis)
    const offset = multiplyMatrixVector(outputInverse, layer.offset)
    const renamed = new Map(
      layer.built.snapshot.atoms.map((atom) => [atom.id, `${layer.input}:${atom.id}`])
    )
    for (const atom of layer.built.snapshot.atoms) {
      const id = renamed.get(atom.id)!
      const mobility = transformMobility(atom.movable, transform, atom.id)
      if (!mobility.ok) return mobility
      atoms.push({
        ...atom,
        id,
        movable: mobility.value,
        label: atom.label === undefined ? undefined : `${layer.input}_${atom.label}`,
        fractional: add(multiplyMatrixVector(transform, atom.fractional), offset)
      })
    }
    for (const entry of mappings.atoms) atomMapping.push({ ...entry, id: renamed.get(entry.id)! })
    for (let i = 0; i < layer.built.snapshot.bonds.length; i++) {
      const bond = layer.built.snapshot.bonds[i]
      const [left, right] = bond.endpoints
      const origin = mappings.bonds[i]
      if (left.integerCellOffset[2] !== right.integerCellOffset[2]) {
        diagnostics.push({
          severity: 'warning',
          code: 'INTERFACE_BOND_TRUNCATED',
          message: 'An explicit bond crosses the normal boundary of a layer.',
          context: { input: layer.input, bondId: origin.origins[0].sourceId }
        })
        continue
      }
      if (bonds.length === MAX_CONSTRUCTION_ATOMS)
        return failure('INTERFACE_BUDGET', 'The interface exceeds the explicit bond budget.')
      const id = `${layer.input}:${bond.id}`
      const offset = subtract(right.integerCellOffset, left.integerCellOffset)
      bonds.push({
        ...bond,
        id,
        endpoints: [
          { ...left, sourceAtomId: renamed.get(left.sourceAtomId)!, integerCellOffset: [0, 0, 0] },
          { ...right, sourceAtomId: renamed.get(right.sourceAtomId)!, integerCellOffset: offset }
        ]
      })
      bondMapping.push({ ...origin, id })
    }
  }
  const contacts = overlap(
    cell.value,
    atoms.slice(0, a.atoms.length),
    atoms.slice(a.atoms.length),
    minimumDistance
  )
  if (!contacts.ok) return contacts
  return finishConstruction(
    { ...a, cell: cell.value, atoms, bonds, metadata: joinedMetadata(a, b, 'alchemionOverlayer') },
    atomMapping,
    bondMapping,
    {
      gap,
      vacuum,
      translation,
      strain,
      angularAdjustment,
      rotation: match.rotation,
      area: norm(cross(cell.value.basis[0], cell.value.basis[1]))
    },
    [...diagnostics, ...contacts.diagnostics]
  )
}

export function placeAdsorbate(
  substrate: StructureSnapshot,
  molecule: StructureSnapshot,
  options: AdsorbateOptions
): ScientificResult<ConstructionResult<PeriodicStructureSnapshot>> {
  if (substrate?.kind !== 'periodic' || molecule?.kind !== 'molecular')
    return failure(
      'ADSORBATE_SOURCE',
      'A periodic substrate and nonperiodic molecule are required.'
    )
  if (!options || !isFiniteVector(options.target) || !nonnegative(options.height))
    return failure('ADSORBATE_POSITION', 'Provide a Cartesian target and nonnegative height.')
  const { rotation, minimumDistance = DEFAULT_CONTACT } = options
  if (!nonnegative(minimumDistance))
    return failure('ADSORBATE_CONTACT', 'Minimum distance must be finite and nonnegative.')
  const checked = createStructureSnapshot(molecule)
  if (!checked.ok) return checked
  const source = checked.value as MolecularStructureSnapshot
  const anchor = source.atoms.find((atom) => atom.id === options.anchorAtomId)
  if (!anchor) return failure('ADSORBATE_ANCHOR', 'Select an existing molecule atom as the anchor.')
  if (
    rotation &&
    (!isFiniteVector(rotation.axis) ||
      !positive(norm(rotation.axis)) ||
      !Number.isFinite(rotation.angle))
  )
    return failure(
      'ADSORBATE_ROTATION',
      'Use a nonzero Cartesian axis and a finite rotation angle.'
    )
  const built = createSupercell(substrate, [1, 1, 1])
  if (!built.ok) return built
  const reference = built.value.snapshot
  if (
    !reference.atoms.length ||
    reference.atoms.length + source.atoms.length > MAX_CONSTRUCTION_ATOMS ||
    reference.bonds.length + source.bonds.length > MAX_CONSTRUCTION_ATOMS
  )
    return failure(
      'ADSORBATE_BUDGET',
      'A nonempty substrate and adsorbate must fit within the construction budget.'
    )
  const mappings = periodicMapping(built.value, 'substrate')
  const diagnostics: Diagnostic[] = [...built.diagnostics, ...checked.diagnostics]
  const normal = surfaceFrame(reference.cell)[2]
  const target = add(options.target, scale(normal, options.height))
  const outputInverse = invertMatrix(reference.cell.basis)!
  const axis = rotation ? scale(rotation.axis, 1 / norm(rotation.axis)) : NORMAL_AXIS
  const radians = ((rotation?.angle ?? 0) % 360) * RADIANS
  const cosine = Math.cos(radians),
    sine = Math.sin(radians)
  const renamed = new Map(
    source.atoms.map((atom, index) => [atom.id, `adsorbate:atom:${index + 1}`])
  )
  const adsorbate = source.atoms.map((atom): PeriodicAtom => {
    const { cartesian, stereoParity, coordinateUncertainties, ...properties } = atom
    const relative = subtract(cartesian, anchor.cartesian)
    const rotated = add(
      add(scale(relative, cosine), scale(cross(axis, relative), sine)),
      scale(axis, dot(axis, relative) * (1 - cosine))
    )
    const id = renamed.get(atom.id)!
    if (stereoParity || coordinateUncertainties)
      diagnostics.push({
        severity: 'warning',
        code: 'ADSORBATE_ATOM_FIELD_LOSS',
        message:
          'A periodic placement cannot carry molecular parity or the original coordinate uncertainty.',
        context: { atomId: atom.id }
      })
    mappings.atoms.push({ id, origins: [{ input: 'molecule', sourceId: atom.id }] })
    return {
      ...properties,
      id,
      fractional: multiplyMatrixVector(outputInverse, add(target, rotated)),
      label: atom.label === undefined ? undefined : `adsorbate_${atom.label}`
    }
  })
  if (source.stereoAbsolute !== undefined)
    diagnostics.push({
      severity: 'warning',
      code: 'ADSORBATE_STEREO_ABSOLUTE_LOSS',
      message: 'A periodic placement cannot carry the molecular absolute-stereo header.'
    })
  const bonds = source.bonds.map((bond, index): SourceBond => {
    const id = `adsorbate:bond:${index + 1}`
    mappings.bonds.push({ id, origins: [{ input: 'molecule', sourceId: bond.id }] })
    return {
      ...bond,
      id,
      endpoints: [
        { ...bond.endpoints[0], sourceAtomId: renamed.get(bond.endpoints[0].sourceAtomId)! },
        { ...bond.endpoints[1], sourceAtomId: renamed.get(bond.endpoints[1].sourceAtomId)! }
      ]
    }
  })
  const contacts = overlap(reference.cell, reference.atoms, adsorbate, minimumDistance, true)
  if (!contacts.ok) return contacts
  return finishConstruction(
    {
      ...reference,
      atoms: [...reference.atoms, ...adsorbate],
      bonds: [...reference.bonds, ...bonds],
      metadata: joinedMetadata(reference, source, 'alchemionAdsorbate')
    },
    mappings.atoms,
    mappings.bonds,
    {
      target: options.target,
      height: options.height,
      anchorAtomId: anchor.id,
      ...(rotation ? { rotation } : {})
    },
    [...diagnostics, ...contacts.diagnostics]
  )
}
