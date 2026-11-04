import {
  finishConstruction,
  type ConstructionMapping,
  type ConstructionResult
} from './construction'
import {
  inverseCell,
  MAX_CONSTRUCTION_ATOMS,
  MAX_CONSTRUCTION_CHECKS,
  periodicMapping,
  periodicSource
} from './construction-periodic'
import { add, isFiniteVector, isIntegerVector, multiplyMatrixVector, norm, subtract } from './math'
import { failure } from './result'
import { fractionalReach, IDENTITY_OPERATION } from './symmetry'
import type {
  BondEndpoint,
  Diagnostic,
  MolecularAtom,
  MolecularStructureSnapshot,
  PeriodicAtom,
  ScientificResult,
  SourceBond,
  StructureSnapshot,
  Vec3
} from './types'

export interface NanotubeWall {
  readonly n: number
  readonly m: number
}

export interface NanotubeOptions {
  readonly walls: readonly NanotubeWall[]
  readonly boundary:
    | { readonly kind: 'finite'; readonly length: number }
    | { readonly kind: 'periodic'; readonly repeats: number; readonly vacuum: number }
  readonly latticeConstant?: number
  readonly wallSpacing?: { readonly target: number; readonly tolerance: number }
}

interface WallGeometry extends NanotubeWall {
  readonly determinant: number
  readonly u: readonly [number, number]
  readonly v: readonly [number, number]
  readonly radius: number
  readonly period: number
  readonly squaredPeriodFactor: number
}

const mod = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const endpoint = (sourceAtomId: string, integerCellOffset: Vec3 = [0, 0, 0]): BondEndpoint => ({
  sourceAtomId,
  symmetryOperationId: IDENTITY_OPERATION.id,
  integerCellOffset
})

function wallGeometry({ n, m }: NanotubeWall, latticeConstant: number): WallGeometry {
  const divisor = gcd(n + 2 * m, 2 * n + m)
  const t1 = (n + 2 * m) / divisor
  const t2 = -(2 * n + m) / divisor
  const squaredPeriodFactor = t1 * t1 + t1 * t2 + t2 * t2
  return {
    n,
    m,
    determinant: m * t1 - n * t2,
    u: [-t2, t1],
    v: [m, -n],
    radius: (latticeConstant * Math.sqrt(n * n + n * m + m * m)) / (2 * Math.PI),
    period: latticeConstant * Math.sqrt(squaredPeriodFactor),
    squaredPeriodFactor
  }
}

function compatiblePeriods(walls: readonly WallGeometry[]) {
  const first = walls[0].squaredPeriodFactor
  let common = 1
  const ratios = walls.map(({ squaredPeriodFactor }) => {
    const divisor = gcd(squaredPeriodFactor, first)
    return [Math.sqrt(squaredPeriodFactor / divisor), Math.sqrt(first / divisor)] as const
  })
  for (const [numerator, denominator] of ratios) {
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return undefined
    common = (common / gcd(common, numerator)) * numerator
    if (!Number.isSafeInteger(common) || common > MAX_CONSTRUCTION_ATOMS) return undefined
  }
  return {
    period: walls[0].period * common,
    repeats: ratios.map(([numerator, denominator]) => (common / numerator) * denominator)
  }
}

function grapheneCells(wall: WallGeometry): readonly (readonly [number, number])[] {
  const positions: (readonly [number, number])[] = [[0, 0]]
  const visited = new Set(['0,0'])
  const { determinant, u, v } = wall
  for (const [around, axial] of positions)
    for (const axis of [0, 1]) {
      const next = [mod(around + u[axis], determinant), mod(axial + v[axis], determinant)] as const
      const key = next.join(',')
      if (visited.has(key)) continue
      visited.add(key)
      positions.push(next)
    }
  return positions
}

