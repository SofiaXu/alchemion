export interface ResourceCounts {
  gpuObjects: number
  gpuByKind: Record<string, number>
  handlesReleasedByContextLoss: number
  contextLost: boolean
  workers: number
  rafs: number
  observers: number
  listeners: number
  pending: number
  canvases: number
}

export class ResourceLedger {
  private readonly handles = new Map<string, Set<unknown>>()
  private readonly counts = {
    workers: 0,
    rafs: 0,
    observers: 0,
    listeners: 0,
    pending: 0,
    canvases: 1
  }

  constructor(
    readonly gl: WebGL2RenderingContext,
    canvas?: HTMLCanvasElement
  ) {
    const target = gl as unknown as Record<string, unknown>
    for (const kind of [
      'Buffer',
      'Texture',
      'Program',
      'Shader',
      'Framebuffer',
      'Renderbuffer',
      'VertexArray',
      'TransformFeedback',
      'Query',
      'Sampler',
      'Sync'
    ]) {
      const live = new Set<unknown>()
      this.handles.set(kind, live)
      const createName = kind === 'Sync' ? 'fenceSync' : `create${kind}`
      const deleteName = `delete${kind}`
      const create = target[createName] as (...args: unknown[]) => unknown
      const remove = target[deleteName] as (...args: unknown[]) => unknown
      target[createName] = (...args: unknown[]) => {
        const resource = create.apply(gl, args)
        if (resource != null) live.add(resource)
        return resource
      }
      target[deleteName] = (...args: unknown[]) => {
        const result = remove.apply(gl, args)
        live.delete(args[0])
        return result
      }
    }
    if (canvas) {
      const registered: {
        type: string
        listener: EventListenerOrEventListenerObject
        capture: boolean
      }[] = []
      const add = canvas.addEventListener.bind(canvas)
      const remove = canvas.removeEventListener.bind(canvas)
      const target = canvas as unknown as Record<string, unknown>
      target.addEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) => {
        if (!listener) return
        add(type, listener, options)
        const capture = typeof options === 'boolean' ? options : (options?.capture ?? false)
        if (
          !registered.some(
            (entry) =>
              entry.type === type && entry.listener === listener && entry.capture === capture
          )
        ) {
          registered.push({ type, listener, capture })
          this.adjust('listeners', 1)
        }
      }
      target.removeEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions
      ) => {
        if (!listener) return
        remove(type, listener, options)
        const capture = typeof options === 'boolean' ? options : (options?.capture ?? false)
        const index = registered.findIndex(
          (entry) => entry.type === type && entry.listener === listener && entry.capture === capture
        )
        if (index >= 0) {
          registered.splice(index, 1)
          this.adjust('listeners', -1)
        }
      }
    }
  }

  adjust(kind: keyof ResourceLedger['counts'], delta: number): void {
    this.counts[kind] += delta
    if (this.counts[kind] < 0) throw new Error(`Negative resource count: ${kind}`)
  }

  snapshot(): ResourceCounts {
    const contextLost = this.gl.isContextLost()
    const raw = Object.fromEntries([...this.handles].map(([kind, values]) => [kind, values.size]))
    const handles = Object.values(raw).reduce((sum, count) => sum + count, 0)
    return {
      gpuObjects: contextLost ? 0 : handles,
      gpuByKind: contextLost ? Object.fromEntries(Object.keys(raw).map((kind) => [kind, 0])) : raw,
      handlesReleasedByContextLoss: contextLost ? handles : 0,
      contextLost,
      ...this.counts
    }
  }
}

export async function gpuComplete(gl: WebGL2RenderingContext): Promise<void> {
  if (gl.isContextLost()) throw new Error('M2 WebGL context was lost before frame completion.')
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  if (!fence) throw new Error('M2 could not allocate a GPU completion fence.')
  gl.flush()
  const start = performance.now()
  try {
    while (true) {
      const state = gl.clientWaitSync(fence, 0, 0)
      if (state === gl.ALREADY_SIGNALED || state === gl.CONDITION_SATISFIED) break
      if (state === gl.WAIT_FAILED || gl.isContextLost())
        throw new Error('M2 GPU completion fence failed.')
      if (performance.now() - start > 30000) throw new Error('M2 GPU completion fence timed out.')
      await new Promise<void>((done) => setTimeout(done, 0))
    }
  } finally {
    gl.deleteSync(fence)
  }
}

export function assertReleased(counts: ResourceCounts): void {
  const active =
    counts.gpuObjects +
    counts.workers +
    counts.rafs +
    counts.observers +
    counts.listeners +
    counts.pending +
    counts.canvases
  if (active !== 0) throw new Error(`M2 viewer leaked resources: ${JSON.stringify(counts)}`)
}
