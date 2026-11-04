import { createCell } from './cell'
import { finishConstruction } from './construction'
import type { ConstructionMapping, ConstructionResult } from './construction'
import { MAX_CONSTRUCTION_CHECKS, periodicBuckets } from './construction-periodic'
import {
  add,
  cross,
  dot,
  invertMatrix,
  isIntegerVector,
  isFiniteVector,
  multiplyMatrices,
  multiplyMatrixVector,
  norm,
  scale,
  subtract
} from './math'
import { transformMobility } from './mobility'
import { reciprocalPoint } from './reciprocal'
import { failure, success } from './result'
import { createSupercell } from './supercell'
import { SPECIAL_POSITION_TOLERANCE } from './symmetry'
import type {
  Cell,
  Diagnostic,
  Matrix3,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  SourceBond,
  StructureSnapshot,
  Vec3
} from './types'

export interface SlabOptions {
  readonly hkl: Vec3
  readonly termination?: number
  readonly thickness: { readonly repeats: number } | { readonly angstrom: number }
  readonly vacuum: number
}

export interface SlabTermination {
  readonly index: number
  /** Gap midpoint, in repeats of the oriented bulk cell. */
  readonly offset: number
  readonly before: readonly string[]
  readonly after: readonly string[]
}

export function surfaceFrame(cell: Cell): Matrix3 {
  const [a, b] = cell.basis
  const tangent = scale(a, 1 / norm(a))
  const crossProduct = cross(tangent, scale(b, 1 / norm(b)))
  const normal = scale(crossProduct, 1 / norm(crossProduct))
  return [tangent, cross(normal, tangent), normal]
}

function bezout(a: number, b: number): readonly [number, number, number] {
  let u = Math.abs(a),
    v = Math.abs(b),
    x = 1,
    y = 0,
    s = 0,
    t = 1
  while (v) {
    const quotient = Math.floor(u / v)
    ;[u, v] = [v, u - quotient * v]
    ;[x, s] = [s, x - quotient * s]
    ;[y, t] = [t, y - quotient * t]
  }
  return [u, x * Math.sign(a), y * Math.sign(b)]
}

function orientedBasis(hkl: Vec3): ScientificResult<{ hkl: Vec3; matrix: Matrix3 }> {
  if (!isIntegerVector(hkl) || hkl.some((value) => Math.abs(value) > 10_000) || !hkl.some(Boolean))
    return failure('SLAB_MILLER', 'Use a nonzero Miller triple of integers from −10,000 to 10,000.')
  const [ab] = bezout(hkl[0], hkl[1])
  const [common] = bezout(ab, hkl[2])
  const [h, k, l] = scale(hkl, 1 / common).map(Math.round) as unknown as Vec3
  const [g, x, y] = bezout(h, k)
  const pivot: Vec3 = g ? [x, y, 0] : [1, 0, 0]
  const first: Vec3 = g ? [-k / g, h / g, 0] : [0, 1, 0]
  const [, s, t] = bezout(g, l)
  const second: Vec3 = [-l * pivot[0], -l * pivot[1], g]
  const transverse: Vec3 = [s * pivot[0], s * pivot[1], t]
  return success({ hkl: [h, k, l], matrix: [first, second, transverse] })
}

function planeGroups<T>(
  entries: readonly T[],
  project: (entry: T) => number,
  tolerance: number
): { phase: number; sites: T[] }[] {
  const layers: { phase: number; sites: T[] }[] = []
  for (const entry of [...entries].sort((a, b) => project(a) - project(b))) {
    const phase = project(entry)
    const previous = layers.at(-1)
    if (previous && phase - previous.phase <= tolerance) previous.sites.push(entry)
    else layers.push({ phase, sites: [entry] })
  }
  return layers
}

function prepareSlab(snapshot: StructureSnapshot, hkl: Vec3) {
  if (snapshot?.kind !== 'periodic' || !snapshot.atoms?.length)
    return failure('SLAB_SOURCE', 'Slab construction requires a nonempty periodic source.')
  const transform = orientedBasis(hkl)
  if (!transform.ok) return transform
  const normalPoint = reciprocalPoint(snapshot.cell, transform.value.hkl)
  if (!normalPoint.ok) return normalPoint
  const length = norm(normalPoint.value)
  const spacing = (2 * Math.PI) / length
  if (!Number.isFinite(spacing) || spacing <= 0)
    return failure('SLAB_SPACING', 'The interplanar spacing is outside finite range.')
  const oriented = createSupercell(snapshot, transform.value.matrix)
  if (!oriented.ok) return oriented
  const layers = planeGroups(
    oriented.value.snapshot.atoms,
    (atom) => atom.fractional[2],
    SPECIAL_POSITION_TOLERANCE
  )
  if (layers.length > 1 && 1 + layers[0].phase - layers.at(-1)!.phase <= SPECIAL_POSITION_TOLERANCE)
    for (const atom of layers.pop()!.sites) layers[0].sites.push(atom)
  const terminations = layers.map(({ phase, sites }, index): SlabTermination => {
    const next = layers[(index + 1) % layers.length]
    return {
      index,
      offset: ((phase + next.phase + Number(index + 1 === layers.length)) / 2) % 1,
      before: sites.map((atom) => atom.element).sort(),
      after: next.sites.map((atom) => atom.element).sort()
    }
  })
  return success(
    {
      normal: scale(normalPoint.value, 1 / length),
      spacing,
      oriented: oriented.value,
      hkl: transform.value.hkl,
      repeatTranslation: transform.value.matrix[2],
      terminations
    },
    oriented.diagnostics
  )
}

