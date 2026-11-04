import { failureFrom, success } from './result'
import { createStructureSnapshot } from './structure'
import type {
  BondEndpoint,
  Diagnostic,
  JsonValue,
  ScientificResult,
  StructureSnapshot,
  Vec3
} from './types'

export interface ConstructionOrigin {
  readonly input: string
  readonly sourceId: string
  readonly endpoint?: BondEndpoint
  readonly outputCellOffset?: Vec3
}

export interface ConstructionMapping {
  readonly id: string
  readonly origins: readonly ConstructionOrigin[]
}

export interface ConstructionResult<T extends StructureSnapshot = StructureSnapshot> {
  readonly snapshot: T
  readonly atoms: readonly ConstructionMapping[]
  readonly bonds: readonly ConstructionMapping[]
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly stats: {
    readonly atomCount: number
    readonly bondCount: number
    readonly composition: Readonly<Record<string, number>>
  }
}

export function constructionSnapshot<T extends StructureSnapshot>(
  result: ConstructionResult<T>
): T {
  const serialize = (entries: readonly ConstructionMapping[]) =>
    entries.map(({ id, origins }) => ({
      id,
      origins: origins.map(({ input, sourceId, endpoint, outputCellOffset }) => ({
        input,
        sourceId,
        ...(endpoint ? { endpoint: { ...endpoint } } : {}),
        ...(outputCellOffset ? { outputCellOffset } : {})
      }))
    }))
  return {
    ...result.snapshot,
    metadata: {
      ...result.snapshot.metadata,
      alchemionConstruction: {
        schemaVersion: 1,
        parameters: result.parameters,
        atoms: serialize(result.atoms),
        bonds: serialize(result.bonds)
      }
    }
  }
}

function frozenCopy<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  return Object.freeze(
    Array.isArray(value)
      ? value.map(frozenCopy)
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)]))
  ) as T
}

export function finishConstruction<T extends StructureSnapshot>(
  input: T,
  atoms: readonly ConstructionMapping[],
  bonds: readonly ConstructionMapping[],
  parameters: Readonly<Record<string, JsonValue>>,
  diagnostics: readonly Diagnostic[] = []
): ScientificResult<ConstructionResult<T>> {
  const checked = createStructureSnapshot(input)
  const allDiagnostics = [...diagnostics, ...checked.diagnostics]
  if (!checked.ok || allDiagnostics.some((diagnostic) => diagnostic.severity === 'error'))
    return failureFrom(allDiagnostics)
  const composition: Record<string, number> = {}
  for (const atom of checked.value.atoms)
    composition[atom.element] = (composition[atom.element] ?? 0) + 1
  return success(
    Object.freeze({
      snapshot: checked.value as T,
      atoms: frozenCopy(atoms),
      bonds: frozenCopy(bonds),
      parameters: frozenCopy(parameters),
      stats: Object.freeze({
        atomCount: input.atoms.length,
        bondCount: input.bonds.length,
        composition: Object.freeze(composition)
      })
    }),
    allDiagnostics
  )
}
