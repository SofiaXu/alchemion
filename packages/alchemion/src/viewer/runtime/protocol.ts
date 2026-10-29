import type { Diagnostic } from '../../core/types'
import type { ComputationContext, ComputationResult, ComputationTask } from './types'

export type WorkerRequest = ComputationContext &
  ({ readonly kind: 'compute'; readonly task: ComputationTask } | { readonly kind: 'cancel' })
export type WorkerReply = ComputationContext &
  (
    | {
        readonly kind: 'result'
        readonly value: ComputationResult['value']
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
