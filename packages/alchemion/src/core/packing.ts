import { cellVolume, createCell } from './cell'
import {
  finishConstruction,
  type ConstructionMapping,
  type ConstructionResult
} from './construction'
import {
  constructionRandom,
  inverseCell,
  MAX_CONSTRUCTION_ATOMS,
  MAX_CONSTRUCTION_CHECKS,
  periodicBuckets,
  periodicMapping,
  periodicSource,
  validConstructionSeed,
  wrapPosition
} from './construction-periodic'
import { getElement } from './data'
import {
  add,
  cross,
  isFiniteVector,
  isIntegerVector,
  multiplyMatrixVector,
  scale,
  subtract
} from './math'
import { failure, success } from './result'
import { createStructureSnapshot } from './structure'
import { IDENTITY_OPERATION } from './symmetry'
import type {
  AtomProperties,
  BondEndpoint,
  Cell,
  Diagnostic,
  JsonValue,
  MolecularAtom,
  MolecularStructureSnapshot,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  SourceBond,
  Vec3
} from './types'

export type PackingComponent = { readonly molecule: MolecularStructureSnapshot } & (
  | { readonly count: number; readonly ratio?: never }
  | { readonly ratio: number; readonly count?: never }
)

export interface PackingRegion {
  readonly minimum: Vec3
  readonly maximum: Vec3
}

export interface PackingOptions {
  readonly components: readonly PackingComponent[]
  readonly totalMolecules?: number
  readonly cell?: Cell
  readonly density?: number
  readonly seed: number
  readonly minimumDistance: number
  readonly maxAttempts?: number
  readonly substrate?: PeriodicStructureSnapshot
  readonly region?: PackingRegion
}

interface PackingMolecule {
  readonly molecule: MolecularStructureSnapshot
  readonly positions: readonly Vec3[]
  readonly mass: number
  readonly count: number
}

const FULL_REGION: PackingRegion = { minimum: [0, 0, 0], maximum: [1, 1, 1] }
/** Convert an atomic-weight sum per Å³ to g/cm³ using molar masses in g/mol. */
const MASS_DENSITY_FACTOR = 1e24 / 6.02214076e23

function componentCounts(
  components: readonly PackingComponent[],
  total?: number
): number[] | undefined {
  const counts = components.map(({ count }) => count)
  if (
    total === undefined &&
    counts.every((count) => Number.isSafeInteger(count) && count! > 0) &&
    components.every(({ ratio }) => ratio === undefined)
  )
    return counts as number[]
  if (
    !Number.isSafeInteger(total) ||
    total! < components.length ||
    total! > MAX_CONSTRUCTION_ATOMS ||
    counts.some((count) => count !== undefined) ||
    components.some(({ ratio }) => !Number.isFinite(ratio) || ratio! <= 0)
  )
    return undefined
  const sum = components.reduce((result, { ratio }) => result + ratio!, 0)
  if (!Number.isFinite(sum)) return undefined
  const weights = components.map(({ ratio }, index) => {
    const quota = (ratio! / sum) * total!
    const count = Math.floor(quota)
    return { index, count, remainder: quota - count }
  })
  const remainder = total! - weights.reduce((result, { count }) => result + count, 0)
  if (remainder < 0 || remainder > weights.length) return undefined
  for (const entry of [...weights]
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, remainder))
    entry.count++
  return weights.every(({ count }) => count > 0) ? weights.map(({ count }) => count) : undefined
}

