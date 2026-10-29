import type { RenderSnapshot } from './contracts'

export interface WorkerRequest {
  kind: 'compute' | 'cancel'
  requestId: number
  documentId: string
  revision: number
  snapshot?: RenderSnapshot
  delayMs?: number
  fail?: boolean
  ignoreCancel?: boolean
}

export interface WorkerReply {
  kind: 'result' | 'error'
  requestId: number
  documentId: string
  revision: number
  snapshot?: RenderSnapshot
  message?: string
}

const timers = new Map<number, ReturnType<typeof setTimeout>>()
const uninterruptible = new Set<number>()
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.kind === 'cancel') {
    if (!uninterruptible.has(request.requestId)) {
      clearTimeout(timers.get(request.requestId))
      timers.delete(request.requestId)
    }
    return
  }
  if (request.ignoreCancel) uninterruptible.add(request.requestId)
  timers.set(
    request.requestId,
    setTimeout(() => {
      timers.delete(request.requestId)
      uninterruptible.delete(request.requestId)
      const reply: WorkerReply = {
        kind: request.fail ? 'error' : 'result',
        requestId: request.requestId,
        documentId: request.documentId,
        revision: request.revision,
        ...(request.fail
          ? { message: 'M2 deliberate Worker computation failure.' }
          : { snapshot: request.snapshot })
      }
      if (reply.snapshot) {
        self.postMessage(reply, {
          transfer: [
            reply.snapshot.positions.buffer,
            reply.snapshot.colors.buffer,
            reply.snapshot.bondEndpoints.buffer
          ]
        })
      } else self.postMessage(reply)
    }, request.delayMs ?? 0)
  )
})
