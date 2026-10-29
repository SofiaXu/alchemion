/** Browser-external ownership observation; no SDK resource counters are trusted. */
export function observeResources() {
  const workers = new Set<Worker>()
  const rafs = new Set<number>()
  const observers = new Map<ResizeObserver, Set<Element>>()
  const contexts = new Map<WebGL2RenderingContext, Map<string, Set<unknown>>>()
  const registrations = new Set<{
    target: EventTarget
    type: string
    listener: EventListenerOrEventListenerObject
    capture: boolean
    wrapped: EventListener
    stack: string | undefined
    owner: 'sdk' | 'playwright' | 'user-script'
  }>()
  let delayedPosts = 0
  let delayedCategory: string | undefined
  const delayedInFlight = new Set<string>()
  let failedPosts = 0
  let gpuHeld = false
  const captures: {
    canvas: HTMLCanvasElement
    points: readonly { x: number; y: number }[]
    resolve: (pixels: number[][]) => void
  }[] = []
  const originalAdd = EventTarget.prototype.addEventListener
  const originalRemove = EventTarget.prototype.removeEventListener
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (!listener) return
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false)
    if (
      [...registrations].some(
        (r) =>
          r.target === this && r.type === type && r.listener === listener && r.capture === capture
      )
    )
      return
    const stack = new Error().stack
    // Diagnose actual registration provenance, rather than subtracting a fixed
    // baseline. The full external registrations remain available as evidence.
    const owner =
      /InjectedScript|addHitTargetInterceptorListeners|_setupGlobalListenersRemovalDetection/.test(
        stack ?? ''
      )
        ? 'playwright'
        : /\.user\.js|https?:\/\/local\.adguard\.org\//.test(stack ?? '')
          ? 'user-script'
          : 'sdk'
    const entry = {
      target: this,
      type,
      listener,
      capture,
      stack,
      owner: owner as 'sdk' | 'playwright' | 'user-script',
      wrapped: ((event: Event) => {
        if (typeof options === 'object' && options.once) registrations.delete(entry)
        if (typeof listener === 'function') listener.call(this, event)
        else listener.handleEvent(event)
      }) as EventListener
    }
    if (typeof options === 'object' && options.signal?.aborted) return
    registrations.add(entry)
    originalAdd.call(this, type, entry.wrapped, options)
    if (typeof options === 'object' && options.signal)
      originalAdd.call(options.signal, 'abort', () => registrations.delete(entry), { once: true })
  }
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false)
    const entry = [...registrations].find(
      (r) =>
        r.target === this && r.type === type && r.listener === listener && r.capture === capture
    )
    if (entry) {
      registrations.delete(entry)
      originalRemove.call(this, type, entry.wrapped, options)
    } else originalRemove.call(this, type, listener, options)
  }
  const NativeWorker = window.Worker
  window.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker
      workers.add(worker)
      const terminate = worker.terminate.bind(worker)
      worker.terminate = () => {
        workers.delete(worker)
        terminate()
      }
      const post = worker.postMessage.bind(worker)
      worker.postMessage = ((
        message: { kind?: string; category?: string },
        options?: StructuredSerializeOptions
      ) => {
        if (message?.kind === 'compute' && failedPosts > 0) {
          failedPosts--
          throw new Error('M5 external transport failure')
        }
        if (
          message?.kind === 'compute' &&
          delayedPosts > 0 &&
          (delayedCategory === undefined || delayedCategory === message.category)
        ) {
          const delay = delayedPosts
          delayedPosts = 0
          delayedCategory = undefined
          const category = message.category ?? ''
          delayedInFlight.add(category)
          setTimeout(() => {
            delayedInFlight.delete(category)
            if (workers.has(worker)) post(message, options)
          }, delay)
        } else post(message, options)
      }) as typeof worker.postMessage
      return worker
    }
  })
  const request = window.requestAnimationFrame.bind(window)
  const cancel = window.cancelAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => {
    const id = request((time) => {
      rafs.delete(id)
      callback(time)
      for (const capture of captures.splice(0)) {
        const gl = capture.canvas.getContext('webgl2')!
        capture.resolve(
          capture.points.map((point) => {
            const pixel = new Uint8Array(4)
            gl.readPixels(
              Math.floor(point.x),
              capture.canvas.height - 1 - Math.floor(point.y),
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixel
            )
            return [...pixel]
          })
        )
      }
    })
    rafs.add(id)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    rafs.delete(id)
    cancel(id)
  }
  const NativeObserver = window.ResizeObserver
  window.ResizeObserver = new Proxy(NativeObserver, {
    construct(target, args) {
      const observer = Reflect.construct(target, args) as ResizeObserver
      const elements = new Set<Element>()
      const observe = observer.observe.bind(observer)
      const unobserve = observer.unobserve.bind(observer)
      const disconnect = observer.disconnect.bind(observer)
      observer.observe = (element, options) => {
        elements.add(element)
        observers.set(observer, elements)
        observe(element, options)
      }
      observer.unobserve = (element) => {
        elements.delete(element)
        if (!elements.size) observers.delete(observer)
        unobserve(element)
      }
      observer.disconnect = () => {
        elements.clear()
        observers.delete(observer)
        disconnect()
      }
      return observer
    }
  })
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    ...args: Parameters<typeof getContext>
  ) {
    const context = getContext.apply(this, args)
    if (args[0] === 'webgl2' && context && !contexts.has(context as WebGL2RenderingContext)) {
      const gl = context as WebGL2RenderingContext
      const kinds = new Map<string, Set<unknown>>()
      contexts.set(gl, kinds)
      const wait = gl.clientWaitSync.bind(gl)
      gl.clientWaitSync = (...values) => (gpuHeld ? gl.TIMEOUT_EXPIRED : wait(...values))
      const target = gl as unknown as Record<string, (...values: unknown[]) => unknown>
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
        kinds.set(kind, live)
        const createName = kind === 'Sync' ? 'fenceSync' : `create${kind}`
        const removeName = `delete${kind}`
        const create = target[createName].bind(gl)
        const remove = target[removeName].bind(gl)
        target[createName] = (...values) => {
          const value = create(...values)
          if (value != null) live.add(value)
          return value
        }
        target[removeName] = (...values) => {
          live.delete(values[0])
          return remove(...values)
        }
      }
      originalAdd.call(this, 'webglcontextlost', () => {
        for (const live of kinds.values()) live.clear()
      })
    }
    return context
  } as typeof getContext
  return {
    snapshot() {
      let gpuObjects = 0
      for (const [gl, kinds] of contexts)
        if (!gl.isContextLost()) for (const handles of kinds.values()) gpuObjects += handles.size
      return {
        gpuObjects,
        workers: workers.size,
        rafs: rafs.size,
        observers: observers.size,
        listeners: [...registrations].filter((entry) => entry.owner === 'sdk').length,
        canvases: document.querySelectorAll('canvas').length
      }
    },
    delayNextPost(ms: number, category?: string) {
      delayedPosts = ms
      delayedCategory = category
    },
    hasDelayedPost(category: string) {
      return delayedInFlight.has(category)
    },
    failNextPost() {
      failedPosts++
    },
    holdGpu(held: boolean) {
      gpuHeld = held
    },
    hasGpuFence() {
      return [...contexts.values()].some((kinds) => (kinds.get('Sync')?.size ?? 0) > 0)
    },
    listenerDetails() {
      return [...registrations].map((entry) => ({
        target: entry.target.constructor.name,
        type: entry.type,
        capture: entry.capture,
        listener: String(entry.listener).slice(0, 180),
        stack: entry.stack,
        owner: entry.owner
      }))
    },
    captureFrame(canvas: HTMLCanvasElement, points: readonly { x: number; y: number }[]) {
      return new Promise<number[][]>((resolve) => captures.push({ canvas, points, resolve }))
    }
  }
}
export type ResourceCounts = ReturnType<ReturnType<typeof observeResources>['snapshot']>