function massOf(atoms: readonly AtomProperties[], full: boolean): ScientificResult<number> {
  let total = 0
  for (const atom of atoms) {
    const occupancy = atom.occupancy ?? { kind: 'known', value: 1 }
    if (occupancy.kind !== 'known' || (full && occupancy.value !== 1))
      return failure(
        'PACKING_OCCUPANCY',
        'Packing requires known substrate occupancies and fully occupied molecular input sites.',
        { atomId: atom.id }
      )
    if (occupancy.value === 0) continue
    const mass = getElement(atom.element)?.mass
    if (!mass || (atom.isotope !== undefined && mass.isotopeMassNumber !== atom.isotope))
      return failure(
        'PACKING_MASS_UNKNOWN',
        'The elemental or specified isotope mass is unavailable.',
        { atomId: atom.id, element: atom.element, isotope: atom.isotope }
      )
    total += mass.value * occupancy.value
  }
  return Number.isFinite(total)
    ? success(total)
    : failure('PACKING_MASS_RANGE', 'The mass is outside the supported numeric range.')
}

function prepareMolecule(
  input: MolecularStructureSnapshot,
  count: number
): ScientificResult<PackingMolecule> {
  if (input?.kind !== 'molecular' || !Array.isArray(input.atoms) || input.atoms.length === 0)
    return failure('PACKING_MOLECULE', 'Every component requires a nonempty molecular snapshot.')
  if (input.atoms.length * count > MAX_CONSTRUCTION_ATOMS)
    return failure('PACKING_BUDGET', 'A component exceeds the atom budget.')
  const checked = createStructureSnapshot(input)
  if (!checked.ok) return checked
  const molecule = checked.value as MolecularStructureSnapshot
  const mass = massOf(molecule.atoms, true)
  if (!mass.ok) return mass
  const center = molecule.atoms.reduce(
    (sum, atom) => add(sum, scale(atom.cartesian, 1 / molecule.atoms.length)),
    [0, 0, 0] as Vec3
  )
  const positions = molecule.atoms.map(({ cartesian }) => subtract(cartesian, center))
  if (positions.some((position) => !isFiniteVector(position)))
    return failure(
      'PACKING_COORDINATES',
      'Molecular centering exceeds the supported numeric range.'
    )
  return success({ molecule, positions, mass: mass.value, count }, checked.diagnostics)
}

function rotation(random: () => number): (position: Vec3) => Vec3 {
  const u = random()
  const angleA = 2 * Math.PI * random()
  const angleB = 2 * Math.PI * random()
  const vector: Vec3 = [
    Math.sqrt(1 - u) * Math.sin(angleA),
    Math.sqrt(1 - u) * Math.cos(angleA),
    Math.sqrt(u) * Math.sin(angleB)
  ]
  const scalar = Math.sqrt(u) * Math.cos(angleB)
  return (position) => {
    const crossTerm = scale(cross(vector, position), 2)
    return add(add(position, scale(crossTerm, scalar)), cross(vector, crossTerm))
  }
}

function jsonObject(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, JsonValue>>)
    : {}
}

function outputMetadata(
  substrate: PeriodicStructureSnapshot | undefined,
  molecules: readonly PackingMolecule[],
  losses: readonly Diagnostic[]
) {
  const metadata = substrate?.metadata
  const baseFormat = jsonObject(metadata?.alchemionFormats)
  const formats = molecules.map(({ molecule }) => jsonObject(molecule.metadata?.alchemionFormats))
  const inheritedLosses = [baseFormat, ...formats].flatMap((record) =>
    record.schemaVersion === 1 && Array.isArray(record.losses) ? record.losses : []
  ) as JsonValue[]
  const packingLosses = losses.map(({ code, message }) => ({ code, message }))
  return {
    ...metadata,
    alchemionPacking: {
      schemaVersion: 1,
      components: molecules.map(({ molecule }) => molecule.metadata ?? {})
    },
    ...(inheritedLosses.length || packingLosses.length
      ? {
          alchemionFormats: {
            ...baseFormat,
            schemaVersion: 1,
            losses: [...inheritedLosses, ...packingLosses]
          }
        }
      : {})
  }
}

