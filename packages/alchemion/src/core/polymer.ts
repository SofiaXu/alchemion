import type { ConstructionResult } from './construction'
import { MolecularAssembly, prepareFragment } from './molecular'
import type { FragmentPort, MolecularFragment, PreparedFragment } from './molecular'
import { failure, failureFrom, success } from './result'
import type { BondOrder, JsonValue, MolecularStructureSnapshot, ScientificResult } from './types'

interface UnitCount {
  readonly unit: string
  readonly count: number
}

export type PolymerRecipe =
  | { readonly kind: 'sequence'; readonly sequence: readonly string[] }
  | { readonly kind: 'homopolymer'; readonly unit: string; readonly count: number }
  | { readonly kind: 'blocks'; readonly blocks: readonly UnitCount[] }
  | { readonly kind: 'random'; readonly counts: readonly UnitCount[]; readonly seed: number }

export interface PolymerOptions {
  readonly units: Readonly<Record<string, MolecularFragment>>
  readonly recipe: PolymerRecipe
  readonly distance?: number
  readonly torsionDegrees?: number
  readonly order?: BondOrder
  readonly branches?: readonly {
    readonly unit: string
    /** Zero-based index into the main chain, followed by previous branches. */
    readonly parent: number
    readonly parentPort: string
    readonly port?: string
  }[]
  readonly ends?: readonly {
    readonly unit: number
    readonly port: string
    readonly fragment: MolecularFragment
    readonly fragmentPort?: string
    readonly distance?: number
    readonly order?: BondOrder
    readonly torsionDegrees?: number
  }[]
}

const UNIT_LIMIT = 10_000
const isUnitName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

/** Mulberry32 with exact unsigned 32-bit state. */
function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

function expandRecipe(recipe: PolymerRecipe): ScientificResult<string[]> {
  if (recipe?.kind === 'sequence') {
    if (
      !Array.isArray(recipe.sequence) ||
      !recipe.sequence.length ||
      recipe.sequence.length > UNIT_LIMIT ||
      !recipe.sequence.every(isUnitName)
    )
      return failure(
        'POLYMER_RECIPE',
        'The polymer needs a nonempty bounded sequence of named units.'
      )
    return success([...recipe.sequence])
  }
  const counts =
    recipe?.kind === 'homopolymer'
      ? [recipe]
      : recipe?.kind === 'blocks'
        ? recipe.blocks
        : recipe?.kind === 'random'
          ? recipe.counts
          : undefined
  if (!Array.isArray(counts) || !counts.length || counts.length > UNIT_LIMIT)
    return failure('POLYMER_RECIPE', 'The polymer recipe requires a bounded set of unit counts.')
  const sequence: string[] = []
  for (const item of counts as readonly UnitCount[]) {
    if (
      !item ||
      !isUnitName(item.unit) ||
      !Number.isSafeInteger(item.count) ||
      item.count <= 0 ||
      sequence.length + item.count > UNIT_LIMIT
    )
      return failure(
        'POLYMER_RECIPE',
        'Unit counts must be positive integers within the assembly budget.'
      )
    for (let index = 0; index < item.count; index++) sequence.push(item.unit)
  }
  if (recipe.kind === 'random') {
    if (!Number.isSafeInteger(recipe.seed) || recipe.seed < 0 || recipe.seed > 0xffffffff)
      return failure('POLYMER_SEED', 'A random recipe requires an unsigned 32-bit seed.')
    const random = seededRandom(recipe.seed)
    for (let index = sequence.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      const unit = sequence[index]
      sequence[index] = sequence[other]
      sequence[other] = unit
    }
  }
  return success(sequence)
}