export function listSlabTerminations(
  snapshot: StructureSnapshot,
  hkl: Vec3
): ScientificResult<readonly SlabTermination[]> {
  const prepared = prepareSlab(snapshot, hkl)
  return prepared.ok ? success(prepared.value.terminations, prepared.diagnostics) : prepared
}

export function createSlab(
  snapshot: StructureSnapshot,
  options: SlabOptions
): ScientificResult<ConstructionResult<PeriodicStructureSnapshot>> {
  if (
    !options?.thickness ||
    typeof options.thickness !== 'object' ||
    !Number.isFinite(options.vacuum) ||
    options.vacuum <= 0
  )
    return failure('SLAB_VACUUM', 'Slabs require a thickness and positive vacuum in angstroms.')
  const prepared = prepareSlab(snapshot, options.hkl)
  if (!prepared.ok) return prepared
  const { normal, oriented, spacing, terminations, hkl, repeatTranslation } = prepared.value
  const thickness =
    'repeats' in options.thickness
      ? Number.isSafeInteger(options.thickness.repeats)
        ? options.thickness.repeats
        : 0
      : options.thickness.angstrom / spacing
  if (!Number.isFinite(thickness) || thickness <= 0 || thickness > 100_000)
    return failure('SLAB_THICKNESS', 'Thickness must be positive and at most 100,000 repeats.')
  const termination = terminations[options.termination ?? 0]
  if (!termination) return failure('SLAB_TERMINATION', 'Select an available termination gap.')
  const start = termination.offset,
    end = start + thickness
  const source = oriented.snapshot
  const sites: { atom: PeriodicAtom; repeat: number; phase: number }[] = []
  let minimum = Infinity,
    maximum = -Infinity
  for (const atom of source.atoms) {
    const phase = atom.fractional[2]
    for (let repeat = Math.ceil(start - phase); repeat < Math.ceil(end - phase); repeat++) {
      const position = phase + repeat
      minimum = Math.min(minimum, position)
      maximum = Math.max(maximum, position)
      if (sites.length === 100_000)
        return failure('SLAB_BUDGET', 'The slab exceeds 100,000 output atoms.')
      sites.push({ atom, repeat, phase: position })
    }
  }
  if (!sites.length) return failure('SLAB_EMPTY', 'The cut interval contains no atom sites.')
  const occupiedThickness = (maximum - minimum) * spacing
  const cell = createCell({
    basis: [
      source.cell.basis[0],
      source.cell.basis[1],
      scale(normal, occupiedThickness + options.vacuum)
    ]
  })
  if (!cell.ok) return cell
  const inverse = invertMatrix(cell.value.basis)!
  const transform = multiplyMatrices(inverse, source.cell.basis)
  const shift = multiplyMatrixVector(inverse, scale(normal, options.vacuum / 2 - minimum * spacing))
  const atoms: PeriodicAtom[] = []
  const atomMapping: ConstructionMapping[] = []
  const bondMapping: ConstructionMapping[] = []
  const byId = new Map(oriented.atomMapping.map((entry) => [entry.atomId, entry.equivalentSources]))
  const sourceBondIds = new Map(
    oriented.bondMapping.map((entry) => [entry.bondId, entry.sourceBondId])
  )
  const copies = new Map<string, Map<number, string>>()
  const diagnostics: Diagnostic[] = [...prepared.diagnostics]
  if (source.cell.parameterUncertainties)
    diagnostics.push({
      severity: 'warning',
      code: 'EDIT_CELL_UNCERTAINTY_CLEARED',
      message: 'Slab construction changes the original cell measurement.'
    })
  for (const { atom, repeat, phase } of sites) {
    const id = `slab:${atom.id}:${repeat}`
    const mobility = transformMobility(atom.movable, transform, atom.id)
    if (!mobility.ok) return mobility
    const position: Vec3 = [atom.fractional[0], atom.fractional[1], phase]
    const fractional = add(multiplyMatrixVector(transform, position), shift)
    if (!isFiniteVector(fractional))
      return failure('SLAB_POSITION', 'The slab contains a position outside finite range.')
    atoms.push({
      ...atom,
      id,
      fractional,
      movable: mobility.value,
      label: atom.label === undefined ? undefined : `${atom.label}_${repeat}`
    })
    const oldTranslation = scale(repeatTranslation, repeat)
    atomMapping.push({
      id,
      origins: byId.get(atom.id)!.map((endpoint) => ({
        input: 'bulk',
        sourceId: endpoint.sourceAtomId,
        endpoint: {
          ...endpoint,
          integerCellOffset: add(endpoint.integerCellOffset, oldTranslation)
        }
      }))
    })
    const copiesOfSite = copies.get(atom.id) ?? new Map<number, string>()
    copiesOfSite.set(repeat, id)
    copies.set(atom.id, copiesOfSite)
  }
  const buckets = periodicBuckets<string>(cell.value, inverse, 1e-6)
  const budget = { remaining: MAX_CONSTRUCTION_CHECKS }
  for (const atom of atoms) {
    let overlap: string | undefined
    for (const neighbor of buckets.near(atom.fractional)) {
      const distance = buckets.distance(atom.fractional, neighbor.point, budget)
      if (distance === undefined)
        return failure('SLAB_CONTACT_BUDGET', 'Slab contact checks exceeded their bounded range.')
      if (distance < 1e-6) {
        overlap = neighbor.value
        break
      }
    }
    if (overlap) {
      diagnostics.push({
        severity: 'warning',
        code: 'SLAB_OVERLAP',
        message: 'Distinct slab sites overlap at a periodic position.',
        context: { firstAtomId: overlap, secondAtomId: atom.id }
      })
      break
    }
    buckets.add(atom.fractional, atom.id)
  }
  const bonds: SourceBond[] = []
  for (const bond of source.bonds) {
    const [left, right] = bond.endpoints
    const offset = subtract(right.integerCellOffset, left.integerCellOffset)
    const firstCopies = copies.get(left.sourceAtomId) ?? new Map<number, string>()
    const secondCopies = copies.get(right.sourceAtomId) ?? new Map<number, string>()
    let truncated = 0
    for (const [repeat, a] of firstCopies) {
      const b = secondCopies.get(repeat + offset[2])
      if (!b) {
        truncated++
        continue
      }
      if (bonds.length === 100_000)
        return failure('SLAB_BUDGET', 'The slab exceeds 100,000 output explicit bonds.')
      const id = `slab:${bond.id}:${repeat}`
      bonds.push({
        ...bond,
        id,
        endpoints: [
          { ...left, sourceAtomId: a, integerCellOffset: [0, 0, 0] },
          { ...right, sourceAtomId: b, integerCellOffset: [offset[0], offset[1], 0] }
        ]
      })
      bondMapping.push({ id, origins: [{ input: 'bulk', sourceId: sourceBondIds.get(bond.id)! }] })
    }
    for (const repeat of secondCopies.keys()) if (!firstCopies.has(repeat - offset[2])) truncated++
    if (truncated)
      diagnostics.push({
        severity: 'warning',
        code: 'SLAB_BOND_TRUNCATED',
        message: 'Slab surfaces cut an explicit source bond.',
        context: { bondId: sourceBondIds.get(bond.id)!, truncated }
      })
  }
  const layers = planeGroups(sites, (site) => site.phase, SPECIAL_POSITION_TOLERANCE)
  return finishConstruction(
    { ...source, cell: cell.value, atoms, bonds },
    atomMapping,
    bondMapping,
    {
      hkl,
      spacing,
      termination: termination.index,
      occupiedThickness,
      vacuum: options.vacuum,
      bottomElements: layers[0].sites.map(({ atom }) => atom.element).sort(),
      topElements: layers
        .at(-1)!
        .sites.map(({ atom }) => atom.element)
        .sort()
    },
    diagnostics
  )
}

