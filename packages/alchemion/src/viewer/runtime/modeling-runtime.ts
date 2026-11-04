import { finishConstruction } from '../../core/construction'
import type { ConstructionResult } from '../../core/construction'
import type { Diagnostic } from '../../core/types'
import { createRuntimeWithTransport, moduleWorker } from './runtime'
import type { ModelingTask } from './modeling-task'
import { ComputationError } from './types'

export interface ModelingRequest {
  readonly documentId: string
  readonly revision: number
  readonly task: ModelingTask
}

export interface ModelingPreview extends ConstructionResult {
  readonly documentId: string
  readonly revision: number
  readonly diagnostics: readonly Diagnostic[]
}

export interface ModelingRuntime {
  preview(
    request: ModelingRequest,
    options?: { readonly signal?: AbortSignal }
  ): Promise<ModelingPreview>
  invalidate(): void
  dispose(): void
}

/** A modeling runtime has an exclusive, lazily created transport. */
export function createModelingRuntime(
  options: { readonly timeoutMs?: number } = {}
): ModelingRuntime {
  const runtime = createRuntimeWithTransport(options, moduleWorker, true)
  return {
    async preview({ documentId, revision, task }, requestOptions) {
      const result = await runtime.compute(
        { documentId, revision, task: { kind: 'construction', construction: task } },
        requestOptions
      )
      if (result.category !== 'construction')
        throw new ComputationError('MODELING_PROTOCOL', 'The reply is not a modeling preview.')
      const { snapshot, atoms, bonds, parameters } = result.value
      const checked = finishConstruction(snapshot, atoms, bonds, parameters)
      if (!checked.ok)
        throw new ComputationError(
          'MODELING_PROTOCOL',
          'The reply contains an invalid snapshot.',
          checked.diagnostics
        )
      return Object.freeze({
        ...checked.value,
        documentId,
        revision,
        diagnostics: result.diagnostics
      })
    },
    invalidate: runtime.invalidate,
    dispose: runtime.dispose
  }
}
