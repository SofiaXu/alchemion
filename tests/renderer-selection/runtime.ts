import type {
  AdapterFactory,
  Candidate,
  DisplayMode,
  PickResult,
  RenderSnapshot
} from './contracts'
import { CAMERA, HEIGHT, SCENE, WIDTH, type prepareFixture } from './fixture'
import { assertReleased, gpuComplete, ResourceLedger } from './resources'
import type { WorkerReply, WorkerRequest } from './protocol-worker'

export interface SelectionObservation {
  sequence: number
  pick?: PickResult
  eventTime: number
}

export interface RequestOptions {
  documentId: string
  revision: number
  delayMs?: number
  fail?: boolean
  ignoreCancel?: boolean
  timeoutMs?: number
}

function abortError(): DOMException {
  return new DOMException('M2 request was superseded or disposed.', 'AbortError')
}

export class SnapshotRuntime {
  private readonly worker = new Worker(new URL('./protocol-worker.ts', import.meta.url), {
    type: 'module'
  })
  private sequence = 0
  private documentId = ''
  private revision = -1
  private disposed = false
  private readonly pending = new Map<
    number,
    {
      resolve: () => void
      reject: (error: Error | DOMException) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  staleReplies = 0
  commits = 0
  committedDocumentId = ''
  committedRevision = -1

  constructor(
    private readonly ledger: ResourceLedger,
    private readonly apply: (snapshot: RenderSnapshot) => Promise<void>
  ) {
    ledger.adjust('workers', 1)
    for (const [event, handler] of this.listeners) {
      this.worker.addEventListener(event, handler)
      ledger.adjust('listeners', 1)
    }
  }

  private readonly onMessage = (event: Event) => {
    const reply = (event as MessageEvent<WorkerReply>).data
    const record = this.pending.get(reply.requestId)
    if (
      !record ||
      this.disposed ||
      reply.requestId !== this.sequence ||
      reply.documentId !== this.documentId ||
      reply.revision !== this.revision
    ) {
      this.staleReplies++
      return
    }
    if (reply.kind === 'error' || !reply.snapshot) {
      this.finish(
        reply.requestId,
        new Error(reply.message ?? 'M2 Worker response has no snapshot.')
      )
      return
    }
    void this.apply(reply.snapshot).then(
      () => {
        if (!this.pending.has(reply.requestId) || this.disposed) return
        this.commits++
        this.committedDocumentId = reply.documentId
        this.committedRevision = reply.revision
        this.finish(reply.requestId)
      },
      (error: Error) => this.finish(reply.requestId, error)
    )
  }

  private readonly onError = () => this.cancel(new Error('M2 Worker transport failed.'))
  private readonly listeners: [string, EventListener][] = [
    ['message', this.onMessage],
    ['error', this.onError],
    ['messageerror', this.onError]
  ]

  private finish(id: number, error?: Error | DOMException) {
    const record = this.pending.get(id)
    if (!record) return
    clearTimeout(record.timer)
    this.pending.delete(id)
    this.ledger.adjust('pending', -1)
    if (error) record.reject(error)
    else record.resolve()
  }

  private cancel(error: Error | DOMException = abortError()) {
    for (const id of [...this.pending.keys()]) {
      const message: WorkerRequest = {
        kind: 'cancel',
        requestId: id,
        documentId: this.documentId,
        revision: this.revision
      }
      this.worker.postMessage(message)
      this.finish(id, error)
    }
  }

  request(snapshot: RenderSnapshot, options: RequestOptions): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('M2 runtime is disposed.'))
    this.cancel()
    this.documentId = options.documentId
    this.revision = options.revision
    const requestId = ++this.sequence
    const copy = structuredClone(snapshot)
    const request: WorkerRequest = { ...options, kind: 'compute', requestId, snapshot: copy }
    this.ledger.adjust('pending', 1)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.finish(requestId, new Error('M2 Worker request timed out.')),
        options.timeoutMs ?? 30000
      )
      this.pending.set(requestId, { resolve, reject, timer })
      try {
        this.worker.postMessage(request, [
          copy.positions.buffer,
          copy.colors.buffer,
          copy.bondEndpoints.buffer
        ])
      } catch (error) {
        this.finish(requestId, error as Error)
      }
    })
  }

  clear(): void {
    this.cancel()
    this.sequence++
    this.documentId = ''
    this.revision = -1
  }

  dispose(): void {
    if (this.disposed) return
    this.clear()
    this.disposed = true
    for (const [event, handler] of this.listeners) {
      this.worker.removeEventListener(event, handler)
      this.ledger.adjust('listeners', -1)
    }
    this.worker.terminate()
    this.ledger.adjust('workers', -1)
  }
}