/** Bottom groups are measured by actual Cartesian height above the a/b plane. */
export function slabBottomAtomIds(
  snapshot: StructureSnapshot,
  count = 1
): ScientificResult<readonly string[]> {
  if (snapshot?.kind !== 'periodic' || !snapshot.atoms?.length)
    return failure('SLAB_SOURCE', 'Bottom-plane selection requires a nonempty periodic source.')
  if (!Number.isSafeInteger(count) || count <= 0)
    return failure('SLAB_LAYER_COUNT', 'Choose a positive integer number of bottom planes.')
  const cell = createCell(snapshot.cell)
  if (!cell.ok) return cell
  const normal = surfaceFrame(cell.value)[2]
  const heights = snapshot.atoms.map((atom) => ({
    id: atom.id,
    height: dot(normal, multiplyMatrixVector(cell.value.basis, atom.fractional))
  }))
  if (heights.some(({ height }) => !Number.isFinite(height)))
    return failure('SLAB_HEIGHT', 'Projected atom positions must be finite.')
  const layers = planeGroups(heights, (atom) => atom.height, 1e-6)
  if (count > layers.length)
    return failure('SLAB_LAYER_COUNT', 'The structure contains fewer planes than requested.')
  return success(layers.slice(0, count).flatMap((layer) => layer.sites.map((atom) => atom.id)))
}