/** Roll the graphene honeycomb, including its explicit circumferential and axial seam bonds. */
export function buildNanotube(options: NanotubeOptions): ScientificResult<ConstructionResult> {
  if (
    !options ||
    !Array.isArray(options.walls) ||
    options.walls.length < 1 ||
    options.walls.length > 32
  )
    return failure('NANOTUBE_WALLS', 'Supply one to 32 carbon nanotube walls.')
  const { walls, boundary, latticeConstant = 2.46, wallSpacing } = options
  if (!Number.isFinite(latticeConstant) || latticeConstant <= 0)
    return failure('NANOTUBE_LATTICE', 'The graphene lattice constant must be positive and finite.')
  if (
    walls.some(
      (wall) =>
        !wall ||
        !Number.isSafeInteger(wall.n) ||
        !Number.isSafeInteger(wall.m) ||
        wall.n < 3 ||
        wall.n > 10_000 ||
        wall.m < 0 ||
        wall.m > wall.n
    )
  )
    return failure(
      'NANOTUBE_CHIRALITY',
      'Every wall requires safe integer indices 3 ≤ n ≤ 10000 and 0 ≤ m ≤ n.'
    )
  if (
    !boundary ||
    (boundary.kind === 'finite'
      ? !Number.isFinite(boundary.length) || boundary.length <= 0
      : boundary.kind !== 'periodic' ||
        !Number.isSafeInteger(boundary.repeats) ||
        boundary.repeats <= 0 ||
        !Number.isFinite(boundary.vacuum) ||
        boundary.vacuum <= 0)
  )
    return failure(
      'NANOTUBE_BOUNDARY',
      'Specify a positive finite length or positive periodic repeats and transverse vacuum.'
    )
  if (
    wallSpacing !== undefined &&
    (!wallSpacing ||
      !Number.isFinite(wallSpacing.target) ||
      wallSpacing.target <= 0 ||
      !Number.isFinite(wallSpacing.tolerance) ||
      wallSpacing.tolerance < 0)
  )
    return failure(
      'NANOTUBE_SPACING',
      'Wall spacing requires a positive target and a nonnegative tolerance.'
    )
  const geometry = walls.map((wall) => wallGeometry(wall, latticeConstant))
  if (
    geometry.some(
      ({ radius, period }) =>
        !Number.isFinite(radius) || !Number.isFinite(period) || radius <= 0 || period <= 0
    )
  )
    return failure(
      'NANOTUBE_RANGE',
      'The nanotube geometry is outside the supported numeric range.'
    )
  for (let index = 1; index < geometry.length; index++) {
    const spacing = geometry[index].radius - geometry[index - 1].radius
    if (
      spacing <= 0 ||
      (wallSpacing && Math.abs(spacing - wallSpacing.target) > wallSpacing.tolerance)
    )
      return failure(
        'NANOTUBE_SPACING',
        'Provide walls in strictly increasing radius order and within the specified wall spacing tolerance.',
        { wall: index + 1, spacing }
      )
  }
  const compatibility = boundary.kind === 'periodic' ? compatiblePeriods(geometry) : undefined
  if (boundary.kind === 'periodic' && !compatibility)
    return failure(
      'NANOTUBE_PERIOD',
      'The walls have no common axial period within the supported budget.'
    )
  const length =
    boundary.kind === 'finite' ? boundary.length : compatibility!.period * boundary.repeats
  const width =
    2 * geometry[geometry.length - 1].radius + (boundary.kind === 'periodic' ? boundary.vacuum : 0)
  const repetitions = geometry.map(({ period }, index) =>
    boundary.kind === 'periodic'
      ? compatibility!.repeats[index] * boundary.repeats
      : Math.max(1, Math.ceil(length / period))
  )
  const upperBound = geometry.reduce(
    (total, wall, index) => total + 2 * wall.determinant * repetitions[index],
    0
  )
  if (
    !Number.isFinite(length) ||
    !Number.isFinite(width) ||
    !Number.isSafeInteger(upperBound) ||
    upperBound > MAX_CONSTRUCTION_ATOMS
  )
    return failure('NANOTUBE_BUDGET', 'The nanotube exceeds its size or numeric budget.')
  const bonds: SourceBond[] = []
  const cartesianAtoms: MolecularAtom[] = []
  const periodicAtoms: PeriodicAtom[] = []
  const atomMapping: ConstructionMapping[] = []
  const bondMapping: ConstructionMapping[] = []
  let cutBonds = 0
  for (const [wallIndex, wall] of geometry.entries()) {
    const cells = grapheneCells(wall)
    const atoms = new Set<string>()
    const repeats = repetitions[wallIndex]
    const { determinant, u, v } = wall
    const aroundB = u[0] + u[1]
    const axialB = v[0] + v[1]
    const ticks = 3 * determinant
    const key = (around: number, axial: number, sublattice: number, repeat: number): string =>
      `nanotube:${wallIndex + 1}:${around}:${axial}:${sublattice}:${repeat}`
    for (let repeat = 0; repeat < repeats; repeat++)
      for (const [around, axial] of cells)
        for (const sublattice of [0, 1]) {
          const z = (repeat + mod(3 * axial + sublattice * axialB, ticks) / ticks) * wall.period
          if (boundary.kind === 'finite' && z >= length) continue
          const angle = (2 * Math.PI * mod(3 * around + sublattice * aroundB, ticks)) / ticks
          const x = wall.radius * Math.cos(angle)
          const y = wall.radius * Math.sin(angle)
          const id = key(around, axial, sublattice, repeat)
          const properties = { id, element: 'C', occupancy: { kind: 'known', value: 1 } as const }
          if (boundary.kind === 'finite')
            cartesianAtoms.push({ ...properties, cartesian: [x, y, z] })
          else
            periodicAtoms.push({
              ...properties,
              fractional: [0.5 + x / width, 0.5 + y / width, z / length]
            })
          atoms.add(id)
          atomMapping.push({ id, origins: [{ input: 'graphene', sourceId: id }] })
        }
    const finite = boundary.kind === 'finite'
    for (let repeat = finite ? -1 : 0; repeat < repeats + Number(finite); repeat++)
      for (const [around, axial] of cells)
        for (const [shiftU, shiftV] of [
          [0, 0],
          [-u[0], -v[0]],
          [-u[1], -v[1]]
        ]) {
          const left = key(around, axial, 0, repeat)
          const targetRepeat = repeat + Math.floor((3 * (axial + shiftV) + axialB) / ticks)
          const right = key(
            mod(around + shiftU, determinant),
            mod(axial + shiftV, determinant),
            1,
            finite ? targetRepeat : mod(targetRepeat, repeats)
          )
          const hasLeft = atoms.has(left)
          const hasRight = atoms.has(right)
          if (!hasLeft || !hasRight) {
            if (hasLeft !== hasRight) cutBonds++
            continue
          }
          const id = `nanotube:bond:${bonds.length + 1}`
          bonds.push({
            id,
            order: 'single',
            endpoints: [
              endpoint(left),
              endpoint(right, [0, 0, finite ? 0 : Math.floor(targetRepeat / repeats)])
            ]
          })
          bondMapping.push({
            id,
            origins: [{ input: 'graphene', sourceId: JSON.stringify([left, right, targetRepeat]) }]
          })
        }
  }
  const diagnostics: Diagnostic[] =
    cutBonds === 0
      ? []
      : [
          {
            severity: 'warning',
            code: 'NANOTUBE_END_BONDS_CUT',
            message: 'The finite length creates open ends with cut graphene bonds.',
            context: { count: cutBonds }
          }
        ]
  const snapshot: StructureSnapshot =
    boundary.kind === 'finite'
      ? { kind: 'molecular', atoms: cartesianAtoms, bonds }
      : {
          kind: 'periodic',
          atoms: periodicAtoms,
          bonds,
          cell: {
            basis: [
              [width, 0, 0],
              [0, width, 0],
              [0, 0, length]
            ]
          },
          symmetry: { operations: [IDENTITY_OPERATION], spaceGroup: { hallNumber: 1 } }
        }
  return finishConstruction(
    snapshot,
    atomMapping,
    bondMapping,
    {
      material: 'carbon',
      latticeConstant,
      length,
      walls: geometry.map(({ n, m, radius, period }) => ({ n, m, diameter: 2 * radius, period })),
      boundary: boundary.kind,
      ...(boundary.kind === 'periodic'
        ? { vacuum: boundary.vacuum, repeats: boundary.repeats }
        : {})
    },
    diagnostics
  )
}

