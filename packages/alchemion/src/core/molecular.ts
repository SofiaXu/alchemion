import { finishConstruction } from './construction'
import type { ConstructionMapping, ConstructionResult } from './construction'
import { getElement } from './data'
import { add, cross, dot, isFiniteVector, norm, scale, subtract } from './math'
import { failure, failureFrom, success } from './result'
import { createStructureSnapshot } from './structure'
import type {
  AtomId,
  BondId,
  BondOrder,
  Diagnostic,
  JsonValue,
  MolecularAtom,
  MolecularStructureSnapshot,
  ScientificResult,
  SourceBond,
  Vec3
} from './types'

export interface FragmentPort {
  readonly name: string
  readonly atomId: AtomId
  readonly direction: Vec3
  readonly up?: Vec3
  readonly leavingAtomId?: AtomId
}

type Port = Omit<FragmentPort, 'name'>

export interface MolecularFragment {
  readonly snapshot: MolecularStructureSnapshot
  readonly ports: readonly FragmentPort[]
}

interface Placement {
  readonly distance: number
  readonly torsionDegrees?: number
  readonly order?: BondOrder
}

export interface AttachFragmentOptions extends Placement {
  readonly target: Port
  readonly port: string
}

const ATOM_LIMIT = 10_000
const BOND_LIMIT = 100_000
const bondOrders: readonly BondOrder[] = ['single', 'double', 'triple', 'aromatic']
const formatMetadata = (
  metadata: MolecularStructureSnapshot['metadata']
): Readonly<Record<string, JsonValue>> => {
  const format = metadata?.alchemionFormats
  return format && typeof format === 'object' && !Array.isArray(format)
    ? (format as Readonly<Record<string, JsonValue>>)
    : {}
}
const formatLosses = (format: Readonly<Record<string, JsonValue>>): readonly JsonValue[] =>
  format.schemaVersion === 1 && Array.isArray(format.losses) ? format.losses : []
const endpoint = (sourceAtomId: AtomId) => ({
  sourceAtomId,
  symmetryOperationId: 'identity',
  integerCellOffset: [0, 0, 0] as const
})

type Frame = readonly [Vec3, Vec3, Vec3]

