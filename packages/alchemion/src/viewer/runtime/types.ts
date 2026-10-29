import type { DerivationOptions } from '../../core/bonds'
import type { BrillouinZone, BrillouinZoneOptions } from '../../core/brillouin-zone'
import type { DocumentState, EditCommand } from '../../core/editing'
import type { ReciprocalLattice } from '../../core/reciprocal'
import type { Cell, DerivedStructure, Diagnostic, StructureSnapshot } from '../../core/types'

export type ComputationTask =
  | {
      readonly kind: 'derive'
      readonly snapshot: StructureSnapshot
      readonly options?: DerivationOptions
    }
  | { readonly kind: 'reciprocal'; readonly cell: Cell }
  | {
      readonly kind: 'brillouin-zone'
      readonly cell: Cell
      readonly options?: BrillouinZoneOptions
    }
export type ComputationCategory = ComputationTask['kind']
export interface ComputationRequest {
  readonly documentId: string
  readonly revision: number
  readonly task: ComputationTask
}
export interface ComputationContext {
  readonly requestId: number
  readonly documentId: string
  readonly revision: number
  readonly category: ComputationCategory
}
export type ComputationResult = ComputationContext & {
  readonly diagnostics: readonly Diagnostic[]
} & (
    | { readonly category: 'derive'; readonly value: DerivedStructure }
    | { readonly category: 'reciprocal'; readonly value: ReciprocalLattice }
    | { readonly category: 'brillouin-zone'; readonly value: BrillouinZone }
  )
export interface ComputationRuntimeOptions {
  readonly mode?: 'worker' | 'sync'
  readonly timeoutMs?: number
}
export interface ComputationRuntime {
  compute(
    request: ComputationRequest,
    options?: { readonly signal?: AbortSignal }
  ): Promise<ComputationResult>
  invalidate(): void
  dispose(): void
}
export interface EditorState extends DocumentState {
  readonly status: 'empty' | 'computing' | 'ready' | 'cancelled' | 'error' | 'disposed'
  readonly derived?: DerivedStructure
  readonly diagnostics: readonly Diagnostic[]
}
export interface EditorControllerOptions extends ComputationRuntimeOptions {
  readonly historyLimit?: number
  readonly derivation?: DerivationOptions
  readonly commit?: (
    result: DerivedStructure,
    context: ComputationContext,
    signal: AbortSignal
  ) => void | Promise<void>
}
export interface EditorController {
  getState(): EditorState
  load(snapshot: StructureSnapshot): Promise<void>
  execute(command: EditCommand | readonly EditCommand[]): Promise<void>
  undo(): Promise<void>
  redo(): Promise<void>
  cancel(): void
  recompute(options?: DerivationOptions): Promise<void>
  compute(
    task: Exclude<ComputationTask, { readonly kind: 'derive' }>,
    options?: { readonly signal?: AbortSignal }
  ): Promise<ComputationResult>
  subscribe(listener: (state: EditorState) => void): () => void
  clear(): void
  dispose(): void
}

export class ComputationError extends Error {
  readonly code: string
  readonly diagnostics: readonly Diagnostic[]
  constructor(code: string, message: string, diagnostics?: readonly Diagnostic[]) {
    super(message)
    this.name = code === 'COMPUTATION_TIMEOUT' ? 'TimeoutError' : 'ComputationError'
    this.code = code
    this.diagnostics = diagnostics ?? [{ severity: 'error', code, message }]
  }
}

export function abortError(): DOMException {
  return new DOMException('The computation was cancelled, superseded or disposed.', 'AbortError')
}
