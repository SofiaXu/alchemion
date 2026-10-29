import type { StructureSnapshot } from 'alchemion/core'

/** Project-authored periodic input. Full file/demo workflows belong to M6. */
export function demoStructure(): StructureSnapshot {
  return {
    kind: 'periodic',
    title: 'Synthetic C/O cell',
    cell: {
      basis: [
        [5, 0, 0],
        [0, 5, 0],
        [0, 0, 5]
      ]
    },
    symmetry: { spaceGroup: { hallNumber: 1 } },
    atoms: [
      { id: 'C1', element: 'C', fractional: [0.2, 0.2, 0.2] },
      { id: 'O1', element: 'O', fractional: [0.48, 0.2, 0.2] }
    ],
    bonds: []
  }
}
