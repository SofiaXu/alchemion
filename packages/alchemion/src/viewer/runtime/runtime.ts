import type { Diagnostic } from '../../core/types'
import type {
  ComputationTransport,
  TransportContext,
  TransportRequest,
  TransportResult,
  TransportRuntime,
  WorkerReply,
  WorkerRequest
} from './protocol'
import { runComputationTask } from './task'
import { abortError, ComputationError } from './types'
import type { ComputationRuntime, ComputationRuntimeOptions } from './types'

interface Pending {
  readonly context: TransportContext
  readonly key: string
  readonly resolve: (value: TransportResult) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
  readonly deadline: number
  readonly signal?: AbortSignal
  readonly abort?: () => void
}

function validDiagnostic(input: unknown): input is Diagnostic {
  if (!input || typeof input !== 'object') return false
  const diagnostic = input as Partial<Diagnostic>
  return (
    ['error', 'warning', 'info'].includes(String(diagnostic.severity)) &&
    typeof diagnostic.code === 'string' &&
    typeof diagnostic.message === 'string'
  )
}

function validResultValue(category: TransportContext['category'], input: unknown): boolean {
  if (!input || typeof input !== 'object') return false
  const value = input as Record<string, unknown>
  if (category === 'result-import')
    return value.version === 1 && Array.isArray(value.frames) && Array.isArray(value.data)
  if (category === 'result-layer')
    return (
      typeof value.quantity === 'string' &&
      typeof value.unit === 'string' &&
      (Array.isArray(value.meshes) || Array.isArray(value.glyphs))
    )
  if (category === 'result-unfold') return Array.isArray(input)
  if (category === 'derive') return Array.isArray(value.atoms) && Array.isArray(value.bonds)
  if (category === 'construction')
    return (
      Boolean(value.snapshot && value.stats && value.parameters) &&
      Array.isArray(value.atoms) &&
      Array.isArray(value.bonds)
    )
  if (category === 'coordination')
    return (
      value.unit === 'angstrom' &&
      Array.isArray(value.centers) &&
      value.centers.every((inputCenter) => {
        if (!inputCenter || typeof inputCenter !== 'object') return false
        const center = inputCenter as Record<string, unknown>
        return (
          Boolean(center.center) &&
          Array.isArray(center.neighbors) &&
          Number.isSafeInteger(center.coordinationNumber) &&
          center.coordinationNumber === center.neighbors.length
        )
      })
    )
  if (category === 'reciprocal')
    return (
      Array.isArray(value.basis) &&
      value.basis.length === 3 &&
      value.basis.every(
        (column) => Array.isArray(column) && column.length === 3 && column.every(Number.isFinite)
      ) &&
      value.unit === 'angstrom^-1'
    )
  return (
    Array.isArray(value.vertices) &&
    Array.isArray(value.faces) &&
    Array.isArray(value.triangles) &&
    typeof value.volume === 'number' &&
    Number.isFinite(value.volume) &&
    value.volume > 0 &&
    value.unit === 'angstrom^-1'
  )
}

function synchronousTransport(): ComputationTransport {
  const events = new EventTarget()
  const scheduled = new Map<number, ReturnType<typeof setTimeout>>()
  const active = new Set<number>()
  let disposed = false
  return {
    addEventListener: (type, listener) => events.addEventListener(type, listener),
    removeEventListener: (type, listener) => events.removeEventListener(type, listener),
    postMessage(request) {
      if (disposed) throw new Error('The synchronous executor is disposed.')
      if (request.kind === 'cancel') {
        clearTimeout(scheduled.get(request.requestId))
        scheduled.delete(request.requestId)
        active.delete(request.requestId)
        return
      }
      scheduled.set(
        request.requestId,
        setTimeout(async () => {
          scheduled.delete(request.requestId)
          active.add(request.requestId)
          const { requestId, documentId, revision, category } = request
          const context = { requestId, documentId, revision, category }
          let reply: WorkerReply
          try {
            const task = request.task
            const result =
              task.kind === 'result-import' ||
              task.kind === 'result-layer' ||
              task.kind === 'result-unfold'
                ? await (
                    await import('../results/task')
                  ).runResultTask(task, async () => {
                    await new Promise<void>((done) => setTimeout(done, 0))
                    if (!active.has(requestId)) throw abortError()
                  })
                : runComputationTask(task)
            reply = result.ok
              ? { ...context, kind: 'result', value: result.value, diagnostics: result.diagnostics }
              : { ...context, kind: 'error', diagnostics: result.diagnostics }
          } catch (error) {
            reply = {
              ...context,
              kind: 'error',
              diagnostics: [
                {
                  severity: 'error',
                  code: 'COMPUTATION_EXCEPTION',
                  message:
                    error instanceof Error ? error.message : 'The computation failed unexpectedly.'
                }
              ]
            }
          }
          if (active.delete(requestId))
            events.dispatchEvent(new MessageEvent('message', { data: reply }))
        }, 0)
      )
    },
    terminate() {
      disposed = true
      for (const timer of scheduled.values()) clearTimeout(timer)
      scheduled.clear()
      active.clear()
    }
  }
}

