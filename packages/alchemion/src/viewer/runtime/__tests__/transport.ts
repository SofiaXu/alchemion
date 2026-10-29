import type { DerivedStructure } from '../../../core/types'
import type { ComputationTransport, WorkerReply, WorkerRequest } from '../protocol'

export class ControlledTransport extends EventTarget implements ComputationTransport {
  readonly messages: WorkerRequest[] = []
  readonly listeners = new Set<EventListener>()
  terminated = false
  failSend = false
  override addEventListener(type: string, listener: EventListener) {
    this.listeners.add(listener)
    super.addEventListener(type, listener)
  }
  override removeEventListener(type: string, listener: EventListener) {
    this.listeners.delete(listener)
    super.removeEventListener(type, listener)
  }
  postMessage(request: WorkerRequest) {
    if (this.failSend) throw new Error('Injected synchronous send failure.')
    this.messages.push(request)
  }
  terminate() {
    this.terminated = true
  }
  reply(request: WorkerRequest, patch: Partial<WorkerReply> = {}) {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: {
          requestId: request.requestId,
          documentId: request.documentId,
          revision: request.revision,
          category: request.category,
          kind: 'result',
          value: { atoms: [], bonds: [] } satisfies DerivedStructure,
          diagnostics: [],
          ...patch
        }
      })
    )
  }
}