export interface ClusterOptions {
  readonly center: Vec3
  readonly shape:
    | { readonly kind: 'sphere'; readonly radius: number }
    | { readonly kind: 'box'; readonly halfLengths: Vec3 }
}

interface ClusterAtom {
  readonly id: string
  readonly translation: Vec3
}

const CROP_TOLERANCE = 1e-8

/** Crop a finite Cartesian selection from the full crystallographic lattice. */
export function cropCluster(
  input: StructureSnapshot,
  options: ClusterOptions
): ScientificResult<ConstructionResult<MolecularStructureSnapshot>> {
  if (input?.kind !== 'periodic' || !options || !isFiniteVector(options.center))
    return failure('CLUSTER_INPUT', 'A periodic source and a finite Cartesian center are required.')
  const { center, shape } = options
  if (
    !shape ||
    (shape.kind === 'sphere'
      ? !Number.isFinite(shape.radius) || shape.radius <= 0
      : shape.kind !== 'box' ||
        !isFiniteVector(shape.halfLengths) ||
        shape.halfLengths.some((length) => length <= 0))
  )
    return failure(
      'CLUSTER_SHAPE',
      'Supply a sphere or a Cartesian box with finite positive dimensions.'
    )
  const source = periodicSource(input)
  if (!source.ok) return source
  const { snapshot } = source.value
  const inverse = inverseCell(snapshot.cell)!
  const fractionalCenter = multiplyMatrixVector(inverse, center)
  const reach = fractionalReach(
    inverse,
    (shape.kind === 'sphere' ? shape.radius : norm(shape.halfLengths)) + CROP_TOLERANCE
  )
  const mapping = periodicMapping(source.value)
  const origins = new Map(mapping.atoms.map((entry) => [entry.id, entry.origins]))
  const bondOrigins = new Map(mapping.bonds.map((entry) => [entry.id, entry.origins]))
  const atoms: MolecularAtom[] = []
  const bonds: SourceBond[] = []
  const atomMapping: ConstructionMapping[] = []
  const bondMapping: ConstructionMapping[] = []
  const selected = new Map<string, ClusterAtom[]>()
  const selectedImages = new Map<string, string>()
  const imageKey = (id: string, translation: Vec3) => JSON.stringify([id, ...translation])
  const diagnostics: Diagnostic[] = [...source.diagnostics]
  let budget = MAX_CONSTRUCTION_CHECKS
  let mobilityDropped = 0
  for (const atom of snapshot.atoms) {
    const delta = subtract(fractionalCenter, atom.fractional)
    const lower = reach.map((extent, axis) => Math.ceil(delta[axis] - extent))
    const upper = reach.map((extent, axis) => Math.floor(delta[axis] + extent))
    if (![...lower, ...upper].every(Number.isSafeInteger))
      return failure('CLUSTER_RANGE', 'The crop bounds exceed safe integer lattice translations.')
    const images: ClusterAtom[] = []
    for (let x = lower[0]; x <= upper[0]; x++)
      for (let y = lower[1]; y <= upper[1]; y++)
        for (let z = lower[2]; z <= upper[2]; z++) {
          if (--budget < 0)
            return failure('CLUSTER_BUDGET', 'The cluster crop exceeded its work budget.')
          const translation: Vec3 = [x, y, z]
          const relative = multiplyMatrixVector(snapshot.cell.basis, subtract(translation, delta))
          const inside =
            shape.kind === 'sphere'
              ? norm(relative) <= shape.radius + CROP_TOLERANCE
              : relative.every(
                  (value, axis) => Math.abs(value) <= shape.halfLengths[axis] + CROP_TOLERANCE
                )
          if (!inside) continue
          if (atoms.length >= MAX_CONSTRUCTION_ATOMS)
            return failure('CLUSTER_BUDGET', 'The cluster crop exceeded its output atom budget.')
          const { fractional, movable, ...properties } = atom as PeriodicAtom & {
            readonly movable?: readonly boolean[]
          }
          if (movable !== undefined) mobilityDropped++
          const id = `cluster:atom:${atoms.length + 1}`
          const position = multiplyMatrixVector(snapshot.cell.basis, add(fractional, translation))
          const atomOrigins = origins.get(atom.id)!.map((origin) => ({
            ...origin,
            endpoint: {
              ...origin.endpoint!,
              integerCellOffset: add(origin.endpoint!.integerCellOffset, translation)
            }
          }))
          if (atomOrigins.some(({ endpoint }) => !isIntegerVector(endpoint.integerCellOffset)))
            return failure(
              'CLUSTER_RANGE',
              'A retained atom source exceeds safe integer lattice translations.'
            )
          atoms.push({
            ...properties,
            id,
            cartesian: position,
            ...(properties.label === undefined
              ? {}
              : { label: `${properties.label}_${atoms.length + 1}` })
          })
          atomMapping.push({ id, origins: atomOrigins })
          images.push({ id, translation })
          selectedImages.set(imageKey(atom.id, translation), id)
        }
    selected.set(atom.id, images)
  }
  if (atoms.length === 0) return failure('CLUSTER_EMPTY', 'The crop contains no atomic sites.')
  let boundaryBonds = 0
  for (const bond of snapshot.bonds) {
    const [left, right] = bond.endpoints
    const shift = subtract(right.integerCellOffset, left.integerCellOffset)
    for (const image of selected.get(left.sourceAtomId) ?? []) {
      if (--budget < 0)
        return failure('CLUSTER_BUDGET', 'Bond projection exceeded its work budget.')
      const target = selectedImages.get(imageKey(right.sourceAtomId, add(image.translation, shift)))
      if (!target) {
        boundaryBonds++
        continue
      }
      const id = `cluster:bond:${bonds.length + 1}`
      bonds.push({ ...bond, id, endpoints: [endpoint(image.id), endpoint(target)] })
      bondMapping.push({ id, origins: bondOrigins.get(bond.id)! })
    }
    for (const image of selected.get(right.sourceAtomId) ?? []) {
      if (--budget < 0)
        return failure('CLUSTER_BUDGET', 'Bond projection exceeded its work budget.')
      if (!selectedImages.has(imageKey(left.sourceAtomId, subtract(image.translation, shift))))
        boundaryBonds++
    }
  }
  if (boundaryBonds)
    diagnostics.push({
      severity: 'warning',
      code: 'CLUSTER_BOUNDARY_BONDS_CUT',
      message: 'Explicit bonds crossing the finite crop boundary were removed.',
      context: { count: boundaryBonds }
    })
  if (mobilityDropped)
    diagnostics.push({
      severity: 'warning',
      code: 'CLUSTER_MOBILITY_DROPPED',
      message: 'Periodic Direct mobility flags cannot be represented by a finite cluster.',
      context: { count: mobilityDropped }
    })
  return finishConstruction(
    {
      kind: 'molecular',
      title: snapshot.title,
      metadata: snapshot.metadata,
      atoms,
      bonds
    },
    atomMapping,
    bondMapping,
    {
      center: [...center],
      shape:
        shape.kind === 'sphere'
          ? { kind: shape.kind, radius: shape.radius }
          : { kind: shape.kind, halfLengths: [...shape.halfLengths] },
      boundaryBonds
    },
    diagnostics
  )
}
