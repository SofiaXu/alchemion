import type { BondEndpoint, Diagnostic, DiagnosticContext, SourceBond } from '../../core/types'

export type MolVersion = 'V2000' | 'V3000'
export const molecularEndpoint = (sourceAtomId: string): BondEndpoint => ({
  sourceAtomId,
  symmetryOperationId: 'identity',
  integerCellOffset: [0, 0, 0]
})
export const molDiagnostic = (
  code: string,
  message: string,
  version?: MolVersion,
  context?: DiagnosticContext,
  line?: number,
  column = 1
): Diagnostic => ({
  severity: 'error',
  code,
  message,
  context: { format: 'mol', ...(version ? { version } : {}), ...context },
  ...(line !== undefined ? { sourceLocation: { line, column } } : {})
})
export const orderFromNumber = new Map<number, SourceBond['order']>([
  [1, 'single'],
  [2, 'double'],
  [3, 'triple'],
  [4, 'aromatic']
])
export const orderNumber = (order: SourceBond['order']): number =>
  ({ single: 1, double: 2, triple: 3, aromatic: 4 })[order]

/** Wedge/hash direction is relative to the first endpoint, never an unordered pair. */
export function bondStereo(
  order: SourceBond['order'],
  code: number,
  version: MolVersion
): SourceBond['stereo'] | false {
  if (code === 0) return undefined
  if (version === 'V2000') {
    if (order === 'single')
      return ({ 1: 'up', 4: 'either', 6: 'down' } as const)[code as 1 | 4 | 6] ?? false
    if (order === 'double' && code === 3) return 'either'
  } else {
    if (order === 'single')
      return ({ 1: 'up', 2: 'either', 3: 'down' } as const)[code as 1 | 2 | 3] ?? false
    if (order === 'double' && code === 2) return 'either'
  }
  return false
}

/** CTfile parity ordering puts hydrogen last, then follows the atom record numbers. */
export function parityReferences(
  atomId: string,
  bonds: readonly SourceBond[],
  atomNumbers: ReadonlyMap<string, number>,
  elements: ReadonlyMap<string, string>
): readonly (string | null)[] {
  const neighbors = bonds.flatMap((bond) => {
    const [a, b] = bond.endpoints
    return a.sourceAtomId === atomId
      ? [b.sourceAtomId]
      : b.sourceAtomId === atomId
        ? [a.sourceAtomId]
        : []
  })
  neighbors.sort((a, b) => {
    const ha = elements.get(a) === 'H',
      hb = elements.get(b) === 'H'
    return Number(ha) - Number(hb) || atomNumbers.get(a)! - atomNumbers.get(b)!
  })
  return neighbors.length === 3 ? [...neighbors, null] : neighbors
}

export function permutationIsOdd(
  original: readonly (string | null)[],
  reordered: readonly (string | null)[]
): boolean {
  const indexes = reordered.map((id) => original.indexOf(id))
  let inversions = 0
  for (let i = 0; i < indexes.length; i++)
    for (let j = i + 1; j < indexes.length; j++) if (indexes[i] > indexes[j]) inversions++
  return inversions % 2 === 1
}
