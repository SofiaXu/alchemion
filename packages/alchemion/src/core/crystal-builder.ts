import { createCell } from './cell'
import { finishConstruction } from './construction'
import type { ConstructionResult } from './construction'
import { deriveInstances } from './derivation'
import { failure } from './result'
import { resolveSymmetry } from './symmetry'
import type {
  Cell,
  CellParameters,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  SymmetryInformation
} from './types'

export interface CrystalOptions {
  readonly cell: Cell | CellParameters
  readonly atoms: readonly PeriodicAtom[]
  readonly symmetry?: SymmetryInformation
  readonly title?: string
}

/** Create a crystal from asymmetric-unit sites in an explicit setting. */
export function createCrystal(
  options: CrystalOptions
): ScientificResult<ConstructionResult<PeriodicStructureSnapshot>> {
  if (!options || !Array.isArray(options.atoms) || options.atoms.length === 0)
    return failure('CRYSTAL_SITES', 'At least one source site is required.')
  const cell = createCell(options.cell)
  if (!cell.ok) return cell
  const symmetry = options.symmetry ?? { spaceGroup: { hallNumber: 1 } }
  const operations = resolveSymmetry(symmetry, cell.value)
  if (!operations.ok) return operations
  if (options.atoms.length * operations.value.length > 100_000)
    return failure('CRYSTAL_BUDGET', 'The site and operation product exceeds 100,000.')
  const snapshot: PeriodicStructureSnapshot = {
    kind: 'periodic',
    title: options.title,
    cell: cell.value,
    symmetry,
    atoms: options.atoms,
    bonds: []
  }
  const instances = deriveInstances(snapshot)
  if (!instances.ok) return instances
  return finishConstruction(
    snapshot,
    options.atoms.map((atom) => ({
      id: atom.id,
      origins: [{ input: 'input', sourceId: atom.id }]
    })),
    [],
    { operationCount: operations.value.length, expandedAtomCount: instances.value.length }
  )
}
