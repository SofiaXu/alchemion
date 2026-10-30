import { validateStructure } from '../core/structure'
import { parseCifStructure, writeCifStructure } from './cif'
import { parseMolStructure, writeMolStructure } from './mol'
import { parsePoscarStructure, writePoscarStructure } from './poscar'
import { hasErrors } from './loss'
import type { StructureSnapshot } from '../core/types'
import type { ParseOptions, ParseResult, WriteOptions, WriteResult } from './contracts'

export type * from './contracts'
export { parseCifDocument, writeCifDocument } from './cif'
export type * from './cif/types'

export function parseStructure(text: string, options: ParseOptions): ParseResult {
  if (typeof text !== 'string' || !options || !['cif', 'mol', 'poscar'].includes(options.format))
    return {
      diagnostics: [
        {
          severity: 'error',
          code: 'FORMAT_PARSE_OPTIONS',
          message: 'Provide text and an explicit cif, mol or poscar format.'
        }
      ]
    }
  if (options.format === 'cif') return parseCifStructure(text, options)
  if (options.format === 'mol') return parseMolStructure(text, options)
  return parsePoscarStructure(text)
}

export function writeStructure(snapshot: StructureSnapshot, options: WriteOptions): WriteResult {
  if (!options || !['cif', 'mol', 'poscar'].includes(options.format))
    return {
      diagnostics: [
        {
          severity: 'error',
          code: 'FORMAT_WRITE_OPTIONS',
          message: 'Provide an explicit cif, mol or poscar format.'
        }
      ]
    }
  if (options.allowLoss !== undefined && typeof options.allowLoss !== 'boolean')
    return {
      diagnostics: [
        {
          severity: 'error',
          code: 'FORMAT_LOSS_OPTION',
          message: 'allowLoss must be an explicit boolean.'
        }
      ]
    }
  const diagnostics = validateStructure(snapshot)
  if (hasErrors(diagnostics)) return { diagnostics }
  if (options.format === 'cif') return writeCifStructure(snapshot, options)
  if (options.format === 'mol') return writeMolStructure(snapshot, options)
  return writePoscarStructure(snapshot, options)
}
