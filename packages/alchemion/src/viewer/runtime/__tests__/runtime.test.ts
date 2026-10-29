import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComputationRequest } from '../types'
import { createComputationRuntime, createRuntimeWithTransport } from '../runtime'
import { ControlledTransport } from './transport'

const request = (documentId = 'a', revision = 0): ComputationRequest => ({
  documentId,
  revision,
  task: {
    kind: 'derive',
    snapshot: {
      kind: 'molecular',
      atoms: [{ id: 'atom', element: 'C', cartesian: [0, 0, 0] }],
      bonds: []
    }
  }
})
afterEach(() => vi.useRealTimers())

describe('computation request lifecycle', () => {
  it('uses latest-wins per category and rejects stale identity/revision responses', async () => {
    const transport = new ControlledTransport()
    const runtime = createRuntimeWithTransport({}, () => transport)
    const first = runtime.compute(request()).catch((error: Error) => error.name)
    const second = runtime.compute(request())
    transport.reply(transport.messages[0])
    expect(await first).toBe('AbortError')
    const current = transport.messages.find(
      (message) => message.kind === 'compute' && message.requestId !== 1
    )!
    transport.reply(current, { documentId: 'stale' })
    transport.reply(current, { revision: 999 })
    transport.reply(current)
    expect((await second).requestId).toBe(current.requestId)
    const beforeLoad = runtime.compute(request()).catch((error: Error) => error.name)
    const afterLoad = runtime.compute(request('b', 0))
    expect(await beforeLoad).toBe('AbortError')
    transport.reply(transport.messages.at(-1)!)
    expect((await afterLoad).documentId).toBe('b')
    runtime.dispose()
    expect(transport.terminated).toBe(true)
    expect(transport.listeners.size).toBe(0)
  })

  it('keeps distinct categories in flight but invalidates all on a source revision change', async () => {
    const transport = new ControlledTransport()
    const runtime = createRuntimeWithTransport({}, () => transport)
    const one = runtime.compute(request()).catch((error: Error) => error.name)
    const two = runtime
      .compute({
        documentId: 'a',
        revision: 0,
        task: {
          kind: 'reciprocal',
          cell: {
            basis: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1]
            ]
          }
        }
      })
      .catch((error: Error) => error.name)
    expect(transport.messages.filter((message) => message.kind === 'cancel')).toHaveLength(0)
    const third = runtime.compute(request('a', 1))
    await expect(runtime.compute(request('a', 0))).rejects.toMatchObject({
      code: 'COMPUTATION_STALE_REVISION'
    })
    expect(await one).toBe('AbortError')
    expect(await two).toBe('AbortError')
    transport.reply(transport.messages.at(-1)!)
    expect((await third).revision).toBe(1)
    runtime.dispose()
  })

  it('ends aborted, invalidated and disposed requests immediately, including repeated disposal', async () => {
    const transport = new ControlledTransport()
    const runtime = createRuntimeWithTransport({}, () => transport)
    const signal = new AbortController()
    const aborted = runtime
      .compute(request(), { signal: signal.signal })
      .catch((error: Error) => error.name)
    signal.abort()
    expect(await aborted).toBe('AbortError')
    const invalidated = runtime.compute(request()).catch((error: Error) => error.name)
    runtime.invalidate()
    expect(await invalidated).toBe('AbortError')
    const disposed = runtime.compute(request()).catch((error: Error) => error.name)
    runtime.dispose()
    runtime.dispose()
    expect(await disposed).toBe('AbortError')
    await expect(runtime.compute(request())).rejects.toMatchObject({ code: 'RUNTIME_DISPOSED' })
    expect(transport.listeners.size).toBe(0)
  })

  it('enforces the default 30-second deadline and recreates an executor only on a new request', async () => {
    vi.useFakeTimers()
    const transports: ControlledTransport[] = []
    const runtime = createRuntimeWithTransport({}, () => {
      const transport = new ControlledTransport()
      transports.push(transport)
      return transport
    })
    const pending = runtime.compute(request()).catch((error: Error & { code?: string }) => error)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(transports[0].terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({ name: 'TimeoutError', code: 'COMPUTATION_TIMEOUT' })
    expect(transports[0].terminated).toBe(true)
    expect(transports).toHaveLength(1)
    const recovered = runtime.compute(request())
    expect(transports).toHaveLength(2)
    transports[1].reply(transports[1].messages[0])
    await recovered
    runtime.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an overdue synchronous response before the blocked timeout callback can run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100)
    const transport = new ControlledTransport()
    const runtime = createRuntimeWithTransport({ timeoutMs: 20 }, () => transport)
    try {
      const pending = runtime.compute(request()).catch((error: Error & { code?: string }) => error)
      // Model CPU time advancing while the timer queue remains blocked by runTask.
      clock.mockReturnValue(121)
      transport.reply(transport.messages[0])
      expect(await pending).toMatchObject({ name: 'TimeoutError', code: 'COMPUTATION_TIMEOUT' })
      expect(transport.terminated).toBe(true)
      expect(transport.listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      runtime.dispose()
      clock.mockRestore()
    }
  })

  it.each(['error', 'messageerror'] as const)(
    'settles every pending category after a transport %s and releases listeners',
    async (event) => {
      const transport = new ControlledTransport()
      const runtime = createRuntimeWithTransport({}, () => transport)
      const pending = runtime
        .compute(request())
        .catch((error: Error & { code?: string }) => error.code)
      transport.dispatchEvent(new Event(event))
      expect(await pending).toBe(
        event === 'error' ? 'COMPUTATION_TRANSPORT' : 'COMPUTATION_MESSAGE_ERROR'
      )
      expect(transport.terminated).toBe(true)
      expect(transport.listeners.size).toBe(0)
      runtime.dispose()
    }
  )

  it('reports construction, send, serialized algorithm and malformed-response errors distinctly', async () => {
    const cannotStart = createRuntimeWithTransport({}, () => {
      throw new Error('Cannot start.')
    })
    await expect(cannotStart.compute(request())).rejects.toMatchObject({
      code: 'COMPUTATION_TRANSPORT'
    })
    cannotStart.dispose()
    const transport = new ControlledTransport()
    const runtime = createRuntimeWithTransport({}, () => transport)
    transport.failSend = true
    await expect(runtime.compute(request())).rejects.toMatchObject({
      code: 'COMPUTATION_TRANSPORT'
    })
    transport.failSend = false
    const algorithm = runtime.compute(request())
    transport.reply(transport.messages.at(-1)!, {
      kind: 'error',
      diagnostics: [
        {
          severity: 'error',
          code: 'KNOWN_SCIENTIFIC_ERROR',
          message: 'Independent failure context.'
        }
      ]
    })
    await expect(algorithm).rejects.toMatchObject({ code: 'KNOWN_SCIENTIFIC_ERROR' })
    const malformed = runtime.compute(request())
    transport.reply(transport.messages.at(-1)!, { diagnostics: undefined })
    await expect(malformed).rejects.toMatchObject({ code: 'COMPUTATION_PROTOCOL' })
    const malformedEntry = runtime.compute(request())
    transport.reply(transport.messages.at(-1)!, { diagnostics: [null] as never })
    await expect(malformedEntry).rejects.toMatchObject({ code: 'COMPUTATION_PROTOCOL' })
    const incompleteValue = runtime.compute(request())
    transport.reply(transport.messages.at(-1)!, { value: null as never })
    await expect(incompleteValue).rejects.toMatchObject({ code: 'COMPUTATION_PROTOCOL' })
    runtime.dispose()
  })

  it('isolates synchronous inputs, invokes the scientific dispatcher and rejects bad options', async () => {
    const runtime = createComputationRuntime({ mode: 'sync' })
    const input = request()
    const result = runtime.compute(input)
    if (input.task.kind === 'derive')
      (input.task.snapshot.atoms[0] as { element: string }).element = 'Invalid'
    const derived = await result
    expect(derived.category === 'derive' && derived.value.atoms[0].sourceAtomId).toBe('atom')
    const invalid = request()
    if (invalid.task.kind === 'derive')
      (invalid.task.snapshot.atoms[0] as { element: string }).element = 'Invalid'
    await expect(runtime.compute(invalid)).rejects.toMatchObject({ code: 'ATOM_ELEMENT' })
    runtime.dispose()
    expect(() => createComputationRuntime({ mode: 'sync', timeoutMs: 0 })).toThrow(RangeError)
    expect(() => createComputationRuntime({ mode: 'invalid' as 'sync' })).toThrow(TypeError)
    const untouched = new ControlledTransport()
    const noStart = createRuntimeWithTransport({}, () => untouched)
    const signal = new AbortController()
    signal.abort()
    await expect(noStart.compute(request(), { signal: signal.signal })).rejects.toMatchObject({
      name: 'AbortError'
    })
    await expect(noStart.compute({ ...request(), revision: -1 })).rejects.toMatchObject({
      code: 'COMPUTATION_INPUT'
    })
    expect(untouched.messages).toHaveLength(0)
    noStart.dispose()
  })
})