/** Build an initial periodic geometry with bounded seeded rigid placements and exact skew-cell contact checks. */
export function packMolecules(
  options: PackingOptions
): ScientificResult<ConstructionResult<PeriodicStructureSnapshot>> {
  if (
    !options ||
    !Array.isArray(options.components) ||
    options.components.length === 0 ||
    options.components.length > 1024 ||
    options.components.some((component) => !component)
  )
    return failure('PACKING_COMPONENTS', 'Supply one to 1024 molecular components.')
  const {
    components,
    totalMolecules,
    density,
    seed,
    minimumDistance,
    maxAttempts = 500,
    region = FULL_REGION
  } = options
  if (
    !validConstructionSeed(seed) ||
    !Number.isFinite(minimumDistance) ||
    minimumDistance <= 0 ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts <= 0 ||
    maxAttempts > 10_000
  )
    return failure(
      'PACKING_OPTIONS',
      'Use an unsigned 32-bit seed, a positive clearance, and 1–10000 attempts per molecule.'
    )
  if (
    !region ||
    !isFiniteVector(region.minimum) ||
    !isFiniteVector(region.maximum) ||
    region.minimum.some(
      (minimum, axis) => minimum < 0 || region.maximum[axis] > 1 || minimum >= region.maximum[axis]
    )
  )
    return failure(
      'PACKING_REGION',
      'The fractional region needs strictly ordered bounds within [0,1].'
    )
  if (density !== undefined && (!Number.isFinite(density) || density <= 0))
    return failure('PACKING_DENSITY', 'Density must be positive and finite.')
  const counts = componentCounts(components, totalMolecules)
  if (!counts)
    return failure(
      'PACKING_QUOTA',
      'Specify positive integer counts, or positive ratios and a total that assigns every component at least one copy.'
    )
  const source = options.substrate === undefined ? undefined : periodicSource(options.substrate)
  if (source && !source.ok) return source
  const substrate = source?.value.snapshot
  const diagnostics: Diagnostic[] = [...(source?.diagnostics ?? [])]
  if (options.cell !== undefined && substrate !== undefined) {
    const explicitCell = createCell(options.cell)
    if (!explicitCell.ok) return explicitCell
    if (
      !explicitCell.value.basis.every((column, axis) =>
        column.every((value, index) => value === substrate.cell.basis[axis][index])
      )
    )
      return failure(
        'PACKING_CELL_CONFLICT',
        'An explicitly supplied box must match the substrate cell.'
      )
  }
  const molecules: PackingMolecule[] = []
  let atomCount = substrate?.atoms.length ?? 0
  for (const [index, component] of components.entries()) {
    const molecule = prepareMolecule(component.molecule, counts[index])
    if (!molecule.ok) return molecule
    atomCount += molecule.value.molecule.atoms.length * molecule.value.count
    if (atomCount > MAX_CONSTRUCTION_ATOMS)
      return failure('PACKING_BUDGET', 'The total packed atom count exceeds the atom budget.')
    molecules.push(molecule.value)
    diagnostics.push(...molecule.diagnostics)
  }
  const substrateMass = massOf(substrate?.atoms ?? [], false)
  if (!substrateMass.ok) return substrateMass
  const insertedMass = molecules.reduce((sum, { mass, count }) => sum + mass * count, 0)
  const mass = substrateMass.value + insertedMass
  const side = Math.cbrt((mass * MASS_DENSITY_FACTOR) / (density ?? 1))
  const inputCell =
    substrate?.cell ??
    options.cell ??
    (density === undefined
      ? undefined
      : {
          basis: [
            [side, 0, 0],
            [0, side, 0],
            [0, 0, side]
          ]
        })
  if (inputCell === undefined)
    return failure(
      'PACKING_CELL',
      'Supply a fixed cell, a substrate, or a target density for a cubic box.'
    )
  const checkedCell = createCell(inputCell)
  if (!checkedCell.ok) return checkedCell
  const cell = checkedCell.value
  const volume = cellVolume(cell)
  if (!volume.ok) return volume
  const actualDensity = (mass * MASS_DENSITY_FACTOR) / volume.value
  if (!Number.isFinite(actualDensity) || actualDensity <= 0)
    return failure(
      'PACKING_DENSITY_RANGE',
      'Actual density is outside the supported numeric range.'
    )
  if (density !== undefined && Math.abs(actualDensity - density) > density * 1e-6)
    return failure(
      'PACKING_DENSITY_CONFLICT',
      'Fixed cell volume and composition do not satisfy the target density.',
      { density, actualDensity }
    )
  const widths = subtract(region.maximum, region.minimum)
  const regionVolume = volume.value * widths[0] * widths[1] * widths[2]
  const regionDensity = (insertedMass * MASS_DENSITY_FACTOR) / regionVolume
  if (!Number.isFinite(regionDensity) || regionDensity <= 0)
    return failure(
      'PACKING_REGION_RANGE',
      'The filling region volume or density is outside the supported numeric range.'
    )
  const inverse = inverseCell(cell)!
  const budget = { remaining: MAX_CONSTRUCTION_CHECKS }
  const occupied = periodicBuckets(cell, inverse, minimumDistance)
  for (const { fractional, occupancy } of substrate?.atoms ?? [])
    if (occupancy?.kind !== 'known' || occupancy.value > 0) occupied.add(fractional, undefined)
  const random = constructionRandom(seed)
  const atoms: PeriodicAtom[] = [...(substrate?.atoms ?? [])]
  const bonds: SourceBond[] = [...(substrate?.bonds ?? [])]
  const mapping = source?.ok ? periodicMapping(source.value, 'substrate') : { atoms: [], bonds: [] }
  const atomMapping: ConstructionMapping[] = mapping.atoms
  const bondMapping: ConstructionMapping[] = mapping.bonds
  const losses: Diagnostic[] = []
  const ordered = molecules
    .map((molecule, index) => ({ ...molecule, index }))
    .sort((a, b) => b.positions.length - a.positions.length || a.index - b.index)
  let attempts = 0
  for (const { molecule, positions, count, index } of ordered) {
    const input = `component:${index + 1}`
    if (
      molecule.stereoAbsolute !== undefined ||
      molecule.atoms.some(({ stereoParity }) => stereoParity !== undefined) ||
      molecule.bonds.some(({ stereo }) => stereo !== undefined)
    )
      losses.push({
        severity: 'warning',
        code: 'PACKING_STEREO_CLEARED',
        message:
          'Molecular drawing stereochemistry cannot be retained in the periodic packing representation.',
        context: { component: index + 1 }
      })
    if (molecule.atoms.some(({ coordinateUncertainties }) => coordinateUncertainties !== undefined))
      losses.push({
        severity: 'warning',
        code: 'PACKING_UNCERTAINTY_CLEARED',
        message: 'Rotated positions do not carry the original component coordinate uncertainties.',
        context: { component: index + 1 }
      })
    for (let copy = 0; copy < count; copy++) {
      let accepted: readonly Vec3[] | undefined
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        attempts++
        budget.remaining -= positions.length
        if (budget.remaining < 0)
          return failure('PACKING_BUDGET', 'Packing exhausted its work budget.', {
            component: index + 1,
            copy: copy + 1
          })
        const center: Vec3 = [
          region.minimum[0] + widths[0] * random(),
          region.minimum[1] + widths[1] * random(),
          region.minimum[2] + widths[2] * random()
        ]
        const rotate = rotation(random)
        const fractional = positions.map((point) =>
          add(center, multiplyMatrixVector(inverse, rotate(point)))
        )
        if (
          fractional.some(
            (point) => !isFiniteVector(point) || !isIntegerVector(point.map(Math.floor))
          )
        )
          return failure(
            'PACKING_COORDINATES',
            'A placement exceeds supported coordinates or lattice translations.'
          )
        if (
          fractional.some((point) =>
            point.some(
              (value, axis) =>
                widths[axis] !== 1 &&
                (value < region.minimum[axis] || value >= region.maximum[axis])
            )
          )
        )
          continue
        const current = periodicBuckets(cell, inverse, minimumDistance)
        let overlaps = false
        for (const point of fractional) {
          const self = current.distance(point, point, budget, true)
          if (self === undefined)
            return failure('PACKING_BUDGET', 'Periodic contact checks exhausted the work budget.')
          if (self < minimumDistance) {
            overlaps = true
            break
          }
          for (const site of occupied.near(point)) {
            const distance = occupied.distance(point, site.point, budget)
            if (distance === undefined)
              return failure('PACKING_BUDGET', 'Periodic contact checks exhausted the work budget.')
            if (distance < minimumDistance) {
              overlaps = true
              break
            }
          }
          if (overlaps) break
          for (const site of current.near(point)) {
            const distance = current.distance(point, site.point, budget, true)
            if (distance === undefined)
              return failure('PACKING_BUDGET', 'Periodic contact checks exhausted the work budget.')
            if (distance < minimumDistance) {
              overlaps = true
              break
            }
          }
          if (overlaps) break
          current.add(point, undefined)
        }
        if (overlaps) continue
        accepted = fractional
        break
      }
      if (!accepted)
        return failure(
          'PACKING_UNREACHABLE',
          'A collision-free placement was not found within the per-molecule attempt limit.',
          {
            component: index + 1,
            copy: copy + 1,
            maxAttempts
          }
        )
      const endpoints = new Map<string, BondEndpoint>()
      for (const [site, atom] of molecule.atoms.entries()) {
        const properties: Omit<MolecularAtom, 'cartesian'> & { cartesian?: Vec3 } = { ...atom }
        delete properties.cartesian
        const id = `packing:atom:${index + 1}:${copy + 1}:${site + 1}`
        const point = accepted[site]
        atoms.push({
          ...properties,
          id,
          fractional: wrapPosition(point),
          coordinateUncertainties: undefined,
          stereoParity: undefined,
          ...(atom.label === undefined
            ? {}
            : { label: `packing_${index + 1}_${copy + 1}_${atom.label}` })
        })
        occupied.add(point, undefined)
        endpoints.set(atom.id, {
          sourceAtomId: id,
          symmetryOperationId: IDENTITY_OPERATION.id,
          integerCellOffset: [Math.floor(point[0]), Math.floor(point[1]), Math.floor(point[2])]
        })
        atomMapping.push({ id, origins: [{ input, sourceId: atom.id }] })
      }
      for (const [position, bond] of molecule.bonds.entries()) {
        const id = `packing:bond:${index + 1}:${copy + 1}:${position + 1}`
        const a = endpoints.get(bond.endpoints[0].sourceAtomId)!
        const b = endpoints.get(bond.endpoints[1].sourceAtomId)!
        const shift = subtract(b.integerCellOffset, a.integerCellOffset)
        if (!isIntegerVector(shift))
          return failure(
            'PACKING_BOND_RANGE',
            'A periodic bond translation is outside safe integer range.'
          )
        bonds.push({
          ...bond,
          id,
          stereo: undefined,
          endpoints: [
            { ...a, integerCellOffset: [0, 0, 0] },
            { ...b, integerCellOffset: shift }
          ]
        })
        bondMapping.push({ id, origins: [{ input, sourceId: bond.id }] })
      }
    }
  }
  return finishConstruction(
    {
      kind: 'periodic',
      cell,
      atoms,
      bonds,
      title: substrate?.title,
      symmetry: { operations: [IDENTITY_OPERATION], spaceGroup: { hallNumber: 1 } },
      metadata: outputMetadata(substrate, molecules, losses)
    },
    atomMapping,
    bondMapping,
    {
      counts,
      density: actualDensity,
      volume: volume.value,
      regionVolume,
      regionDensity,
      seed,
      minimumDistance,
      attempts,
      region: { minimum: [...region.minimum], maximum: [...region.maximum] }
    },
    [...diagnostics, ...losses]
  )
}