let viewerSequence = 0
export class ComparisonViewer {
  readonly id = `m2-viewer-${++viewerSequence}`
  readonly canvas = document.createElement('canvas')
  readonly gl: WebGL2RenderingContext
  readonly ledger: ResourceLedger
  readonly adapter: ReturnType<AdapterFactory>
  readonly runtime: SnapshotRuntime
  private readonly observer: ResizeObserver
  private disposed = false
  private generation = 0
  private readonly rafs = new Set<number>()
  private readonly cancelMotion = new Set<() => void>()
  private readonly performanceObservers = new Set<PerformanceObserver>()
  selection: SelectionObservation = { sequence: 0, eventTime: 0 }
  snapshot?: RenderSnapshot
  initializationMs: number

  constructor(
    factory: AdapterFactory,
    readonly candidate: Candidate,
    readonly mode: DisplayMode,
    container: HTMLElement
  ) {
    const started = performance.now()
    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT
    this.canvas.style.width = `${WIDTH}px`
    this.canvas.style.height = `${HEIGHT}px`
    this.canvas.dataset.viewerId = this.id
    container.append(this.canvas)
    const gl = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    })
    if (!gl) {
      this.canvas.remove()
      throw new Error('WEBGL2_UNAVAILABLE: M2 requires a desktop WebGL2 context.')
    }
    this.gl = gl
    this.ledger = new ResourceLedger(gl, this.canvas)
    try {
      this.adapter = factory({ canvas: this.canvas, gl, scene: SCENE, camera: CAMERA })
    } catch (error) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      this.canvas.remove()
      throw error
    }
    this.runtime = new SnapshotRuntime(this.ledger, (snapshot) => this.setSnapshot(snapshot))
    this.canvas.addEventListener('pointerup', this.onPointer)
    this.observer = new ResizeObserver((entries) => {
      if (!this.disposed) {
        const rect = entries[0].contentRect
        const width = Math.max(1, Math.round(rect.width))
        const height = Math.max(1, Math.round(rect.height))
        if (width === this.canvas.width && height === this.canvas.height) return
        this.canvas.width = width
        this.canvas.height = height
        this.canvas.style.width = `${width}px`
        this.canvas.style.height = `${height}px`
        this.adapter.resize(width, height)
        if (this.snapshot) this.adapter.render()
      }
    })
    this.observer.observe(container)
    this.ledger.adjust('observers', 1)
    this.initializationMs = performance.now() - started
  }

  private readonly onPointer = (event: PointerEvent) => {
    if (this.disposed) return
    const rect = this.canvas.getBoundingClientRect()
    const pick = this.adapter.pick(
      ((event.clientX - rect.left) * this.canvas.width) / rect.width,
      ((event.clientY - rect.top) * this.canvas.height) / rect.height
    )
    this.selection = { sequence: this.selection.sequence + 1, pick, eventTime: event.timeStamp }
    this.canvas.dataset.selection = pick?.instanceId ?? ''
    const callback = (
      window as Window & {
        __m2Selection?: (selection: SelectionObservation) => Promise<void> | void
      }
    ).__m2Selection
    void callback?.(this.selection)
  }

  async setSnapshot(snapshot: RenderSnapshot): Promise<void> {
    if (this.disposed) throw abortError()
    this.cancelFrames()
    const generation = ++this.generation
    this.snapshot = snapshot
    this.adapter.setSnapshot(snapshot, this.mode)
    await this.completeFrame(generation)
  }

  async completeFrame(generation = this.generation): Promise<void> {
    const valid = () => {
      if (this.disposed || generation !== this.generation) throw abortError()
    }
    const started = performance.now()
    while (true) {
      valid()
      if (this.adapter.render()) break
      if (performance.now() - started > 30000)
        throw new Error('M2 complete frame timed out while materials were preparing.')
      await this.nextFrame()
    }
    await gpuComplete(this.gl)
    valid()
    await this.nextFrame()
    valid()
  }

  private nextFrame(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed) return reject(abortError())
      const cancel = () => reject(abortError())
      this.cancelMotion.add(cancel)
      this.frame(() => {
        this.cancelMotion.delete(cancel)
        resolve()
      })
    })
  }

  frame(callback: (now: number) => void): number {
    const id = requestAnimationFrame((now) => {
      this.rafs.delete(id)
      this.ledger.adjust('rafs', -1)
      if (!this.disposed) callback(now)
    })
    this.rafs.add(id)
    this.ledger.adjust('rafs', 1)
    return id
  }

  async motion(warmupMs: number, durationMs: number, pose: typeof import('./fixture').orbitCamera) {
    const frames: number[] = []
    const longTasks: { startTime: number; duration: number }[] = []
    const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            longTasks.push({ startTime: entry.startTime, duration: entry.duration })
        })
      : undefined
    observer?.observe({ type: 'longtask', buffered: false })
    if (observer) {
      this.performanceObservers.add(observer)
      this.ledger.adjust('observers', 1)
    }
    let start = 0
    let last = 0
    try {
      await new Promise<void>((resolve, reject) => {
        const cancel = () => reject(abortError())
        this.cancelMotion.add(cancel)
        const tick = (now: number) => {
          if (!start) start = now
          const elapsed = now - start
          this.adapter.setCamera(pose(Math.max(0, elapsed - warmupMs)))
          this.adapter.render()
          if (elapsed >= warmupMs && last >= start + warmupMs) frames.push(now - last)
          last = now
          if (elapsed < warmupMs + durationMs) this.frame(tick)
          else {
            this.cancelMotion.delete(cancel)
            resolve()
          }
        }
        this.frame(tick)
      })
      await gpuComplete(this.gl)
    } finally {
      observer?.disconnect()
      if (observer && this.performanceObservers.delete(observer))
        this.ledger.adjust('observers', -1)
    }
    const sorted = [...frames].sort((a, b) => a - b)
    return {
      frames,
      medianFps: 1000 / sorted[Math.floor(sorted.length / 2)],
      frameP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      longTasks
    }
  }

  environment() {
    const debug = this.gl.getExtension('WEBGL_debug_renderer_info')
    return {
      webgl2: true,
      renderer: debug
        ? (this.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string)
        : (this.gl.getParameter(this.gl.RENDERER) as string),
      vendor: debug
        ? (this.gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) as string)
        : (this.gl.getParameter(this.gl.VENDOR) as string),
      version: this.gl.getParameter(this.gl.VERSION) as string,
      attributes: this.gl.getContextAttributes(),
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent
    }
  }

  clear(): void {
    if (this.disposed) return
    this.generation++
    this.cancelFrames()
    this.runtime.clear()
    this.snapshot = undefined
    this.adapter.clear()
    this.adapter.render()
    this.selection = { sequence: this.selection.sequence + 1, eventTime: performance.now() }
  }

  dispose() {
    if (this.disposed) return this.ledger.snapshot()
    this.disposed = true
    this.generation++
    this.cancelFrames()
    for (const observer of this.performanceObservers) {
      observer.disconnect()
      this.ledger.adjust('observers', -1)
    }
    this.performanceObservers.clear()
    this.runtime.dispose()
    this.observer.disconnect()
    this.ledger.adjust('observers', -1)
    this.canvas.removeEventListener('pointerup', this.onPointer)
    this.adapter.dispose()
    // Context loss is an actual release mechanism, not a counter reset. The ledger
    // retains the undeleted handle counts and reports their context-owned release.
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.canvas.remove()
    this.ledger.adjust('canvases', -1)
    const counts = this.ledger.snapshot()
    assertReleased(counts)
    return counts
  }

  private cancelFrames() {
    for (const cancel of this.cancelMotion) cancel()
    this.cancelMotion.clear()
    for (const id of this.rafs) {
      cancelAnimationFrame(id)
      this.ledger.adjust('rafs', -1)
    }
    this.rafs.clear()
  }
}

export type Fixture = Awaited<ReturnType<typeof prepareFixture>>
