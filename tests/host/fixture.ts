import type { StructureSnapshot } from 'alchemion/core'
export function fixture(): StructureSnapshot {
  return { kind: 'molecular', atoms: [{ id: 'C1', element: 'C', cartesian: [0, 0, 0] }], bonds: [] }
}
