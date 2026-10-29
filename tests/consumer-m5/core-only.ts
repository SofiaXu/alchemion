import { createDocumentStore, getElement, type StructureSnapshot } from 'alchemion/core'
import { parseStructure, writeStructure } from 'alchemion/formats'
export const element = getElement('C')
export const store = createDocumentStore()
export const parsed = parseStructure('data_empty\n', { format: 'cif' })
export const encode = (source: StructureSnapshot) => writeStructure(source, { format: 'mol' })