/** Explicit browser factory; importing this module creates no worker or canvas. */
export function createComputationRuntime(
  options: ComputationRuntimeOptions = {}
): ComputationRuntime {
  if (options.mode !== undefined && !['worker', 'sync'].includes(options.mode))
    throw new TypeError('Computation mode must be worker or sync.')
  return createRuntimeWithTransport(
    options,
    options.mode === 'sync' ? synchronousTransport : moduleWorker
  )
}

export function moduleWorker(): Worker {
  return new Worker(new URL('./computation-worker.ts', import.meta.url), { type: 'module' })
}

export function createResultRuntime(options: ComputationRuntimeOptions): TransportRuntime {
  return createRuntimeWithTransport(
    options,
    options.mode === 'sync' ? synchronousTransport : moduleWorker,
    'results'
  )
}

/** Internal injection seam; deliberately omitted from the public entry point. */
export function createRuntimeWithTransport(
  options: ComputationRuntimeOptions,
  factory: () => ComputationTransport,
  role?: 'computation' | 'modeling'
): ComputationRuntime
export function createRuntimeWithTransport(
  options: ComputationRuntimeOptions,
  factory: () => ComputationTransport,
  role: 'results'
): TransportRuntime
export function createRuntimeWithTransport(
  options: ComputationRuntimeOptions,
  factory: () => ComputationTransport,
  role: 'computation' | 'modeling' | 'results' = 'computation'
): TransportRuntime {
  const modeling = role === 'modeling'
  const timeoutMs = options.timeoutMs ?? 30_000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
    throw new RangeError('timeoutMs must be a positive finite browser timer interval.')
  let transport: ComputationTransport | undefined
  let sequence = 0
  let documentId: string | undefined
  let revision = -1
  let disposed = false
  const pending = new Map<number, Pending>()
  const latest = new Map<string, number>()

  function finish(requestId: number, error?: Error, result?: TransportResult) {
    const record = pending.get(requestId)
    if (!record) return
    pending.delete(requestId)
    if (latest.get(record.key) === requestId) latest.delete(record.key)
    clearTimeout(record.timer)
    if (record.abort) record.signal?.removeEventListener('abort', record.abort)
    if (error) record.reject(error)
    else record.resolve(result!)
  }
  function releaseTransport() {
    if (!transport) return
    for (const [event, listener] of listeners) transport.removeEventListener(event, listener)
    transport.terminate()
    transport = undefined
  }
  function failTransport(error: Error) {
    for (const id of [...pending.keys()]) finish(id, error)
    releaseTransport()
  }
  function timeoutError(context: TransportContext): ComputationError {
    return new ComputationError('COMPUTATION_TIMEOUT', 'The computation exceeded its timeout.', [
      {
        severity: 'error',
        code: 'COMPUTATION_TIMEOUT',
        message: 'The computation exceeded its timeout.',
        context: { ...context, timeoutMs }
      }
    ])
  }
  function cancel(requestId: number) {
    const record = pending.get(requestId)
    if (!record) return
    finish(requestId, abortError())
    if (modeling) {
      releaseTransport()
      return
    }
    try {
      transport?.postMessage({ ...record.context, kind: 'cancel' })
    } catch {
      failTransport(
        new ComputationError(
          'COMPUTATION_TRANSPORT',
          'The computation transport failed during cancellation.'
        )
      )
    }
  }
  const onMessage: EventListener = (event) => {
    const reply = (event as MessageEvent<WorkerReply>).data
    if (!reply || typeof reply !== 'object') return
    const record = pending.get(reply.requestId)
    if (
      !record ||
      disposed ||
      reply.documentId !== documentId ||
      reply.revision !== revision ||
      reply.documentId !== record.context.documentId ||
      reply.revision !== record.context.revision ||
      reply.category !== record.context.category ||
      latest.get(record.key) !== reply.requestId
    )
      return
    // A synchronous algorithm can block the timer queue, then deliver a result before
    // the overdue timeout callback. Elapsed monotonic time remains authoritative.
    if (performance.now() >= record.deadline) {
      failTransport(timeoutError(record.context))
      return
    }
    if (
      !Array.isArray(reply.diagnostics) ||
      !reply.diagnostics.every(validDiagnostic) ||
      !['result', 'error'].includes(reply.kind)
    ) {
      finish(
        reply.requestId,
        new ComputationError(
          'COMPUTATION_PROTOCOL',
          'The executor returned an invalid computation response.'
        )
      )
    } else if (reply.kind === 'error') {
      finish(
        reply.requestId,
        new ComputationError(
          reply.diagnostics[0]?.code ?? 'COMPUTATION_FAILED',
          reply.diagnostics[0]?.message ?? 'The computation failed.',
          reply.diagnostics
        )
      )
    } else if (
      !validResultValue(reply.category, reply.value) ||
      reply.diagnostics.some((item) => item.severity === 'error')
    ) {
      finish(
        reply.requestId,
        new ComputationError(
          'COMPUTATION_PROTOCOL',
          'The executor returned an incomplete computation result.'
        )
      )
    } else {
      finish(reply.requestId, undefined, {
        ...record.context,
        value: reply.value,
        diagnostics: reply.diagnostics
      } as TransportResult)
    }
  }
  const onError: EventListener = (event) => {
    event.preventDefault()
    failTransport(new ComputationError('COMPUTATION_TRANSPORT', 'The computation worker failed.'))
  }
  const onMessageError: EventListener = () =>
    failTransport(
      new ComputationError(
        'COMPUTATION_MESSAGE_ERROR',
        'The computation response could not be deserialized.'
      )
    )
  const listeners: readonly ['message' | 'error' | 'messageerror', EventListener][] = [
    ['message', onMessage],
    ['error', onError],
    ['messageerror', onMessageError]
  ]
  function invalidate() {
    for (const id of [...pending.keys()]) cancel(id)
    if (role !== 'computation') releaseTransport()
    documentId = undefined
    revision = -1
  }
  return {
    compute(input, requestOptions = {}) {
      if (disposed)
        return Promise.reject(
          new ComputationError('RUNTIME_DISPOSED', 'The computation runtime is disposed.')
        )
      if (requestOptions.signal?.aborted) return Promise.reject(abortError())
      if (
        !input ||
        typeof input.documentId !== 'string' ||
        !input.documentId.trim() ||
        !Number.isSafeInteger(input.revision) ||
        input.revision < 0 ||
        (role === 'results'
          ? !['result-import', 'result-layer', 'result-unfold', 'derive'].includes(input.task?.kind)
          : modeling
            ? input.task?.kind !== 'construction'
            : !['derive', 'reciprocal', 'brillouin-zone', 'coordination'].includes(
                input.task?.kind
              ))
      )
        return Promise.reject(
          new ComputationError(
            'COMPUTATION_INPUT',
            'Computation requests require a document ID, nonnegative revision and known task.'
          )
        )
      let request: TransportRequest
      try {
        request = structuredClone(input)
      } catch {
        return Promise.reject(
          new ComputationError(
            'COMPUTATION_INPUT',
            'Computation inputs must be structured-clone compatible.'
          )
        )
      }
      if (request.documentId === documentId && request.revision < revision)
        return Promise.reject(
          new ComputationError(
            'COMPUTATION_STALE_REVISION',
            'The request predates the current source revision.'
          )
        )
      if (request.documentId !== documentId || request.revision !== revision) invalidate()
      documentId = request.documentId
      revision = request.revision
      const key =
        role === 'results' ? JSON.stringify([request.task.kind, request.scope]) : request.task.kind
      const replaced = latest.get(key)
      if (replaced !== undefined) cancel(replaced)
      const context: TransportContext = {
        requestId: ++sequence,
        documentId,
        revision,
        category: request.task.kind
      }
      return new Promise<TransportResult>((resolve, reject) => {
        const abort = () => cancel(context.requestId)
        const deadline = performance.now() + timeoutMs
        const timer = setTimeout(() => failTransport(timeoutError(context)), timeoutMs)
        pending.set(context.requestId, {
          context,
          key,
          resolve,
          reject,
          timer,
          deadline,
          signal: requestOptions.signal,
          abort
        })
        latest.set(key, context.requestId)
        requestOptions.signal?.addEventListener('abort', abort, { once: true })
        try {
          if (!transport) {
            transport = factory()
            for (const [event, listener] of listeners) transport.addEventListener(event, listener)
          }
          const message: WorkerRequest = { ...context, kind: 'compute', task: request.task }
          transport.postMessage(message)
        } catch (error) {
          const diagnostics: Diagnostic[] = [
            {
              severity: 'error',
              code: 'COMPUTATION_TRANSPORT',
              message:
                error instanceof Error
                  ? error.message
                  : 'The computation worker could not be started.'
            }
          ]
          failTransport(
            new ComputationError('COMPUTATION_TRANSPORT', diagnostics[0].message, diagnostics)
          )
        }
      })
    },
    invalidate,
    dispose() {
      if (disposed) return
      disposed = true
      invalidate()
      releaseTransport()
    }
  }
}
