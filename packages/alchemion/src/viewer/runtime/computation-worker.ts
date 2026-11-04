import type { WorkerReply, WorkerRequest } from './protocol'
import { runComputationTask } from './task'
import { runModelingTask } from './modeling-task'

// The worker holds only the current request's data; no document store or nested workers.
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.kind !== 'compute') return
  const { requestId, documentId, revision, category } = request
  const context = { requestId, documentId, revision, category }
  let reply: WorkerReply
  try {
    const result =
      request.task.kind === 'construction'
        ? await runModelingTask(request.task.construction)
        : runComputationTask(request.task)
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
          message: error instanceof Error ? error.message : 'The computation failed unexpectedly.'
        }
      ]
    }
  }
  self.postMessage(reply)
})