/** Build an explicit initial conformer; each edge consumes two ports. */
export function buildPolymer(
  options: PolymerOptions
): ScientificResult<ConstructionResult<MolecularStructureSnapshot>> {
  const recipe = expandRecipe(options?.recipe)
  if (!recipe.ok) return recipe
  if (!options.units || typeof options.units !== 'object' || Array.isArray(options.units))
    return failure('POLYMER_UNITS', 'Provide named molecular templates for the polymer recipe.')
  const branches = options.branches ?? []
  const ends = options.ends ?? []
  if (
    !Array.isArray(branches) ||
    !Array.isArray(ends) ||
    recipe.value.length + branches.length + ends.length > UNIT_LIMIT
  )
    return failure('POLYMER_BUDGET', 'The sequence, branches and caps exceed the assembly budget.')
  const distance = options.distance ?? 1.54
  const torsionDegrees = options.torsionDegrees ?? 0
  const order = options.order ?? 'single'
  if (
    !Number.isFinite(distance) ||
    distance <= 0 ||
    !Number.isFinite(torsionDegrees) ||
    !['single', 'double', 'triple', 'aromatic'].includes(order)
  )
    return failure(
      'POLYMER_PLACEMENT',
      'Specify a positive distance, finite torsion and known bond order.'
    )

  const templates = new Map<string, ScientificResult<PreparedFragment>>()
  const unitTemplate = (name: string): ScientificResult<PreparedFragment> => {
    if (!isUnitName(name) || !Object.hasOwn(options.units, name))
      return failure('POLYMER_UNIT_MISSING', 'The recipe references an unknown repeat unit.', {
        unit: name
      })
    const cached = templates.get(name)
    if (cached) return cached.ok ? success(cached.value) : cached
    const prepared = prepareFragment(options.units[name])
    templates.set(name, prepared)
    return prepared
  }

  const sequence = recipe.value
  const root = unitTemplate(sequence[0])
  if (!root.ok) return root
  const assembly = new MolecularAssembly(root.value.snapshot, 'unit:0')
  assembly.diagnostics.push(...root.diagnostics)
  const ports = [new Map(root.value.ports)]
  let openPortCount = root.value.ports.size
  const connect = (
    parent: number,
    parentPort: string,
    prepared: ScientificResult<PreparedFragment>,
    port: string,
    input: string,
    placement = { distance, torsionDegrees, order }
  ): ScientificResult<Map<string, Omit<FragmentPort, 'name'>>> => {
    if (!prepared.ok) return prepared
    const parentPorts = Number.isSafeInteger(parent) ? ports[parent] : undefined
    const target = parentPorts?.get(parentPort)
    if (!target)
      return failure(
        'POLYMER_PORT_UNAVAILABLE',
        'The recipe references a missing or already used port.',
        { unit: parent, port: parentPort }
      )
    const nextOpenPortCount = openPortCount + prepared.value.ports.size - 2
    if (nextOpenPortCount > UNIT_LIMIT)
      return failure('POLYMER_PORT_BUDGET', 'The assembly exceeds the open-port budget.')
    assembly.diagnostics.push(...prepared.diagnostics)
    const joined = assembly.attach(target, prepared.value, port, placement, input)
    if (joined.ok) {
      parentPorts!.delete(parentPort)
      openPortCount = nextOpenPortCount
    }
    return joined
  }
  for (let index = 1; index < sequence.length; index++) {
    const joined = connect(
      index - 1,
      'tail',
      unitTemplate(sequence[index]),
      'head',
      `unit:${index}`
    )
    if (!joined.ok) return failureFrom([...assembly.diagnostics, ...joined.diagnostics])
    ports.push(joined.value)
  }
  const branchRecords: JsonValue[] = []
  for (const branch of branches as NonNullable<PolymerOptions['branches']>) {
    if (
      !branch ||
      !isUnitName(branch.unit) ||
      !isUnitName(branch.parentPort) ||
      (branch.port !== undefined && !isUnitName(branch.port))
    )
      return failure('POLYMER_BRANCH', 'Each branch needs a repeat unit and named ports.')
    const unit = ports.length
    const port = branch.port ?? 'head'
    const joined = connect(
      branch.parent,
      branch.parentPort,
      unitTemplate(branch.unit),
      port,
      `unit:${unit}`
    )
    if (!joined.ok) return failureFrom([...assembly.diagnostics, ...joined.diagnostics])
    ports.push(joined.value)
    branchRecords.push({
      unit,
      template: branch.unit,
      parent: branch.parent,
      parentPort: branch.parentPort,
      port
    })
  }
  const endRecords: JsonValue[] = []
  for (const [index, end] of (ends as NonNullable<PolymerOptions['ends']>).entries()) {
    if (
      !end ||
      !isUnitName(end.port) ||
      (end.fragmentPort !== undefined && !isUnitName(end.fragmentPort))
    )
      return failure('POLYMER_END', 'Each cap needs a target port and a molecular fragment.')
    const fragmentPort = end.fragmentPort ?? 'attach'
    const placement = {
      distance: end.distance ?? distance,
      torsionDegrees: end.torsionDegrees ?? torsionDegrees,
      order: end.order ?? order
    }
    const cap = prepareFragment(end.fragment)
    if (!cap.ok) return failureFrom([...assembly.diagnostics, ...cap.diagnostics])
    if (cap.value.ports.size !== 1)
      return failure('POLYMER_END_PORTS', 'A cap must expose exactly one attachment port.')
    const joined = connect(end.unit, end.port, cap, fragmentPort, `cap:${index}`, placement)
    if (!joined.ok) return failureFrom([...assembly.diagnostics, ...joined.diagnostics])
    endRecords.push({
      unit: end.unit,
      port: end.port,
      ...(end.fragment.snapshot.title ? { fragment: end.fragment.snapshot.title } : {}),
      fragmentPort,
      ...placement
    })
  }
  const unconsumedPorts = ports.flatMap((entries, unit) =>
    [...entries.keys()].map((port) => ({ unit, port }))
  )
  if (unconsumedPorts.length)
    assembly.diagnostics.push({
      severity: 'info',
      code: 'POLYMER_OPEN_PORTS',
      message:
        'The initial conformer has unused assembly ports. Add caps if a closed topology is required.',
      context: { count: unconsumedPorts.length }
    })
  const parameters = {
    kind: 'polymer',
    schemaVersion: 1,
    recipe: options.recipe.kind,
    sequence,
    ...(options.recipe.kind === 'random' ? { seed: options.recipe.seed } : {}),
    distance,
    torsionDegrees,
    order,
    branches: branchRecords,
    ends: endRecords,
    unconsumedPorts
  }
  return assembly.finish(parameters, 'Polymer', {
    ...root.value.snapshot.metadata,
    alchemionModeling: parameters
  })
}
