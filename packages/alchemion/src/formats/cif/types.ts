import type { Diagnostic } from '../../core/types'

export type CifVersion = '1' | '2'
export type CifLocation = NonNullable<Diagnostic['sourceLocation']>
interface Located {
  readonly sourceLocation?: CifLocation
}
/** Scalars stay lexical until a dictionary field gives them a scientific meaning. */
export type CifValue =
  | (Located & { readonly kind: 'scalar'; readonly value: string; readonly quoted: boolean })
  | (Located & { readonly kind: 'unknown' | 'not-applicable' })
  | (Located & { readonly kind: 'list'; readonly values: readonly CifValue[] })
  | (Located & {
      readonly kind: 'table'
      readonly entries: readonly { readonly key: string; readonly value: CifValue }[]
    })
export interface CifTag extends Located {
  readonly name: string
}
export type CifEntry =
  | (Located & { readonly kind: 'item'; readonly tag: CifTag; readonly value: CifValue })
  | (Located & {
      readonly kind: 'loop'
      readonly tags: readonly CifTag[]
      readonly rows: readonly (readonly CifValue[])[]
    })
export interface CifSaveFrame extends Located {
  readonly name: string
  readonly entries: readonly CifEntry[]
}
export interface CifDataBlock extends Located {
  readonly name: string
  readonly entries: readonly CifEntry[]
  readonly saveFrames: readonly CifSaveFrame[]
}
export interface CifDocument {
  readonly version: CifVersion
  readonly blocks: readonly CifDataBlock[]
}
export interface CifDocumentResult {
  readonly document?: CifDocument
  readonly diagnostics: readonly Diagnostic[]
}
