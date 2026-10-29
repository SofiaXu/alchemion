import type { DerivationOptions } from '../../core/bonds'
import { createDocumentStore } from '../../core/editing'
import type { DocumentChange } from '../../core/editing'
import type {
  DerivedStructure,
  Diagnostic,
  ScientificResult,
  StructureSnapshot
} from '../../core/types'
import { createComputationRuntime } from './runtime'
import { abortError, ComputationError } from './types'
import type {
  ComputationRuntime,
  EditorController,
  EditorControllerOptions,
  EditorState
} from './types'

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Stop waiting immediately even when a consumer callback ignores cancellation. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(abortError())
    }
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

function diagnosticError(diagnostics: readonly Diagnostic[]): ComputationError {
  const error = diagnostics.find((entry) => entry.severity === 'error')
  return new ComputationError(
    error?.code ?? 'EDITOR_OPERATION',
    error?.message ?? 'The editor operation failed.',
    diagnostics
  )
}

export function createEditorController(options: EditorControllerOptions = {}): EditorController {
  return createControllerWithRuntime(options, createComputationRuntime(options))
}

/** Internal executor seam for fault scheduling; no injection options enter the public factory. */
export function createControllerWithRuntime(
  options: EditorControllerOptions,
  runtime: ComputationRuntime,
  // Internal composition seam: viewer options depend on whether the accepted source is periodic.
  resolveDerivation?: (snapshot: StructureSnapshot) => DerivationOptions
): EditorController {
  const store = createDocumentStore({ historyLimit: options.historyLimit })
  const listeners = new Set<(state: EditorState) => void>()
  let status: EditorState['status'] = 'empty'
  let derived: DerivedStructure | undefined
  let diagnostics: readonly Diagnostic[] = Object.freeze([])
  let derivation: DerivationOptions = structuredClone(options.derivation ?? {})
  let generation = 0
  let lifetime = 0
  let active: AbortController | undefined
  let queue = Promise.resolve()
  const state = (): EditorState =>
    Object.freeze({ ...store.getState(), status, ...(derived ? { derived } : {}), diagnostics })
  function publish() {
    const current = state()
    for (const listener of [...listeners]) {
      try {
        listener(current)
      } catch (error) {
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }
  function invalidate() {
    generation++
    active?.abort()
    active = undefined
    runtime.invalidate()
    derived = undefined
  }
  function assertOpen() {
    if (status === 'disposed')
      throw new ComputationError('CONTROLLER_DISPOSED', 'The editor controller is disposed.')
  }
  async function derive(sourceDiagnostics: readonly Diagnostic[]) {
    invalidate()
    const source = store.getState()
    if (!source.snapshot || !source.documentId) return
    const token = generation
    const abort = new AbortController()
    active = abort
    status = 'computing'
    diagnostics = freeze([...sourceDiagnostics])
    publish()
    const current = () => token === generation && status !== 'disposed' && !abort.signal.aborted
    try {
      const result = await runtime.compute(
        {
          documentId: source.documentId,
          revision: source.revision,
          task: {
            kind: 'derive',
            snapshot: source.snapshot,
            options: resolveDerivation ? resolveDerivation(source.snapshot) : derivation
          }
        },
        { signal: abort.signal }
      )
      if (!current()) throw abortError()
      if (result.category !== 'derive')
        throw new ComputationError(
          'COMPUTATION_PROTOCOL',
          'A derivation returned a different task category.'
        )
      const value = freeze(result.value)
      let timer: ReturnType<typeof setTimeout> | undefined
      let commitTimeout: ComputationError | undefined
      const commitDeadline = performance.now() + (options.timeoutMs ?? 30_000)
      const expireCommit = () => {
        commitTimeout = new ComputationError(
          'COMPUTATION_TIMEOUT',
          'The result consumer exceeded its commit timeout.'
        )
        abort.abort()
      }
      try {
        const committed = Promise.resolve().then(() => {
          if (!current()) throw abortError()
          return options.commit?.(value, result, abort.signal)
        })
        if (options.commit) timer = setTimeout(expireCommit, options.timeoutMs ?? 30_000)
        await abortable(committed, abort.signal)
        // A synchronous consumer can return before an overdue timer gets its turn.
        if (options.commit && performance.now() >= commitDeadline) {
          expireCommit()
          throw commitTimeout
        }
      } catch (error) {
        if (commitTimeout) throw commitTimeout
        throw error
      } finally {
        clearTimeout(timer)
      }
      if (!current()) throw abortError()
      derived = value
      diagnostics = freeze([...sourceDiagnostics, ...result.diagnostics])
      status = 'ready'
      publish()
    } catch (error) {
      if (token === generation) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // A newer operation or lifecycle transition owns the next visible status.
          throw error
        }
        const failure =
          error instanceof ComputationError
            ? error
            : new ComputationError(
                'EDITOR_COMMIT',
                error instanceof Error ? error.message : 'The result consumer failed.'
              )
        diagnostics = freeze([...sourceDiagnostics, ...failure.diagnostics])
        status = 'error'
        derived = undefined
        publish()
        throw failure
      }
      throw error
    } finally {
      if (active === abort) active = undefined
    }
  }

  function enqueue(action: () => ScientificResult<DocumentChange>, force = false): Promise<void> {
    try {
      assertOpen()
    } catch (error) {
      return Promise.reject(error)
    }
    const acceptedLifetime = lifetime
    let completion: Promise<void> = Promise.resolve()
    const accepted = queue.then(() => {
      if (acceptedLifetime !== lifetime || status === 'disposed') throw abortError()
      const result = action()
      if (!result.ok) throw diagnosticError(result.diagnostics)
      if (result.value.changed || force) completion = derive(result.diagnostics)
    })
    // Only source acceptance is serialized. A slow consumer must not block subsequent source edits.
    queue = accepted.catch(() => {})
    return accepted.then(() => completion)
  }

  return {
    getState: state,
    load(snapshot) {
      let isolated: typeof snapshot
      try {
        assertOpen()
        isolated = structuredClone(snapshot)
      } catch (error) {
        return Promise.reject(
          error instanceof ComputationError
            ? error
            : new ComputationError('EDITOR_INPUT', 'The structure could not be isolated.')
        )
      }
      return enqueue(() => store.load(isolated))
    },
    execute(command) {
      let isolated: typeof command
      try {
        assertOpen()
        isolated = structuredClone(command)
      } catch (error) {
        return Promise.reject(
          error instanceof ComputationError
            ? error
            : new ComputationError('EDITOR_INPUT', 'The edit commands could not be isolated.')
        )
      }
      return enqueue(() => store.execute(isolated))
    },
    undo: () => enqueue(() => store.undo()),
    redo: () => enqueue(() => store.redo()),
    recompute(next) {
      let isolated: DerivationOptions | undefined
      try {
        assertOpen()
        isolated = next === undefined ? undefined : structuredClone(next)
      } catch (error) {
        return Promise.reject(
          error instanceof ComputationError
            ? error
            : new ComputationError('EDITOR_INPUT', 'The derivation options could not be isolated.')
        )
      }
      return enqueue(() => {
        if (!store.getState().snapshot)
          return {
            ok: false,
            diagnostics: [
              {
                severity: 'error',
                code: 'EDIT_DOCUMENT_EMPTY',
                message: 'Load a structure before computing it.'
              }
            ]
          }
        if (isolated !== undefined) derivation = isolated
        return { ok: true, value: { changed: false, state: store.getState() }, diagnostics: [] }
      }, true)
    },
    compute(task, requestOptions) {
      try {
        assertOpen()
      } catch (error) {
        return Promise.reject(error)
      }
      const source = store.getState()
      if (!source.documentId || !source.snapshot)
        return Promise.reject(
          new ComputationError('EDIT_DOCUMENT_EMPTY', 'Load a structure before computing it.')
        )
      if (!task || !['reciprocal', 'brillouin-zone'].includes(task.kind))
        return Promise.reject(
          new ComputationError(
            'COMPUTATION_TASK',
            'Controller auxiliary tasks cannot bypass derivation commits.'
          )
        )
      return runtime.compute(
        { documentId: source.documentId, revision: source.revision, task },
        requestOptions
      )
    },
    subscribe(listener) {
      listener(state())
      if (status !== 'disposed') listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      if (status === 'disposed') return
      lifetime++
      invalidate()
      store.clear()
      diagnostics = Object.freeze([])
      status = 'empty'
      publish()
    },
    dispose() {
      if (status === 'disposed') return
      lifetime++
      invalidate()
      runtime.dispose()
      store.clear()
      diagnostics = Object.freeze([])
      status = 'disposed'
      publish()
      listeners.clear()
    }
  }
}
