import type { AtomId, BondEndpoint, Diagnostic, StructureSnapshot } from '../core/types'

export type BlockSelector = { readonly name: string } | { readonly index: number }
export interface CifParseOptions {
  readonly format: 'cif'
  readonly block?: BlockSelector
}
export interface MolParseOptions {
  readonly format: 'mol'
}
export interface PoscarParseOptions {
  readonly format: 'poscar'
}
export type ParseOptions = CifParseOptions | MolParseOptions | PoscarParseOptions
export interface CifWriteOptions {
  readonly format: 'cif'
  readonly version: '1' | '2'
  readonly allowLoss?: boolean
}
export type MolFiniteSelection =
  | { readonly kind: 'source'; readonly atomIds: readonly AtomId[] }
  | { readonly kind: 'instances'; readonly endpoints: readonly BondEndpoint[] }
export interface MolWriteOptions {
  readonly format: 'mol'
  readonly version?: 'V2000' | 'V3000'
  readonly allowLoss?: boolean
  readonly finite?: MolFiniteSelection
}
export interface PoscarWriteOptions {
  readonly format: 'poscar'
  readonly allowLoss?: boolean
}
export type WriteOptions = CifWriteOptions | MolWriteOptions | PoscarWriteOptions
export interface ParseResult {
  readonly structure?: StructureSnapshot
  readonly diagnostics: readonly Diagnostic[]
  readonly candidates?: readonly { readonly name: string; readonly index: number }[]
}
export interface ExportAtomMapping {
  readonly fileAtomNumber: number
  readonly exportAtomId: string
  readonly source: BondEndpoint
}
export interface WriteResult {
  readonly text?: string
  readonly diagnostics: readonly Diagnostic[]
  readonly atomMapping?: readonly ExportAtomMapping[]
}
