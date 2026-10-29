import { createDocumentStore, type StructureSnapshot } from 'alchemion/core'
import { parseCifDocument, parseStructure, writeStructure } from 'alchemion/formats'

// Compiled against installed declarations with ES2022 only and no ambient DOM/Node types.
export const store = createDocumentStore({ historyLimit: 3 })
export const document = parseCifDocument('data_empty\n')
export const parsed = parseStructure('data_empty\n', { format: 'cif' })
export function encode(snapshot: StructureSnapshot) {
  return writeStructure(snapshot, { format: 'mol' })
}
