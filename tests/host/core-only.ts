import {
  createCell,
  createStructureSnapshot,
  fractionalToCartesian,
  type ScientificResult,
  type StructureSnapshot,
  type Vec3
} from 'alchemion/core'

// Compiled from the installed tarball with ES2022 only and no ambient DOM/Node types.
export const snapshot: ScientificResult<StructureSnapshot> = createStructureSnapshot({
  kind: 'molecular',
  atoms: [{ id: 'consumer-C', element: 'C', cartesian: [0, 0, 0] }],
  bonds: []
})
const cell = createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 })
export const coordinate: ScientificResult<Vec3> | undefined = cell.ok
  ? fractionalToCartesian(cell.value, [0.5, 0.5, 0.5])
  : undefined
