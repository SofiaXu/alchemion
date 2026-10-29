// Fault-only harness: production consumers in main.ts import only official SDK entries.
import { createRuntimeWithTransport } from '../../packages/alchemion/src/viewer/runtime/runtime'
import type {
  ComputationTransport,
  WorkerRequest
} from '../../packages/alchemion/src/viewer/runtime/protocol'
import type { ComputationRequest } from '../../packages/alchemion/src/viewer/runtime/types'

const request = (): ComputationRequest => ({
  documentId: 'fault-document',
  revision: 0,
  task: {
    kind: 'derive',
    snapshot: {
      kind: 'molecular',
      atoms: [{ id: 'fault-atom', element: 'C', cartesian: [0, 0, 0] }],
      bonds: []
    }
  }
})

async function executor(behavior: 'late' | 'error' | 'close' | 'malformed') {
  const worker = new Worker(new URL('./fault-worker.ts', import.meta.url), { type: 'module' })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate()
      reject(new Error('Fault worker did not become ready.'))
    }, 5000)
    const ready = (event: MessageEvent) => {
      if (event.data?.kind !== 'test-ready') return
      clearTimeout(timer)
      worker.removeEventListener('message', ready)
      resolve()
    }
    worker.addEventListener('message', ready)
  })
  let computations = 0
  let terminated = false
  const transport: ComputationTransport = {
    addEventListener: (type, listener) => worker.addEventListener(type, listener),
    removeEventListener: (type, listener) => worker.removeEventListener(type, listener),
    terminate: () => {
      terminated = true
      worker.terminate()
    },
    postMessage(message: WorkerRequest) {
      if (message.kind === 'compute') computations++
      worker.postMessage({
        ...message,
        behavior,
        delayMs: behavior === 'late' && computations === 1 ? 70 : 0
      })
    }
  }
  const runtime = createRuntimeWithTransport(
    { timeoutMs: behavior === 'close' ? 100 : 2000 },
    () => transport
  )
  return {
    runtime,
    get terminated() {
      return terminated
    }
  }
}

export async function faults() {
  const late = await executor('late')
  let oldResolved = false
  const previous = late.runtime.compute(request()).then(
    () => {
      oldResolved = true
      return 'resolved'
    },
    (error: Error) => error.name
  )
  const current = late.runtime.compute(request())
  const cancelled = await previous
  const result = await current
  await new Promise((resolve) => setTimeout(resolve, 100))
  late.runtime.dispose()
  const codes: Record<string, string> = {}
  const released: boolean[] = [late.terminated]
  for (const behavior of ['error', 'close', 'malformed'] as const) {
    const fault = await executor(behavior)
    try {
      await fault.runtime.compute(request())
      codes[behavior] = 'unexpected success'
    } catch (error) {
      codes[behavior] = (error as Error & { code: string }).code
    } finally {
      fault.runtime.dispose()
      released.push(fault.terminated)
    }
  }
  return { cancelled, currentRequestId: result.requestId, oldResolved, codes, released }
}
