import type { WorkerReply, WorkerRequest } from './protocol'
import { runComputationTask } from './task'
import { runModelingTask } from './modeling-task'

const active = new Set<number>()
// The worker holds only the current request's data; no document store or nested workers.
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.kind === 'cancel') {
    active.delete(request.requestId)
    return
  }
  const { requestId, documentId, revision, category } = request
  active.add(requestId)
  const context = { requestId, documentId, revision, category }
  let reply: WorkerReply
  try {
    const task = request.task
    const result =
      task.kind === 'construction'
        ? await runModelingTask(task.construction)
        : task.kind === 'result-import' ||
            task.kind === 'result-layer' ||
            task.kind === 'result-unfold'
          ? await (
              await import('../results/task')
            ).runResultTask(task, async () => {
              await new Promise<void>((done) => setTimeout(done, 0))
              if (!active.has(requestId))
                throw new DOMException('The result request was cancelled.', 'AbortError')
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
          message: error instanceof Error ? error.message : 'The computation failed unexpectedly.'
        }
      ]
    }
  }
  if (active.delete(requestId)) self.postMessage(reply)
})
