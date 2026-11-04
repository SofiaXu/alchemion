import type { Diagnostic } from '../../core/types'
import type {
  ComputationContext,
  ComputationRequest,
  ComputationResult,
  ComputationRuntime,
  ComputationTask
} from './types'
import type { CalculationResult, ResultFrame } from '../../core/calculation'
import type { ResultGeometry, ResultTask } from '../results/task'

export type TransportTask = ComputationTask | ResultTask
export type TransportContext = Omit<ComputationContext, 'category'> & {
  readonly category: TransportTask['kind']
}
export type TransportRequest = Omit<ComputationRequest, 'task'> & {
  readonly task: TransportTask
  readonly scope?: string
}
export type TransportResult =
  | ComputationResult
  | (TransportContext & {
      readonly diagnostics: readonly Diagnostic[]
    } & (
        | { readonly category: 'result-import'; readonly value: CalculationResult }
        | { readonly category: 'result-layer'; readonly value: ResultGeometry }
        | { readonly category: 'result-unfold'; readonly value: readonly ResultFrame[] }
      ))
export interface TransportRuntime extends Omit<ComputationRuntime, 'compute'> {
  compute(
    request: TransportRequest,
    options?: { readonly signal?: AbortSignal }
  ): Promise<TransportResult>
}
export type WorkerRequest = TransportContext &
  ({ readonly kind: 'compute'; readonly task: TransportTask } | { readonly kind: 'cancel' })
export type WorkerReply = TransportContext &
  (
    | {
        readonly kind: 'result'
        readonly value: TransportResult['value']
        readonly diagnostics: readonly Diagnostic[]
      }
    | { readonly kind: 'error'; readonly diagnostics: readonly Diagnostic[] }
  )

/** Internal adapter boundary for deterministic transport fault tests. */
export interface ComputationTransport {
  postMessage(message: WorkerRequest): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void
  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void
  terminate(): void
}
