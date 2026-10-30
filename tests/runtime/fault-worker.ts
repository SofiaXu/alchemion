import type {
  WorkerReply,
  WorkerRequest
} from '../../packages/alchemion/src/viewer/runtime/protocol'
import { runComputationTask } from '../../packages/alchemion/src/viewer/runtime/task'

type FaultRequest = WorkerRequest & {
  readonly behavior?: 'late' | 'error' | 'close' | 'malformed'
  readonly delayMs?: number
}
self.addEventListener('message', (event: MessageEvent<FaultRequest>) => {
  const request = event.data
  if (request.kind !== 'compute') return // Deliberately ignore cancellation to reproduce late replies.
  if (request.behavior === 'close') {
    self.close()
    return
  }
  if (request.behavior === 'error') throw new Error('Test deliberate worker crash.')
  const { requestId, documentId, revision, category } = request
  setTimeout(() => {
    const result = runComputationTask(request.task)
    const reply: WorkerReply = result.ok
      ? {
          requestId,
          documentId,
          revision,
          category,
          kind: 'result',
          value: result.value,
          diagnostics: result.diagnostics
        }
      : {
          requestId,
          documentId,
          revision,
          category,
          kind: 'error',
          diagnostics: result.diagnostics
        }
    self.postMessage(request.behavior === 'malformed' ? { ...reply, diagnostics: [null] } : reply)
  }, request.delayMs ?? 0)
})
self.postMessage({ kind: 'test-ready' })
