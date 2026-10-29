import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditorController, createControllerWithRuntime } from '../controller'
import { createRuntimeWithTransport } from '../runtime'
import type { EditorState } from '../types'
import type { MolecularStructureSnapshot } from '../../../core/types'
import { ControlledTransport } from './transport'

const molecule = (id = 'a'): MolecularStructureSnapshot => ({
  kind: 'molecular',
  atoms: [{ id, element: 'C', cartesian: [0, 0, 0] }],
  bonds: []
})
afterEach(() => vi.useRealTimers())

describe('headless editor state machine', () => {
  it('publishes immediately and keeps the old source/history after pre-commit validation failure', async () => {
    const controller = createEditorController({ mode: 'sync' })
    const observations: EditorState['status'][] = []
    const unsubscribe = controller.subscribe((state) => observations.push(state.status))
    expect(observations).toEqual(['empty'])
    const input = molecule()
    const loading = controller.load(input)
    ;(input.atoms[0] as { element: string }).element = 'Invalid'
    await loading
    await controller.execute({ type: 'set-element', atomId: 'a', element: 'O' })
    const before = controller.getState()
    await expect(controller.load(input)).rejects.toMatchObject({ code: 'ATOM_ELEMENT' })
    expect(controller.getState()).toEqual(before)
    expect(before.canUndo).toBe(true)
    expect(observations).toEqual(['empty', 'computing', 'ready', 'computing', 'ready'])
    unsubscribe()
    unsubscribe()
    controller.dispose()
  })

  it('does not lose source commands while an older commit is blocked, and cancels stale completions', async () => {
    const pending: (() => void)[] = []
    const controller = createEditorController({
      mode: 'sync',
      commit: () => new Promise<void>((resolve) => pending.push(resolve))
    })
    const loading = controller.load(molecule()).catch((error: Error) => error.name)
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const first = controller
      .execute({ type: 'add-atom', atom: { id: 'b', element: 'H', cartesian: [1, 0, 0] } })
      .catch((error: Error) => error.name)
    const second = controller.execute({ type: 'set-element', atomId: 'a', element: 'O' })
    expect(await loading).toBe('AbortError')
    expect(await first).toBe('AbortError')
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(controller.getState().revision).toBe(2)
    expect(controller.getState().snapshot!.atoms.map((atom) => [atom.id, atom.element])).toEqual([
      ['a', 'O'],
      ['b', 'H']
    ])
    pending[0]()
    expect(controller.getState().status).toBe('computing')
    pending[1]()
    await second
    expect(controller.getState().status).toBe('ready')
    controller.dispose()
  })

  it('retains a valid new source and enters error after derivation failure, then recovers', async () => {
    const controller = createEditorController({
      mode: 'sync',
      derivation: { neighborCells: [[1, 0, 0]] }
    })
    await expect(controller.load(molecule('new'))).rejects.toMatchObject({
      code: 'MOLECULAR_PERIODIC_OPTIONS'
    })
    expect(controller.getState()).toMatchObject({ status: 'error', revision: 0, canUndo: false })
    expect(controller.getState().snapshot!.atoms[0].id).toBe('new')
    expect(controller.getState().derived).toBeUndefined()
    await controller.recompute({})
    expect(controller.getState().status).toBe('ready')
    expect(controller.getState().snapshot!.atoms[0].id).toBe('new')
    controller.dispose()
  })

  it('rejects consumer failure after source acceptance, retains the source, and recovers on another edit', async () => {
    let fail = true
    const controller = createEditorController({
      mode: 'sync',
      commit: () => {
        if (fail) throw new Error('Consumer failed.')
      }
    })
    await expect(controller.load(molecule())).rejects.toMatchObject({ code: 'EDITOR_COMMIT' })
    expect(controller.getState().status).toBe('error')
    expect(controller.getState().snapshot!.atoms[0].id).toBe('a')
    fail = false
    await controller.execute({ type: 'set-element', atomId: 'a', element: 'N' })
    expect(controller.getState().status).toBe('ready')
    await controller.undo()
    await controller.redo()
    expect(controller.getState().revision).toBe(3)
    controller.dispose()
  })

  it('cancels a silent commit on clear/dispose and rejects queued lifecycle-stale commands', async () => {
    let entered = false
    const controller = createEditorController({
      mode: 'sync',
      commit: () => {
        entered = true
        return new Promise<void>(() => {})
      }
    })
    const pending = controller.load(molecule()).catch((error: Error) => error.name)
    await vi.waitFor(() => expect(entered).toBe(true))
    controller.clear()
    expect(await pending).toBe('AbortError')
    expect(controller.getState().status).toBe('empty')
    const queued = controller.load(molecule()).catch((error: Error) => error.name)
    controller.dispose()
    controller.dispose()
    expect(await queued).toBe('AbortError')
    expect(controller.getState()).toMatchObject({
      status: 'disposed',
      canUndo: false
    })
    expect(controller.getState().snapshot).toBeUndefined()
    await expect(controller.load(molecule())).rejects.toMatchObject({ code: 'CONTROLLER_DISPOSED' })
  })

  it('invalidates old document replies and finishes both promises during rapid loads', async () => {
    const transport = new ControlledTransport()
    const runtime = createRuntimeWithTransport({}, () => transport)
    const controller = createControllerWithRuntime({}, runtime)
    const first = controller.load(molecule('old')).catch((error: Error) => error.name)
    await vi.waitFor(() => expect(transport.messages).toHaveLength(1))
    const second = controller.load(molecule('new'))
    await vi.waitFor(() =>
      expect(transport.messages.filter((message) => message.kind === 'compute')).toHaveLength(2)
    )
    expect(await first).toBe('AbortError')
    transport.reply(transport.messages[0])
    transport.reply(transport.messages.at(-1)!)
    await second
    expect(controller.getState().snapshot!.atoms[0].id).toBe('new')
    controller.dispose()
  })

  it('bounds an unresponsive commit without resetting the accepted source', async () => {
    vi.useFakeTimers()
    const controller = createEditorController({
      mode: 'sync',
      timeoutMs: 20,
      commit: () => new Promise<void>(() => {})
    })
    const pending = controller
      .load(molecule())
      .catch((error: Error & { code?: string }) => error.code)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(20)
    expect(await pending).toBe('COMPUTATION_TIMEOUT')
    expect(controller.getState().status).toBe('error')
    expect(controller.getState().snapshot!.atoms[0].id).toBe('a')
    controller.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an overdue synchronous commit before the timeout timer can run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100)
    const signals: AbortSignal[] = []
    const controller = createEditorController({
      mode: 'sync',
      timeoutMs: 20,
      commit: (_value, _context, currentSignal) => {
        signals.push(currentSignal)
        // The consumer blocked the event loop, so its timer has not run yet.
        clock.mockReturnValue(121)
      }
    })
    try {
      const pending = controller.load(molecule()).catch((error: Error & { code?: string }) => error)
      await vi.advanceTimersByTimeAsync(0)
      expect(await pending).toMatchObject({ name: 'TimeoutError', code: 'COMPUTATION_TIMEOUT' })
      expect(controller.getState().status).toBe('error')
      expect(controller.getState().snapshot!.atoms[0].id).toBe('a')
      expect(controller.getState().derived).toBeUndefined()
      expect(signals[0]?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      controller.dispose()
      clock.mockRestore()
    }
  })
})
