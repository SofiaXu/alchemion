import {
  createCell,
  createDocumentStore,
  createStructureSnapshot,
  createSupercell,
  analyzeCoordination,
  fractionalToCartesian,
  getElement,
  type ScientificResult,
  type StructureSnapshot,
  type Vec3
} from 'alchemion/core'
import { parseCifDocument, parseStructure, writeStructure } from 'alchemion/formats'

// Compiled against installed declarations with ES2022 only and no ambient DOM/Node types.
export const element = getElement('C')
export const store = createDocumentStore({ historyLimit: 3 })
export const document = parseCifDocument('data_empty\n')
export const parse = (text: string) => parseStructure(text, { format: 'cif' })
export const encode = (source: StructureSnapshot) => writeStructure(source, { format: 'mol' })
export const parsePoscar = (text: string) => parseStructure(text, { format: 'poscar' })
export const supercell = (source: StructureSnapshot) => createSupercell(source, [2, 1, 1])
export const coordination = (source: StructureSnapshot) =>
  analyzeCoordination(source, { centerAtomIds: [], rules: [] })
export const snapshot: ScientificResult<StructureSnapshot> = createStructureSnapshot({
  kind: 'molecular',
  atoms: [{ id: 'consumer-C', element: 'C', cartesian: [0, 0, 0] }],
  bonds: []
})
const cell = createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 })
export const coordinate: ScientificResult<Vec3> | undefined = cell.ok
  ? fractionalToCartesian(cell.value, [0.5, 0.5, 0.5])
  : undefined