function unit(vector: Vec3): Vec3 | undefined {
  const length = norm(vector)
  if (!Number.isFinite(length) || length <= 0) return undefined
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function frame(direction: Vec3, up?: Vec3): Frame | undefined {
  if (!isFiniteVector(direction) || (up !== undefined && !isFiniteVector(up))) return undefined
  const axis = unit(direction)
  if (!axis) return undefined
  const reference: Vec3 =
    up ??
    (Math.abs(axis[0]) <= Math.min(Math.abs(axis[1]), Math.abs(axis[2]))
      ? [1, 0, 0]
      : Math.abs(axis[1]) <= Math.abs(axis[2])
        ? [0, 1, 0]
        : [0, 0, 1])
  const normalized = unit(reference)
  if (!normalized) return undefined
  const normal = cross(axis, normalized)
  if (norm(normal) < 1e-12) return undefined
  const third = unit(normal)!
  return [axis, cross(third, axis), third]
}

function rotate(vector: Vec3, from: Frame, to: Frame): Vec3 {
  return add(
    add(scale(to[0], dot(from[0], vector)), scale(to[1], dot(from[1], vector))),
    scale(to[2], dot(from[2], vector))
  )
}

function molecularSnapshot(
  input: MolecularStructureSnapshot
): ScientificResult<MolecularStructureSnapshot> {
  if (input?.kind !== 'molecular')
    return failure('MOLECULAR_STRUCTURE', 'A molecular snapshot is required.')
  const result = createStructureSnapshot(input)
  return result.ok
    ? success(result.value as MolecularStructureSnapshot, result.diagnostics)
    : result
}

function adjacency(bonds: readonly SourceBond[]): Map<AtomId, Set<BondId>> {
  const index = new Map<AtomId, Set<BondId>>()
  for (const bond of bonds) {
    for (const { sourceAtomId } of bond.endpoints) {
      const entries = index.get(sourceAtomId) ?? new Set<BondId>()
      entries.add(bond.id)
      index.set(sourceAtomId, entries)
    }
  }
  return index
}

function terminalBond(
  port: Port,
  neighbors: ReadonlyMap<AtomId, ReadonlySet<BondId>>,
  bonds: ReadonlyMap<BondId, SourceBond>
): SourceBond | undefined {
  if (!port.leavingAtomId || port.leavingAtomId === port.atomId) return undefined
  const ids = neighbors.get(port.leavingAtomId)
  if (ids?.size !== 1) return undefined
  const bond = bonds.get(ids.values().next().value!)
  return bond?.endpoints.some((entry) => entry.sourceAtomId === port.atomId) ? bond : undefined
}

export interface PreparedFragment {
  readonly snapshot: MolecularStructureSnapshot
  readonly atoms: ReadonlyMap<AtomId, MolecularAtom>
  readonly ports: ReadonlyMap<string, Port>
}

export function prepareFragment(fragment: MolecularFragment): ScientificResult<PreparedFragment> {
  const checked = molecularSnapshot(fragment?.snapshot)
  if (!checked.ok) return checked
  const { atoms, bonds } = checked.value
  if (!atoms.length || atoms.length > ATOM_LIMIT || bonds.length > BOND_LIMIT)
    return failure(
      'FRAGMENT_BUDGET',
      'A fragment needs atoms and must fit the construction budget.'
    )
  if (
    !Array.isArray(fragment.ports) ||
    !fragment.ports.length ||
    fragment.ports.length > ATOM_LIMIT
  )
    return failure('FRAGMENT_PORTS', 'A fragment needs a bounded set of named ports.')
  const atomIndex = new Map(atoms.map((atom) => [atom.id, atom]))
  const bondIndex = new Map(bonds.map((bond) => [bond.id, bond]))
  const neighbors = adjacency(bonds)
  const ports = new Map<string, Port>()
  const leaves = new Set<AtomId>()
  for (const port of fragment.ports) {
    if (
      !port ||
      typeof port.name !== 'string' ||
      !port.name.trim() ||
      ports.has(port.name) ||
      !atomIndex.has(port.atomId) ||
      !frame(port.direction, port.up)
    )
      return failure('FRAGMENT_PORT', 'Port names must be unique with a valid anchor and frame.')
    if (port.leavingAtomId !== undefined) {
      if (leaves.has(port.leavingAtomId) || !terminalBond(port, neighbors, bondIndex))
        return failure(
          'FRAGMENT_LEAVING_ATOM',
          'A port leaving atom must be unique and terminal.',
          {
            port: port.name
          }
        )
      leaves.add(port.leavingAtomId)
    }
    ports.set(port.name, port)
  }
  if ([...ports.values()].some((port) => leaves.has(port.atomId)))
    return failure('FRAGMENT_LEAVING_ATOM', 'A leaving atom cannot anchor another port.')
  return success({ snapshot: checked.value, atoms: atomIndex, ports }, checked.diagnostics)
}

/** A private, isolated draft shared by pairwise fragment insertion and whole-polymer assembly. */
export class MolecularAssembly {
  readonly atoms = new Map<AtomId, MolecularAtom>()
  readonly bonds = new Map<BondId, SourceBond>()
  readonly diagnostics: Diagnostic[] = []
  private readonly atomOrigins = new Map<AtomId, ConstructionMapping>()
  private readonly bondOrigins = new Map<BondId, ConstructionMapping>()
  private readonly neighbors: Map<AtomId, Set<BondId>>
  private readonly inheritedFragmentLosses = new Set<JsonValue>()
  private atomSequence = 0
  private bondSequence = 0

  constructor(
    private readonly base: MolecularStructureSnapshot,
    input = 'base'
  ) {
    for (const atom of base.atoms) {
      this.atoms.set(atom.id, atom)
      this.atomOrigins.set(atom.id, { id: atom.id, origins: [{ input, sourceId: atom.id }] })
    }
    for (const bond of base.bonds) {
      this.bonds.set(bond.id, bond)
      this.bondOrigins.set(bond.id, { id: bond.id, origins: [{ input, sourceId: bond.id }] })
    }
    this.neighbors = adjacency(base.bonds)
  }

  addAtom(atom: Omit<MolecularAtom, 'id'>, sourceId: string, input: string): AtomId {
    let id: AtomId
    do id = `modeling:atom:${++this.atomSequence}`
    while (this.atoms.has(id))
    this.atoms.set(id, { ...atom, id })
    this.atomOrigins.set(id, { id, origins: [{ input, sourceId }] })
    return id
  }

  addBond(bond: Omit<SourceBond, 'id'>, sourceId?: string, input?: string): BondId {
    let id: BondId
    do id = `modeling:bond:${++this.bondSequence}`
    while (this.bonds.has(id))
    this.bonds.set(id, { ...bond, id })
    this.bondOrigins.set(id, { id, origins: sourceId && input ? [{ input, sourceId }] : [] })
    for (const { sourceAtomId } of bond.endpoints) {
      const entries = this.neighbors.get(sourceAtomId) ?? new Set<BondId>()
      entries.add(id)
      this.neighbors.set(sourceAtomId, entries)
    }
    return id
  }

  private clearParity(id: AtomId) {
    const atom = this.atoms.get(id)!
    if (!atom.stereoParity) return
    this.atoms.set(id, { ...atom, stereoParity: undefined })
    this.diagnostics.push({
      severity: 'warning',
      code: 'FRAGMENT_STEREO_PARITY_CLEARED',
      message: 'Connecting at a port changed the atom’s explicit stereo references.',
      context: { atomId: id }
    })
  }

  private removeLeavingAtom(port: Port, bond: SourceBond) {
    const id = port.leavingAtomId!
    this.atoms.delete(id)
    this.atomOrigins.delete(id)
    this.bonds.delete(bond.id)
    this.bondOrigins.delete(bond.id)
    this.neighbors.delete(id)
    this.neighbors.get(port.atomId)!.delete(bond.id)
  }

  /** Add an incoming piece using its current directions and a proper rigid transform. */
  attach(
    target: Port,
    fragment: PreparedFragment,
    portName: string,
    placement: Placement,
    input: string
  ): ScientificResult<Map<string, Port>> {
    const targetAtom = this.atoms.get(target?.atomId)
    const targetFrame = target && frame(target.direction, target.up)
    const port = fragment.ports.get(portName)
    if (!targetAtom || !targetFrame || !port)
      return failure('FRAGMENT_PORT', 'The target and fragment must identify valid ports.')
    const distance = placement?.distance
    const torsion = placement?.torsionDegrees ?? 0
    const order = placement?.order ?? 'single'
    if (
      !Number.isFinite(distance) ||
      distance <= 0 ||
      !Number.isFinite(torsion) ||
      !bondOrders.includes(order)
    )
      return failure(
        'FRAGMENT_PLACEMENT',
        'Specify a positive distance, finite torsion and known bond order.'
      )
    const leavingBond = terminalBond(target, this.neighbors, this.bonds)
    if (target.leavingAtomId !== undefined && !leavingBond)
      return failure(
        'FRAGMENT_LEAVING_ATOM',
        'The target leaving atom must be terminal and bonded to the anchor.'
      )
    const atomCount =
      this.atoms.size +
      fragment.atoms.size -
      Number(Boolean(leavingBond)) -
      Number(Boolean(port.leavingAtomId))
    const bondCount =
      this.bonds.size +
      fragment.snapshot.bonds.length +
      1 -
      Number(Boolean(leavingBond)) -
      Number(Boolean(port.leavingAtomId))
    if (atomCount > ATOM_LIMIT || bondCount > BOND_LIMIT)
      return failure('MOLECULAR_BUDGET', 'Molecular construction exceeds the atom or bond budget.')

    const sourceFrame = frame(port.direction, port.up)!
    const angle = ((torsion % 360) * Math.PI) / 180
    const axis = targetFrame[0]
    const second = add(
      scale(targetFrame[1], Math.cos(angle)),
      scale(targetFrame[2], Math.sin(angle))
    )
    const reverse = scale(axis, -1)
    const destination: Frame = [reverse, second, cross(reverse, second)]
    const transform = (vector: Vec3) => rotate(vector, sourceFrame, destination)
    const anchor = fragment.atoms.get(port.atomId)!.cartesian
    const origin = add(targetAtom.cartesian, scale(axis, distance))
    if (!isFiniteVector(origin) || norm(subtract(origin, targetAtom.cartesian)) === 0)
      return failure(
        'FRAGMENT_POSITION_RANGE',
        'The placed anchor cannot represent the requested separation.'
      )
    const mapped = new Map<AtomId, AtomId>()
    for (const atom of fragment.snapshot.atoms) {
      if (atom.id === port.leavingAtomId) continue
      const position = add(origin, transform(subtract(atom.cartesian, anchor)))
      const id = this.addAtom(
        { ...atom, cartesian: position, coordinateUncertainties: undefined },
        atom.id,
        input
      )
      mapped.set(atom.id, id)
    }
    for (const atom of fragment.snapshot.atoms) {
      if (atom.id === port.leavingAtomId || !atom.stereoParity) continue
      const id = mapped.get(atom.id)!
      const references = atom.stereoParity.referenceAtoms.map((ref) =>
        ref === null ? null : mapped.get(ref)
      )
      if (references.some((ref) => ref === undefined)) this.clearParity(id)
      else
        this.atoms.set(id, {
          ...this.atoms.get(id)!,
          stereoParity: { ...atom.stereoParity, referenceAtoms: references as (AtomId | null)[] }
        })
    }
    for (const bond of fragment.snapshot.bonds) {
      const a = mapped.get(bond.endpoints[0].sourceAtomId)
      const b = mapped.get(bond.endpoints[1].sourceAtomId)
      if (a !== undefined && b !== undefined)
        this.addBond({ ...bond, endpoints: [endpoint(a), endpoint(b)] }, bond.id, input)
    }
    if (leavingBond) this.removeLeavingAtom(target, leavingBond)
    const incomingAnchor = mapped.get(port.atomId)!
    this.clearParity(target.atomId)
    this.clearParity(incomingAnchor)
    this.addBond({ endpoints: [endpoint(target.atomId), endpoint(incomingAnchor)], order })
    if (fragment.snapshot.atoms.some((atom) => atom.coordinateUncertainties !== undefined))
      this.diagnostics.push({
        severity: 'warning',
        code: 'EDIT_COORDINATE_UNCERTAINTY_CLEARED',
        message: 'Rigid placement changed the input fragment’s measurement frame.',
        context: { input }
      })
    if (fragment.snapshot.stereoAbsolute === true && this.base.stereoAbsolute !== true)
      this.diagnostics.push({
        severity: 'warning',
        code: 'FRAGMENT_STEREO_FLAG_LOSS',
        message: 'A fragment’s molecule-wide absolute stereo flag does not replace the host flag.',
        context: { input }
      })
    for (const loss of formatLosses(formatMetadata(fragment.snapshot.metadata)))
      this.inheritedFragmentLosses.add(loss)
    const ports = new Map<string, Port>()
    for (const [name, remaining] of fragment.ports) {
      if (name === portName) continue
      ports.set(name, {
        atomId: mapped.get(remaining.atomId)!,
        direction: transform(remaining.direction),
        ...(remaining.up ? { up: transform(remaining.up) } : {}),
        ...(remaining.leavingAtomId ? { leavingAtomId: mapped.get(remaining.leavingAtomId)! } : {})
      })
    }
    return success(ports)
  }

  finish(
    parameters: Readonly<Record<string, JsonValue>>,
    title?: string,
    metadata = this.base.metadata
  ) {
    if (this.inheritedFragmentLosses.size) {
      const format = formatMetadata(metadata)
      metadata = {
        ...metadata,
        alchemionFormats: {
          ...format,
          schemaVersion: 1,
          losses: [...formatLosses(format), ...this.inheritedFragmentLosses]
        }
      }
    }
    return finishConstruction(
      {
        ...this.base,
        ...(title !== undefined ? { title } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        atoms: [...this.atoms.values()],
        bonds: [...this.bonds.values()]
      },
      [...this.atomOrigins.values()],
      [...this.bondOrigins.values()],
      parameters,
      this.diagnostics
    )
  }
}

export function attachFragment(
  base: MolecularStructureSnapshot,
  fragment: MolecularFragment,
  options: AttachFragmentOptions
): ScientificResult<ConstructionResult<MolecularStructureSnapshot>> {
  const checked = molecularSnapshot(base)
  if (!checked.ok) return checked
  const incoming = prepareFragment(fragment)
  if (!incoming.ok) return incoming
  const assembly = new MolecularAssembly(checked.value)
  assembly.diagnostics.push(...checked.diagnostics, ...incoming.diagnostics)
  const joined = assembly.attach(
    options?.target,
    incoming.value,
    options?.port,
    options,
    'fragment'
  )
  if (!joined.ok) return failureFrom([...assembly.diagnostics, ...joined.diagnostics])
  return assembly.finish({
    kind: 'fragment',
    port: options.port,
    distance: options.distance,
    order: options.order ?? 'single',
    torsionDegrees: options.torsionDegrees ?? 0
  })
}

const valences: Readonly<Record<string, Readonly<Partial<Record<number, number>>>>> = {
  H: { [-1]: 0, 0: 1, 1: 0 },
  C: { 0: 4 },
  N: { [-1]: 2, 0: 3, 1: 4 },
  O: { [-1]: 1, 0: 2, 1: 3 },
  F: { [-1]: 0, 0: 1 },
  Cl: { [-1]: 0, 0: 1 },
  Br: { [-1]: 0, 0: 1 },
  I: { [-1]: 0, 0: 1 }
}

const bondValences: Readonly<Record<BondOrder, number>> = {
  single: 1,
  double: 2,
  triple: 3,
  aromatic: 1.5
}

interface Neighbor {
  readonly atomId: AtomId
  readonly order: BondOrder
}

function benzeneLike(
  start: AtomId,
  atoms: ReadonlyMap<AtomId, MolecularAtom>,
  neighbors: ReadonlyMap<AtomId, readonly Neighbor[]>
): boolean {
  const visited = new Set<AtomId>()
  let previous: AtomId | undefined
  let current = start
  for (let step = 0; step < 6; step++) {
    const atom = atoms.get(current)!
    if (
      visited.has(current) ||
      atom.element !== 'C' ||
      (atom.formalCharge ?? 0) !== 0 ||
      atom.radical
    )
      return false
    visited.add(current)
    const edges = neighbors.get(current) ?? []
    const aromatic = edges.filter((neighbor) => neighbor.order === 'aromatic')
    const external = edges.filter((neighbor) => neighbor.order !== 'aromatic')
    if (
      aromatic.length !== 2 ||
      aromatic[0].atomId === aromatic[1].atomId ||
      external.length > 1 ||
      external.some((neighbor) => neighbor.order !== 'single')
    )
      return false
    const next = aromatic.find((neighbor) => neighbor.atomId !== previous)!.atomId
    previous = current
    current = next
  }
  return current === start
}

function hydrogenDirections(occupied: Vec3[], count: number, tetrahedral: boolean): Vec3[] {
  const siteCount = tetrahedral ? 4 : occupied.length + count
  if (count === 1 && occupied.length > 1) {
    const opposite = unit(scale(occupied.reduce(add, [0, 0, 0]), -1))
    if (opposite) return [opposite]
  }
  const [axis, across, normal] =
    frame(occupied[0] ?? [1, 0, 0], occupied[1]) ?? frame(occupied[0] ?? [1, 0, 0])!
  const candidates = [axis, scale(axis, -1)]
  if (siteCount === 3) {
    candidates.push(add(scale(axis, -0.5), scale(across, Math.sqrt(3) / 2)))
    candidates.push(add(scale(axis, -0.5), scale(across, -Math.sqrt(3) / 2)))
  } else if (siteCount >= 4) {
    for (let index = 0; index < 3; index++) {
      const angle = (index * 2 * Math.PI) / 3
      const radial = add(scale(across, Math.cos(angle)), scale(normal, Math.sin(angle)))
      candidates.push(add(scale(axis, -1 / 3), scale(radial, Math.sqrt(8 / 9))))
    }
    if (occupied.length <= 1)
      return candidates
        .filter((_, index) => index > 1 || (!occupied.length && index === 0))
        .slice(0, count)
  }
  if (siteCount === 3 && occupied.length <= 1)
    return candidates
      .filter((_, index) => index > 1 || (!occupied.length && index === 0))
      .slice(0, count)
  candidates.push(across, scale(across, -1), normal, scale(normal, -1))
  const result: Vec3[] = []
  while (result.length < count) {
    const used = [...occupied, ...result]
    let best = 0
    let leastOverlap = Infinity
    for (let i = 0; i < candidates.length; i++) {
      const overlap = Math.max(...used.map((vector) => dot(vector, candidates[i])))
      if (i === 0 || overlap < leastOverlap) {
        best = i
        leastOverlap = overlap
      }
    }
    result.push(candidates.splice(best, 1)[0])
  }
  return result
}

/** Fill only unambiguous valences using explicit bonds and idealized initial coordinates. */
export function addHydrogens(
  base: MolecularStructureSnapshot,
  atomIds?: readonly AtomId[]
): ScientificResult<ConstructionResult<MolecularStructureSnapshot>> {
  const checked = molecularSnapshot(base)
  if (!checked.ok) return checked
  if (atomIds !== undefined && !Array.isArray(atomIds))
    return failure('HYDROGEN_ATOMS', 'Specify the selected source atom IDs as an array.')
  const assembly = new MolecularAssembly(checked.value)
  assembly.diagnostics.push(...checked.diagnostics)
  const selected = new Set(atomIds ?? checked.value.atoms.map((atom) => atom.id))
  const neighbors = new Map<AtomId, Neighbor[]>()
  for (const bond of checked.value.bonds) {
    const [a, b] = bond.endpoints.map((entry) => entry.sourceAtomId)
    for (const [source, other] of [
      [a, b],
      [b, a]
    ]) {
      const entries = neighbors.get(source) ?? []
      entries.push({ atomId: other, order: bond.order })
      neighbors.set(source, entries)
    }
  }
  for (const atomId of selected) {
    const atom = assembly.atoms.get(atomId)
    if (!atom)
      return failure(
        'HYDROGEN_ATOM_MISSING',
        'Hydrogen addition requires an existing source atom.',
        { atomId }
      )
    const valence = valences[atom.element]?.[atom.formalCharge ?? 0]
    const edges = neighbors.get(atomId) ?? []
    if (
      valence === undefined ||
      atom.radical ||
      atom.occupancy?.kind !== 'known' ||
      atom.occupancy.value !== 1 ||
      new Set(edges.map((neighbor) => neighbor.atomId)).size !== edges.length ||
      (edges.some((neighbor) => neighbor.order === 'aromatic') &&
        !benzeneLike(atomId, assembly.atoms, neighbors))
    )
      return failure(
        'HYDROGEN_VALENCE_UNSUPPORTED',
        'This atom’s explicit chemistry does not specify an unambiguous supported valence.',
        { atomId }
      )
    const missing = valence - edges.reduce((sum, neighbor) => sum + bondValences[neighbor.order], 0)
    const implicitParity = atom.stereoParity?.referenceAtoms.includes(null)
    if (!Number.isInteger(missing) || missing < 0 || (implicitParity && missing !== 1))
      return failure(
        'HYDROGEN_VALENCE_CONFLICT',
        'Explicit bonds and stereo references conflict with the supported valence.',
        { atomId }
      )
    if (missing === 0 || atom.element === 'H') continue
    if (assembly.atoms.size + missing > ATOM_LIMIT || assembly.bonds.size + missing > BOND_LIMIT)
      return failure('MOLECULAR_BUDGET', 'Molecular construction exceeds the atom or bond budget.')
    const directions = edges.map((neighbor) =>
      unit(subtract(assembly.atoms.get(neighbor.atomId)!.cartesian, atom.cartesian))
    )
    if (directions.some((direction) => direction === undefined))
      return failure(
        'HYDROGEN_GEOMETRY',
        'A coincident or nonfinite bond direction prevents hydrogen placement.',
        { atomId }
      )
    const radius = getElement(atom.element)?.covalentRadius?.value
    if (radius === undefined)
      return failure(
        'HYDROGEN_RADIUS',
        'No covalent radius is available for this hydrogen placement.',
        { atomId }
      )
    const distance = radius + getElement('H')!.covalentRadius!.value
    const tetrahedral =
      ['N', 'O'].includes(atom.element) && edges.every(({ order }) => order === 'single')
    for (const direction of hydrogenDirections(directions as Vec3[], missing, tetrahedral)) {
      const id = assembly.addAtom(
        {
          element: 'H',
          cartesian: add(atom.cartesian, scale(direction, distance)),
          occupancy: { kind: 'known', value: 1 }
        },
        atomId,
        'base'
      )
      assembly.addBond({ endpoints: [endpoint(atomId), endpoint(id)], order: 'single' })
      if (implicitParity)
        assembly.atoms.set(atomId, {
          ...atom,
          stereoParity: {
            ...atom.stereoParity!,
            referenceAtoms: atom.stereoParity!.referenceAtoms.map((ref) => ref ?? id)
          }
        })
    }
  }
  return assembly.finish({ kind: 'hydrogens', selectedAtomCount: selected.size })
}

function template(
  title: string,
  atomData: readonly (readonly [AtomId, string, Vec3])[],
  connections: readonly (readonly [AtomId, AtomId])[],
  ports: readonly FragmentPort[]
): MolecularFragment {
  const snapshot = molecularSnapshot({
    kind: 'molecular',
    title,
    atoms: atomData.map(([id, element, cartesian]) => ({
      id,
      element,
      cartesian,
      occupancy: { kind: 'known', value: 1 }
    })),
    bonds: connections.map(([a, b], i) => ({
      id: `bond${i + 1}`,
      order: 'single',
      endpoints: [endpoint(a), endpoint(b)]
    }))
  })
  if (!snapshot.ok) throw new Error(`Invalid built-in molecular fragment: ${title}`)
  return Object.freeze({
    snapshot: snapshot.value,
    ports: Object.freeze(
      ports.map((port) =>
        Object.freeze({
          ...port,
          direction: Object.freeze(port.direction),
          ...(port.up ? { up: Object.freeze(port.up) } : {})
        })
      )
    )
  })
}

const left: Vec3 = [-1, 0, 0]
const zero: Vec3 = [0, 0, 0]
const attachment = (atomId: AtomId): readonly FragmentPort[] => [
  { name: 'attach', atomId, direction: left }
]

export const BUILT_IN_FRAGMENTS = Object.freeze({
  methyl: template(
    'Methyl',
    [
      ['C', 'C', zero],
      ['H1', 'H', [0.36, 1.03, 0]],
      ['H2', 'H', [0.36, -0.515, 0.892]],
      ['H3', 'H', [0.36, -0.515, -0.892]]
    ],
    [
      ['C', 'H1'],
      ['C', 'H2'],
      ['C', 'H3']
    ],
    attachment('C')
  ),
  hydroxyl: template(
    'Hydroxyl',
    [
      ['O', 'O', zero],
      ['H', 'H', [0.25, 0.93, 0]]
    ],
    [['O', 'H']],
    attachment('O')
  ),
  amino: template(
    'Amino',
    [
      ['N', 'N', zero],
      ['H1', 'H', [0.34, 0.48, 0.82]],
      ['H2', 'H', [0.34, 0.48, -0.82]]
    ],
    [
      ['N', 'H1'],
      ['N', 'H2']
    ],
    attachment('N')
  ),
  ethylene: template(
    'Ethylene repeat',
    [
      ['C1', 'C', zero],
      ['C2', 'C', [1.54, 0, 0]],
      ['H1', 'H', [-0.36, -0.51, 0.89]],
      ['H2', 'H', [-0.36, -0.51, -0.89]],
      ['H3', 'H', [1.9, 0.51, 0.89]],
      ['H4', 'H', [1.9, 0.51, -0.89]]
    ],
    [
      ['C1', 'C2'],
      ['C1', 'H1'],
      ['C1', 'H2'],
      ['C2', 'H3'],
      ['C2', 'H4']
    ],
    [
      { name: 'head', atomId: 'C1', direction: [-1 / 3, Math.sqrt(8 / 9), 0], up: [0, 0, 1] },
      { name: 'tail', atomId: 'C2', direction: [1 / 3, -Math.sqrt(8 / 9), 0], up: [0, 0, 1] }
    ]
  ),
  branch: template(
    'Methine branch',
    [
      ['C', 'C', zero],
      ['H', 'H', [-0.63, -0.63, 0.63]]
    ],
    [['C', 'H']],
    [
      { name: 'head', atomId: 'C', direction: [-1, 1, -1], up: [0, 0, 1] },
      { name: 'tail', atomId: 'C', direction: [1, -1, -1], up: [0, 0, 1] },
      { name: 'branch', atomId: 'C', direction: [1, 1, 1], up: [0, 0, 1] }
    ]
  ),
  hydrogen: template('Hydrogen cap', [['H', 'H', zero]], [], attachment('H'))
})
