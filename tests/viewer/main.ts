import {
  createViewer,
  type CameraPose,
  type Viewer,
  type ViewerCreateOptions,
  type ViewerEvent,
  type ViewerOptions
} from 'alchemion/viewer'
import type { EditCommand, StructureSnapshot, Vec3 } from 'alchemion/core'
import {
  BENCH_CAMERA,
  BENCH_OPTIONS,
  SMALL_CAMERA,
  benchmark,
  crystal,
  molecule,
  project
} from './fixtures'
import { observeResources } from '../shared/resources'

const ledger = observeResources()
const container = document.querySelector<HTMLElement>('#viewer')!
let viewer: Viewer | undefined
let second: Viewer | undefined
const events: ViewerEvent[] = []
let release: (() => void) | undefined
let selectionSequence = 0
let selectionTime = 0
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
async function until(predicate: () => boolean, message: string) {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > 10000) throw new Error(message)
    await pause(5)
  }
}
const current = () => {
  if (!viewer) throw new Error('Viewer is not open')
  return viewer
}
function subscribe(instance: Viewer) {
  return instance.subscribe((event) => {
    events.push(structuredClone(event))
    if (event.type === 'selection') {
      selectionSequence++
      selectionTime = performance.now()
      void window.__viewerSelection?.({
        sequence: selectionSequence,
        time: selectionTime,
        selection: event.selection
      })
    }
  })
}
function measurement() {
  const entries = performance.getEntriesByName('alchemion:render') as PerformanceMeasure[]
  const last = entries.at(-1)
  return last
    ? { duration: last.duration, detail: last.detail as Record<string, unknown> }
    : undefined
}
function targets() {
  const instance = current()
  const source = instance.getSnapshot()!
  const camera = instance.getCamera()
  return source.atoms.map((atom) => {
    const cartesian: Vec3 =
      'cartesian' in atom
        ? atom.cartesian
        : source.kind === 'periodic'
          ? ([0, 1, 2].map((row) =>
              source.cell.basis.reduce(
                (sum, column, i) => sum + column[row] * atom.fractional[i],
                0
              )
            ) as unknown as Vec3)
          : [0, 0, 0]
    return {
      id: atom.id,
      cartesian,
      ...project(cartesian, camera, container.clientWidth, container.clientHeight)
    }
  })
}
async function open(
  kind: 'molecule' | 'crystal' | 'orthogonal' | 'collinear' = 'molecule',
  options: ViewerCreateOptions = {}
) {
  release?.()
  viewer?.dispose()
  second?.dispose()
  second = undefined
  events.length = 0
  container.style.width = '900px'
  container.style.height = '700px'
  viewer = createViewer(container, {
    renderMode: 'ball-and-stick',
    inferBonds: false,
    showSymmetryMates: false,
    camera: SMALL_CAMERA,
    ...options
  })
  release = subscribe(viewer)
  let source: StructureSnapshot =
    kind === 'crystal' || kind === 'orthogonal' ? crystal(kind === 'orthogonal') : molecule()
  if (kind === 'collinear')
    source = {
      ...molecule(),
      atoms: molecule().atoms.map((atom, i) => ({
        ...atom,
        cartesian: [(i - 1) * 3, 0, 0] as Vec3
      }))
    }
  const caller = structuredClone(source)
  const loading = viewer.load(caller)
  ;(caller.atoms[0] as { element: string }).element = 'H'
  await loading
  const loadIsolated = viewer.getSnapshot()!.atoms[0].element === source.atoms[0].element
  ;(caller.atoms[0] as { element: string }).element = 'He'
  const isolated = viewer.getSnapshot()!.atoms[0].element === source.atoms[0].element
  try {
    ;(viewer.getSnapshot()!.atoms as unknown[]).length = 0
  } catch {
    /* Public snapshots may reject mutation by freezing their arrays. */
  }
  return {
    state: viewer.getState(),
    targets: targets(),
    render: measurement(),
    isolated,
    loadIsolated,
    snapshotIsolated: viewer.getSnapshot()!.atoms.length === source.atoms.length,
    initialEvent: events[0]
  }
}
function target(point: Vec3) {
  return project(point, current().getCamera(), container.clientWidth, container.clientHeight)
}
async function options(patch: Partial<ViewerOptions>) {
  await current().setOptions(patch)
  return { state: current().getState(), render: measurement(), targets: targets() }
}
async function execute(command: EditCommand | readonly EditCommand[]) {
  await current().execute(command)
  return inspect()
}
async function load(source: StructureSnapshot) {
  await current().load(source)
  return inspect()
}
function inspect() {
  return {
    state: current().getState(),
    snapshot: current().getSnapshot(),
    events,
    render: measurement(),
    resources: ledger.snapshot(),
    selectionSequence,
    selectionTime
  }
}
async function history(direction: 'undo' | 'redo') {
  await current()[direction]()
  return inspect()
}
async function editSelected() {
  const instance = current()
  const state = instance.getState()
  if (state.selection?.kind !== 'atom') throw new Error('Select an atom first')
  await instance.execute({
    type: 'set-element',
    atomId: state.selection.instance.sourceAtomId,
    element: 'F'
  })
  return inspect()
}
async function moveSelected(cartesian: Vec3) {
  const instance = current(),
    state = instance.getState()
  if (state.selection?.kind !== 'atom' || !state.documentId)
    throw new Error('Select an instance first')
  await instance.execute({
    type: 'set-instance-position',
    instance: state.selection.instance,
    cartesian,
    documentId: state.documentId,
    revision: state.revision
  })
  return inspect()
}
function camera(action: 'rotate' | 'zoom' | 'center' | 'set', value?: CameraPose) {
  const instance = current(),
    before = instance.getCamera()
  if (action === 'rotate') instance.rotate(20, 10)
  else if (action === 'zoom') instance.zoom(0.8)
  else if (action === 'center') instance.center()
  else instance.setCamera(value!)
  return { before, after: instance.getCamera(), targets: targets() }
}
async function asynchronous() {
  await open()
  const instance = current()
  const abort = (promise: Promise<void>) =>
    promise.then(
      () => 'resolved',
      (error: Error) => error.name
    )
  ledger.delayNextPost(100)
  const old = abort(instance.load({ ...molecule(), title: 'old' }))
  await instance.load({ ...molecule(), title: 'new' })
  await pause(150)
  const latest = {
    old: await old,
    title: instance.getSnapshot()!.title,
    status: instance.getState().status
  }
  const documentId = instance.getState().documentId
  const invalid = await abort(
    instance.load({
      ...molecule(),
      atoms: [{ id: 'invalid', element: 'NotAnElement', cartesian: [0, 0, 0] }]
    })
  )
  const preserved =
    instance.getState().documentId === documentId && instance.getSnapshot()!.title === 'new'
  ledger.failNextPost()
  const failed = await abort(instance.load({ ...molecule(), title: 'accepted-error' }))
  const failedState = { status: instance.getState().status, title: instance.getSnapshot()!.title }
  await instance.load(molecule())
  const recovered = instance.getState().status
  // Review counterexample: a visual-only failure must not publish a transient
  // ready from the still-ready scientific controller before entering error.
  const visualStart = events.length,
    visualDocument = instance.getState().documentId
  const visualFailure = await abort(instance.setOptions({ atomScale: Number.MAX_VALUE }))
  const visual = {
    result: visualFailure,
    status: instance.getState().status,
    sourcePreserved:
      instance.getState().documentId === visualDocument &&
      instance.getSnapshot()!.atoms.length === 4,
    states: events
      .slice(visualStart)
      .flatMap((event) => (event.type === 'state' ? [event.state.status] : []))
  }
  await instance.setOptions({ atomScale: 1 })
  const visualRecovered = instance.getState().status
  ledger.delayNextPost(100)
  const clearing = abort(instance.load(molecule()))
  instance.clear()
  await pause(150)
  const clear = {
    result: await clearing,
    status: instance.getState().status,
    resources: ledger.snapshot()
  }
  await instance.load(molecule())
  ledger.holdGpu(true)
  const rendering = abort(instance.load({ ...molecule(), title: 'dispose-during-gpu' }))
  await until(() => ledger.hasGpuFence(), 'The renderer did not enter GPU completion')
  instance.dispose()
  instance.dispose()
  release?.()
  ledger.holdGpu(false)
  await pause(20)
  return {
    latest,
    invalid,
    preserved,
    failed,
    failedState,
    recovered,
    visual,
    visualRecovered,
    clear,
    disposing: await rendering,
    status: instance.getState().status,
    resources: ledger.snapshot()
  }
}
async function cancellation() {
  await open('orthogonal')
  const instance = current()
  second = createViewer(document.querySelector<HTMLElement>('#second')!, {
    inferBonds: false,
    camera: SMALL_CAMERA
  })
  await second.load({ ...molecule(), title: 'cancellation-independent' })
  const independentDocument = second.getState().documentId
  const settle = (promise: Promise<void>) =>
    promise.then(
      () => 'resolved',
      (error: Error) => error.name
    )
  const identity = () => {
    const state = instance.getState()
    return {
      documentId: state.documentId,
      revision: state.revision,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      element: instance.getSnapshot()!.atoms[0].element
    }
  }
  const initial = identity()
  instance.cancel()
  const idle = {
    status: instance.getState().status,
    unchanged: JSON.stringify(initial) === JSON.stringify(identity())
  }
  const queued = [
    settle(instance.execute({ type: 'set-element', atomId: 'p', element: 'F' })),
    settle(instance.execute({ type: 'set-element', atomId: 'q', element: 'N' }))
  ]
  instance.cancel()
  instance.cancel()
  const queue = {
    results: await Promise.all(queued),
    status: instance.getState().status,
    unchanged: JSON.stringify(initial) === JSON.stringify(identity())
  }
  await instance.recompute()
  ledger.delayNextPost(120, 'derive')
  const deriving = settle(instance.execute({ type: 'set-element', atomId: 'p', element: 'N' }))
  await until(() => ledger.hasDelayedPost('derive'), 'The cancelled derive request was not sent')
  const accepted = identity()
  const waiting = settle(instance.setOptions({ atomScale: 0.8 }))
  let eventStart = events.length
  instance.cancel()
  await pause(160)
  const derive = {
    results: await Promise.all([deriving, waiting]),
    status: instance.getState().status,
    accepted,
    retained: identity(),
    states: events
      .slice(eventStart)
      .flatMap((event) => (event.type === 'state' ? [event.state.status] : []))
  }
  await instance.recompute()
  const retry = { status: instance.getState().status, retained: identity() }
  ledger.delayNextPost(120, 'brillouin-zone')
  const auxiliaryPending = settle(instance.setOptions({ showBrillouinZone: true }))
  await until(
    () => ledger.hasDelayedPost('brillouin-zone'),
    'The BZ cancellation stage was not reached'
  )
  eventStart = events.length
  instance.cancel()
  await pause(160)
  const auxiliary = {
    result: await auxiliaryPending,
    status: instance.getState().status,
    retained: identity(),
    states: events
      .slice(eventStart)
      .flatMap((event) => (event.type === 'state' ? [event.state.status] : [])),
    insets: container.querySelectorAll('[data-alchemion-inset]').length
  }
  await instance.recompute()
  ledger.holdGpu(true)
  const completedFrames = performance.getEntriesByName('alchemion:render').length
  const rendering = settle(instance.setOptions({ atomScale: 0.9 }))
  await until(() => ledger.hasGpuFence(), 'The cancelled frame did not enter GPU completion')
  const displayWaiter = settle(instance.setOptions({ bondRadius: 0.13 }))
  eventStart = events.length
  instance.cancel()
  instance.cancel()
  ledger.holdGpu(false)
  await pause(20)
  const gpu = {
    results: await Promise.all([rendering, displayWaiter]),
    status: instance.getState().status,
    retained: identity(),
    states: events
      .slice(eventStart)
      .flatMap((event) => (event.type === 'state' ? [event.state.status] : [])),
    noCompletedFrame: performance.getEntriesByName('alchemion:render').length === completedFrames
  }
  await instance.recompute()
  ledger.failNextPost()
  const failing = await settle(instance.recompute())
  const failed = { result: failing, status: instance.getState().status, retained: identity() }
  await instance.recompute()
  const recovered = {
    status: instance.getState().status,
    retained: identity(),
    render: measurement()
  }
  const independent = {
    status: second.getState().status,
    unchanged: second.getState().documentId === independentDocument,
    title: second.getSnapshot()!.title
  }
  await instance.undo()
  const undo = instance.getSnapshot()!.atoms[0].element
  await instance.redo()
  const redo = instance.getSnapshot()!.atoms[0].element
  instance.clear()
  const emptyRecompute = await settle(instance.recompute())
  instance.cancel()
  const empty = { result: emptyRecompute, status: instance.getState().status }
  instance.dispose()
  instance.cancel()
  release?.()
  second.dispose()
  second.cancel()
  await pause(20)
  return {
    idle,
    queue,
    derive,
    retry,
    auxiliary,
    gpu,
    failed,
    recovered,
    independent,
    undo,
    redo,
    empty,
    resources: ledger.snapshot()
  }
}
async function multiple() {
  await open()
  const a = current()
  second = createViewer(document.querySelector<HTMLElement>('#second')!, {
    inferBonds: false,
    renderMode: 'space-filling',
    camera: SMALL_CAMERA
  })
  const b = second
  await b.load({ ...molecule(), title: 'independent' })
  await Promise.all([
    a.execute({ type: 'set-element', atomId: 'a', element: 'F' }),
    b.execute({ type: 'set-element', atomId: 'a', element: 'Cl' })
  ])
  a.rotate(30, 10)
  const cameraB = b.getCamera()
  container.style.width = '800px'
  container.style.height = '600px'
  await until(
    () =>
      container.querySelector('canvas')!.width === 800 &&
      container.querySelector('canvas')!.height === 600,
    'ResizeObserver did not resize the drawing buffer'
  )
  const resized = {
    width: container.querySelector('canvas')!.width,
    height: container.querySelector('canvas')!.height
  }
  a.dispose()
  release?.()
  await b.execute({ type: 'set-element', atomId: 'b', element: 'H' })
  const result = {
    elementA: a.getState().status,
    elementB: b.getSnapshot()!.atoms[0].element,
    statusB: b.getState().status,
    cameraB: JSON.stringify(cameraB) === JSON.stringify(b.getCamera()),
    canvases: document.querySelectorAll('canvas').length,
    resized
  }
  b.dispose()
  b.dispose()
  await pause(20)
  return { ...result, resources: ledger.snapshot() }
}
async function unavailable() {
  viewer?.dispose()
  release?.()
  second?.dispose()
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof original
  let error = ''
  try {
    createViewer(container)
  } catch (failure) {
    error = (failure as Error).message
  } finally {
    HTMLCanvasElement.prototype.getContext = original
  }
  return { error, resources: ledger.snapshot() }
}
async function contextLoss() {
  await open()
  const instance = current()
  const canvas = container.querySelector('canvas')!
  const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')
  if (!extension) throw new Error('WEBGL_lose_context unavailable')
  extension.loseContext()
  await until(() => instance.getState().status === 'error', 'Context loss was not diagnosed')
  const diagnostics = instance.getState().diagnostics
  await pause(100)
  extension.restoreContext()
  await until(
    () => instance.getState().status === 'ready',
    'Context restore did not rebuild current structure'
  )
  return { diagnostics, state: instance.getState(), render: measurement(), targets: targets() }
}
async function lifecycle(
  rounds = 20,
  large = false,
  mode: ViewerOptions['renderMode'] = 'ball-and-stick'
) {
  viewer?.dispose()
  release?.()
  second?.dispose()
  const result = []
  for (let i = 0; i < rounds; i++) {
    const instance = createViewer(container, {
      ...(large ? BENCH_OPTIONS : {}),
      renderMode: mode,
      inferBonds: false,
      camera: large ? BENCH_CAMERA : SMALL_CAMERA
    })
    await instance.load(large ? benchmark() : molecule())
    await instance.execute({ type: 'set-element', atomId: large ? 'atom-0' : 'a', element: 'F' })
    instance.rotate(1, 1)
    const before = ledger.snapshot()
    instance.clear()
    const cleared = ledger.snapshot()
    instance.dispose()
    instance.dispose()
    await pause(0)
    result.push({
      round: i + 1,
      before,
      cleared,
      after: ledger.snapshot(),
      heap:
        (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? null
    })
  }
  return result
}
async function benchLoad(mode: ViewerOptions['renderMode']) {
  viewer?.dispose()
  release?.()
  second?.dispose()
  container.style.width = '1920px'
  container.style.height = '1080px'
  viewer = createViewer(container, { ...BENCH_OPTIONS, renderMode: mode, camera: BENCH_CAMERA })
  release = subscribe(viewer)
  performance.clearMeasures('alchemion:render')
  const started = performance.now()
  await viewer.load(benchmark())
  const gl = container.querySelector('canvas')!.getContext('webgl2')!,
    extension = gl.getExtension('WEBGL_debug_renderer_info')
  return {
    endToEndMs: performance.now() - started,
    render: measurement(),
    state: viewer.getState(),
    atoms: viewer.getSnapshot()!.atoms.length,
    sourceBonds: viewer.getSnapshot()!.bonds.length,
    webgl: {
      renderer: gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      vendor: gl.getParameter(extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      attributes: gl.getContextAttributes(),
      error: gl.getError()
    },
    quality: {
      canvas: { width: 1920, height: 1080, dpr: devicePixelRatio },
      sphere: { longitude: 24, latitude: 16 },
      cylinder: { segments: 16, capped: true },
      camera: BENCH_CAMERA,
      options: BENCH_OPTIONS
    }
  }
}
function benchTargets(count = 200) {
  const source = current().getSnapshot()!
  return Array.from({ length: count }, (_, i) => {
    const index = 9500 + ((i * 37) % 500),
      atom = source.atoms[index]
    if (!('cartesian' in atom)) throw new Error('Benchmark must be Cartesian')
    return { sourceId: atom.id, ...target(atom.cartesian) }
  })
}
async function interact(warmupMs = 10000, durationMs = 60000) {
  const times: number[] = [],
    longTasks: number[] = []
  const observer =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver((list) =>
          longTasks.push(...list.getEntries().map((entry) => entry.duration))
        )
      : undefined
  observer?.observe({ entryTypes: ['longtask'] })
  const started = performance.now()
  let last: number | undefined
  await new Promise<void>((done) => {
    const frame = (now: number) => {
      const elapsed = now - started,
        theta = (elapsed / 60000) * Math.PI * 2,
        elevation = 0.18 * Math.sin(theta * 2),
        horizontal = 160 * Math.cos(elevation)
      current().setCamera({
        ...BENCH_CAMERA,
        position: [
          36 + horizontal * Math.sin(theta),
          28.5 + 160 * Math.sin(elevation),
          28.5 + horizontal * Math.cos(theta)
        ]
      })
      if (elapsed >= warmupMs) {
        if (last !== undefined) times.push(now - last)
        last = now
      }
      if (elapsed >= warmupMs + durationMs) done()
      else requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  observer?.disconnect()
  current().setCamera(BENCH_CAMERA)
  await pause(50)
  return { times, longTasks }
}
async function updates(count = 100) {
  const times: number[] = [],
    endToEndTimes: number[] = [],
    dirtyAtomCounts: number[] = [],
    dirtyBondCounts: number[] = []
  let correct = true
  for (let iteration = 0; iteration < count; iteration++) {
    const source = current().getSnapshot()!
    const commands: EditCommand[] = []
    for (let j = 0; j < 100; j++) {
      const index =
          j < 50 ? 9500 + ((iteration * 37 + j) % 500) : (iteration * 97 + j * 101) % 9500,
        atom = source.atoms[index]
      if (!('cartesian' in atom)) throw new Error('Benchmark source must be Cartesian')
      commands.push({
        type: 'set-position',
        atomId: atom.id,
        position: {
          frame: 'cartesian',
          value: [
            atom.cartesian[0] + (iteration % 2 === 0 ? 0.08 : -0.08),
            atom.cartesian[1] + (iteration % 2 === 0 ? 0.04 : -0.04),
            atom.cartesian[2]
          ]
        }
      })
    }
    const started = performance.now()
    await current().execute(commands)
    endToEndTimes.push(performance.now() - started)
    const measured = measurement()
    if (!measured) throw new Error('Missing renderer timing')
    times.push(measured.duration)
    dirtyAtomCounts.push(Number(measured.detail.dirtyAtoms))
    dirtyBondCounts.push(Number(measured.detail.dirtyBonds))
    const after = new Map(
      current()
        .getSnapshot()!
        .atoms.map((atom) => [atom.id, atom])
    )
    correct &&= commands.every((command) => {
      if (command.type !== 'set-position') return false
      const atom = after.get(command.atomId)
      return (
        atom &&
        'cartesian' in atom &&
        atom.cartesian.every((v, i) => Math.abs(v - command.position.value[i]) < 1e-9)
      )
    })
    performance.clearMeasures('alchemion:render')
  }
  return { times, endToEndTimes, dirtyAtomCounts, dirtyBondCounts, correct }
}
async function updateProbe() {
  const instance = current(),
    source = instance.getSnapshot()!,
    atom = source.atoms.find((atom) => atom.id === 'atom-9500')!
  if (!('cartesian' in atom)) throw new Error('Benchmark source must be Cartesian')
  const moved: Vec3 = [90, 28.5, 57],
    point = target(moved),
    canvas = container.querySelector('canvas')!
  const capture = () => {
    const captured = ledger.captureFrame(canvas, [point])
    instance.setCamera(BENCH_CAMERA)
    return captured.then((pixels) => pixels[0])
  }
  const before = await capture()
  await instance.execute({
    type: 'set-position',
    atomId: atom.id,
    position: { frame: 'cartesian', value: moved }
  })
  const after = await capture()
  await instance.execute({
    type: 'set-position',
    atomId: atom.id,
    position: { frame: 'cartesian', value: atom.cartesian }
  })
  return {
    before,
    after,
    correct:
      before.every((value, i) => value === [255, 255, 255, 255][i]) &&
      after[3] === 255 &&
      after.slice(0, 3).some((value) => value < 245),
    point,
    sourceId: atom.id
  }
}

const settleFeature = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: Error) => error.name
  )

async function decodedPng(blob: Blob, labelPoint?: Vec3) {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  try {
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const pixel = (x: number, y: number) => {
      const index = (Math.floor(y) * image.width + Math.floor(x)) * 4
      return [...image.data.subarray(index, index + 4)]
    }
    let polyhedronPixels = 0
    for (let i = 0; i < image.data.length; i += 4)
      if (image.data[i + 1] > image.data[i] + 8 && image.data[i + 2] > image.data[i] + 8)
        polyhedronPixels++
    let textPixels = 0
    if (labelPoint) {
      const position = project(labelPoint, current().getCamera(), canvas.width, canvas.height)
      const scale = Math.min(
        canvas.width / container.clientWidth,
        canvas.height / container.clientHeight
      )
      // Exclude the horizontal measurement line. Red pixels above/below it
      // can only come from actual exported glyphs in this project-authored scene.
      for (
        let y = Math.max(0, Math.floor(position.y - 12 * scale));
        y < Math.min(canvas.height, position.y + 12 * scale);
        y++
      )
        for (
          let x = Math.max(0, Math.floor(position.x - 75 * scale));
          x < Math.min(canvas.width, position.x + 75 * scale);
          x++
        ) {
          if (Math.abs(y - position.y) <= 2 * scale) continue
          const [r, g, b, a] = pixel(x, y)
          if (a > 128 && r > 80 && r > g * 2 && r > b * 2) textPixels++
        }
    }
    const atom = project([-3, 0, 0], current().getCamera(), canvas.width, canvas.height)
    return {
      width: bitmap.width,
      height: bitmap.height,
      type: blob.type,
      bytes: blob.size,
      corner: pixel(0, 0),
      atom: pixel(atom.x, atom.y),
      textPixels,
      polyhedronPixels
    }
  } finally {
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
  }
}

const features = {
  select(ids: string[]) {
    current().setSelectedSourceAtomIds(ids)
    return inspect()
  },
  selectionValidation() {
    const instance = current()
    const input = ['q', 'p', 'q']
    instance.setSelectedSourceAtomIds(input)
    input.length = 0
    const accepted = instance.getState().selectedSourceAtomIds
    let rejected = false
    try {
      instance.setSelectedSourceAtomIds(['p', 'missing'])
    } catch {
      rejected = true
    }
    return { accepted, rejected, retained: instance.getState().selectedSourceAtomIds }
  },
  async translateSelected(delta: Vec3) {
    const instance = current()
    const source = instance.getSnapshot()!
    const selected = new Set(instance.getState().selectedSourceAtomIds)
    const commands: EditCommand[] = source.atoms
      .filter((atom) => selected.has(atom.id))
      .map((atom) => ({
        type: 'set-position',
        atomId: atom.id,
        position:
          'fractional' in atom
            ? {
                frame: 'fractional',
                value: atom.fractional.map((value, axis) => value + delta[axis]) as unknown as Vec3
              }
            : {
                frame: 'cartesian',
                value: atom.cartesian.map((value, axis) => value + delta[axis]) as unknown as Vec3
              }
      }))
    await instance.execute(commands)
    return inspect()
  },
  async supercellDefects() {
    await open('orthogonal', { showSymmetryMates: true })
    const instance = current()
    const original = instance.getSnapshot()!
    const documentId = instance.getState().documentId
    await instance.execute({ type: 'build-supercell', repetitions: [2, 1, 1] })
    const constructed = instance.getSnapshot()!
    const constructionRevision = instance.getState().revision
    const [vacancy, substitution] = constructed.atoms
    instance.setSelectedSourceAtomIds([vacancy.id, substitution.id])
    await instance.execute([
      { type: 'remove-atom', atomId: vacancy.id },
      { type: 'set-element', atomId: substitution.id, element: 'F' }
    ])
    const defect = { snapshot: instance.getSnapshot(), state: instance.getState() }
    await instance.undo()
    const restored = instance.getSnapshot()
    await instance.undo()
    const originalRestored = JSON.stringify(instance.getSnapshot()) === JSON.stringify(original)
    await instance.redo()
    return {
      documentId,
      constructed,
      constructionRevision,
      defect,
      restored,
      originalRestored,
      redone: instance.getSnapshot(),
      finalState: instance.getState()
    }
  },
  async coordination() {
    await open('molecule', { ballRadius: 0.18 })
    const instance = current()
    const atoms: { id: string; element: string; cartesian: Vec3 }[] = []
    const directions: Vec3[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1]
    ]
    for (const [name, x] of [
      ['left', -3],
      ['right', 3]
    ] as const) {
      atoms.push({ id: name, element: 'C', cartesian: [x, 0, 0] })
      directions.forEach((direction, index) =>
        atoms.push({
          id: `${name}-${index}`,
          element: 'O',
          cartesian: [x + direction[0], direction[1], direction[2]]
        })
      )
    }
    await instance.load({ kind: 'molecular', atoms, bonds: [] })
    instance.setCamera({ ...SMALL_CAMERA, position: [0, 0, 18], target: [0, 0, 0] })
    instance.setSelectedSourceAtomIds(['left', 'right'])
    const rules = [{ elements: ['C', 'O'] as const, maxDistance: 1.1 }]
    await instance.setOptions({ coordination: { rules, showPolyhedra: true } })
    const initial = instance.getState().coordination
    const visible = await decodedPng(await instance.exportPng({ width: 450, height: 350 }))
    await instance.setOptions({ coordination: { rules, showPolyhedra: false } })
    const hidden = await decodedPng(await instance.exportPng({ width: 450, height: 350 }))
    ledger.delayNextPost(120, 'coordination')
    instance.setSelectedSourceAtomIds(['left'])
    await until(
      () => ledger.hasDelayedPost('coordination'),
      'The old coordination request was not sent'
    )
    instance.setSelectedSourceAtomIds(['right'])
    await until(
      () =>
        instance.getState().status === 'ready' &&
        instance.getState().coordination?.centers[0]?.center.sourceAtomId === 'right',
      'Latest coordination selection was not committed'
    )
    await pause(160)
    const latest = { state: instance.getState(), source: instance.getSnapshot() }
    ledger.delayNextPost(120, 'coordination')
    const computing = settleFeature(
      instance.setOptions({
        coordination: {
          rules: [{ elements: ['C', 'O'], maxDistance: 1.2 }],
          showPolyhedra: true
        }
      })
    )
    await until(
      () => ledger.hasDelayedPost('coordination'),
      'The cancelled coordination request was not sent'
    )
    instance.cancel()
    const cancelled = await computing
    await pause(160)
    const cancelledState = instance.getState()
    await instance.recompute()
    instance.setSelectedSourceAtomIds(['right'])
    await until(() => instance.getState().status === 'ready', 'Selection did not recover')
    let reentered = false
    const stopReentry = instance.subscribe((event) => {
      if (!reentered && event.type === 'selection' && instance.getState().status === 'computing') {
        reentered = true
        instance.setSelectedSourceAtomIds(['left'])
      }
    })
    await instance.setOptions({
      coordination: { rules: [{ elements: ['C', 'O'], maxDistance: 1.15 }], showPolyhedra: true }
    })
    stopReentry()
    return {
      initial,
      visible,
      hidden,
      latest,
      cancelled,
      cancelledState,
      reentered,
      reentrantCenter: instance.getState().coordination?.centers[0]?.center.sourceAtomId,
      recovered: instance.getState()
    }
  },
  async pngAndView() {
    const instance = current()
    if (!instance.getState().measurement) throw new Error('A real measurement is required')
    const source = JSON.stringify(instance.getSnapshot())
    const revision = instance.getState().revision
    const camera = instance.getCamera()
    const annotated = await decodedPng(
      await instance.exportPng({ width: 3840, height: 2160, transparent: true }),
      [-1.5, 0, 0]
    )
    const exportUnchanged =
      JSON.stringify(camera) === JSON.stringify(instance.getCamera()) &&
      source === JSON.stringify(instance.getSnapshot()) &&
      revision === instance.getState().revision
    await instance.setOptions({ interactionMode: 'select' })
    const white = await decodedPng(
      await instance.exportPng({ width: 3840, height: 2160 }),
      [-1.5, 0, 0]
    )
    await instance.setOptions({
      renderMode: 'space-filling',
      elementStyles: { C: { color: '#309050' } },
      coordination: { rules: [{ elements: ['C', 'O'], maxDistance: 3.1 }], showPolyhedra: true }
    })
    instance.rotate(25, 10)
    const saved = instance.getViewState()
    const beforeInvalid = JSON.stringify(saved)
    const invalid = await settleFeature(
      instance.restoreViewState({ ...saved, version: 2 } as never)
    )
    const invalidCamera = await settleFeature(
      instance.restoreViewState({ ...saved, camera: { ...saved.camera, far: -1 } })
    )
    const invalidUnchanged = beforeInvalid === JSON.stringify(instance.getViewState())
    await instance.setOptions({
      renderMode: 'ball-and-stick',
      elementStyles: {},
      coordination: { rules: [], showPolyhedra: false }
    })
    instance.zoom(0.7)
    await instance.restoreViewState(JSON.parse(JSON.stringify(saved)))
    return {
      annotated,
      white,
      exportUnchanged,
      invalid,
      invalidCamera,
      invalidUnchanged,
      restored: JSON.stringify(instance.getViewState()) === JSON.stringify(saved),
      sourceUnchanged: source === JSON.stringify(instance.getSnapshot()),
      revisionUnchanged: revision === instance.getState().revision,
      state: instance.getState(),
      saved
    }
  },
  async pngResources() {
    await open()
    const instance = current()
    const quiet = async () => {
      await until(() => ledger.snapshot().rafs === 0, 'A viewer RAF did not settle')
      return ledger.snapshot()
    }
    const baseline = await quiet()
    await instance.exportPng({ width: 256, height: 128, transparent: true })
    const success = await quiet()
    const original = HTMLCanvasElement.prototype.toBlob
    let failure: string
    try {
      HTMLCanvasElement.prototype.toBlob = function (callback) {
        callback(null)
      }
      failure = await settleFeature(instance.exportPng({ width: 256, height: 128 }))
    } finally {
      HTMLCanvasElement.prototype.toBlob = original
    }
    const failed = await quiet()
    const holdEncoding = () => {
      let callback: BlobCallback | undefined
      HTMLCanvasElement.prototype.toBlob = function (next) {
        callback = next
      }
      return {
        wait: () => until(() => Boolean(callback), 'PNG encoding was not entered'),
        restore: () => {
          HTMLCanvasElement.prototype.toBlob = original
        },
        finish: () => {
          HTMLCanvasElement.prototype.toBlob = original
          callback?.(null)
        }
      }
    }
    let hold = holdEncoding()
    const cameraPending = settleFeature(instance.exportPng({ width: 256, height: 128 }))
    await hold.wait()
    instance.rotate(5, 0)
    const cameraCancel = await cameraPending
    hold.finish()
    const cameraReleased = await quiet()
    hold = holdEncoding()
    const replacedPending = settleFeature(instance.exportPng({ width: 256, height: 128 }))
    await hold.wait()
    hold.restore()
    await instance.exportPng({ width: 256, height: 128 })
    const superseded = await replacedPending
    hold.finish()
    const supersededReleased = await quiet()
    second = createViewer(document.querySelector<HTMLElement>('#second')!, {
      inferBonds: false,
      camera: SMALL_CAMERA
    })
    await second.load(molecule())
    instance.setSelectedSourceAtomIds(['a'])
    second.setSelectedSourceAtomIds(['b'])
    const secondCamera = JSON.stringify(second.getCamera())
    hold = holdEncoding()
    const firstPending = settleFeature(instance.exportPng({ width: 256, height: 128 }))
    await hold.wait()
    hold.restore()
    const secondPending = second.exportPng({ width: 128, height: 128 })
    instance.rotate(5, 0)
    const independent = {
      first: await firstPending,
      second: await decodedPng(await secondPending),
      secondCamera: secondCamera === JSON.stringify(second.getCamera()),
      firstSelection: instance.getState().selectedSourceAtomIds,
      secondSelection: second.getState().selectedSourceAtomIds
    }
    hold.finish()
    second.dispose()
    hold = holdEncoding()
    const clearedPending = settleFeature(instance.exportPng({ width: 256, height: 128 }))
    await hold.wait()
    const emptyEvents: {
      selected: readonly string[]
      coordination: boolean
      selection: boolean
    }[] = []
    const stopEmptyEvents = instance.subscribe((event) => {
      if (event.type === 'state' && event.state.status === 'empty')
        emptyEvents.push({
          selected: event.state.selectedSourceAtomIds,
          coordination: Boolean(event.state.coordination),
          selection: Boolean(event.state.selection)
        })
    })
    instance.clear()
    stopEmptyEvents()
    const cleared = await clearedPending
    hold.finish()
    await instance.load(molecule())
    hold = holdEncoding()
    const disposedPending = settleFeature(instance.exportPng({ width: 256, height: 128 }))
    await hold.wait()
    instance.dispose()
    const disposed = await disposedPending
    hold.finish()
    release?.()
    await pause(20)
    return {
      baseline,
      success,
      failure: failure!,
      failed,
      cameraCancel,
      cameraReleased,
      superseded,
      supersededReleased,
      independent,
      cleared,
      emptyEvents,
      disposed,
      resources: ledger.snapshot()
    }
  }
}

async function dispose() {
  current().dispose()
  current().dispose()
  release?.()
  await pause(20)
  return ledger.snapshot()
}
async function calculationLayers() {
  await open('orthogonal', { interactionMode: 'pick-result' })
  const viewer = current()
  const structure = viewer.getSnapshot()!
  const result = await viewer.results.register({
    version: 1,
    id: 'layer-fixture',
    sources: [{ name: 'analytic', format: 'fixture', sha256: 'a'.repeat(64) }],
    termination: 'unknown',
    convergence: 'unknown',
    initialFrameId: 'initial',
    frames: [{ id: 'initial', structure }],
    data: [
      {
        kind: 'grid',
        id: 'density',
        frameId: 'initial',
        quantity: 'density',
        unit: 'Å⁻³',
        grid: {
          origin: [0, 0, 0],
          steps: [
            [4, 0, 0],
            [0, 3, 0],
            [0, 0, 3.5]
          ],
          dimensions: [2, 2, 2],
          periodic: [true, true, true],
          values: [0, 1, 0, 1, 0, 1, 0, 1]
        }
      }
    ]
  })
  await viewer.results.bind(result.id)
  const [surface, slice] = await Promise.all([
    viewer.results.addLayer({
      kind: 'surface',
      resultId: result.id,
      datasetId: 'density',
      threshold: 0.5
    }),
    viewer.results.addLayer({
      kind: 'slice',
      resultId: result.id,
      datasetId: 'density',
      plane: { point: [0, 0, 2], normal: [0, 0, 1] }
    })
  ])
  await Promise.all([
    viewer.results.updateLayer(surface, { threshold: 0.25 }),
    viewer.results.updateLayer(surface, { threshold: 0.75 }),
    viewer.results.updateLayer(slice, { opacity: 0.8 })
  ])
  return viewer.results.getState()
}
async function calculationLifecycle() {
  const viewer = current()
  const picked = viewer.results.getState().pick
  const canvas = container.querySelector('canvas')!
  const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')
  if (!extension) throw new Error('WEBGL_lose_context unavailable')
  extension.loseContext()
  await until(() => viewer.getState().status === 'error', 'Context loss was not observed')
  const lost = viewer.results.getState().layers.map((layer) => layer.status)
  extension.restoreContext()
  await until(
    () => viewer.results.getState().layers.every((layer) => layer.status === 'ready'),
    'Result layers did not restore'
  )
  const layers = viewer.results.getState().layers
  const work = viewer.results.updateLayer(layers[0].id, { threshold: 0.625 })
  const revision = viewer.getState().revision
  await viewer.execute({
    type: 'set-element',
    atomId: viewer.getSnapshot()!.atoms[0].id,
    element: 'Ne'
  })
  await work
  const edited = viewer.results.getState().layers.map((layer) => layer.status)
  await viewer.undo()
  await until(
    () => viewer.results.getState().layers.every((layer) => layer.status === 'ready'),
    'Undo did not revalidate layers'
  )
  const undo = viewer.getState().revision
  const cancelled = viewer.results.updateLayer(layers[0].id, { threshold: 0.5 })
  viewer.cancel()
  await cancelled
  const afterCancel = viewer.results.getState().layers.map((layer) => layer.status)
  return { picked, lost, edited, revision, undo, afterCancel, resources: await dispose() }
}
window.viewerHarness = {
  open,
  inspect,
  options,
  target,
  execute,
  load,
  history,
  editSelected,
  moveSelected,
  camera,
  asynchronous,
  cancellation,
  multiple,
  unavailable,
  contextLoss,
  lifecycle,
  benchLoad,
  benchTargets,
  interact,
  updates,
  updateProbe,
  features,
  calculationLayers,
  calculationLifecycle,
  calculationState: () => current().results.getState(),
  dispose,
  clear: () => {
    current().clear()
    return inspect()
  },
  resourceDetails: () => ledger.listenerDetails()
}
export type ViewerHarnessApi = typeof window.viewerHarness
declare global {
  interface Window {
    viewerHarness: {
      open: typeof open
      inspect: typeof inspect
      options: typeof options
      target: typeof target
      execute: typeof execute
      load: typeof load
      history: typeof history
      editSelected: typeof editSelected
      moveSelected: typeof moveSelected
      camera: typeof camera
      asynchronous: typeof asynchronous
      cancellation: typeof cancellation
      multiple: typeof multiple
      unavailable: typeof unavailable
      contextLoss: typeof contextLoss
      lifecycle: typeof lifecycle
      benchLoad: typeof benchLoad
      benchTargets: typeof benchTargets
      interact: typeof interact
      updates: typeof updates
      updateProbe: typeof updateProbe
      features: typeof features
      calculationLayers: typeof calculationLayers
      calculationLifecycle: typeof calculationLifecycle
      calculationState: () => ReturnType<Viewer['results']['getState']>
      dispose: typeof dispose
      clear: () => ReturnType<typeof inspect>
      resourceDetails: () => ReturnType<typeof ledger.listenerDetails>
    }
    __viewerSelection?: (result: {
      sequence: number
      time: number
      selection: import('alchemion/viewer').ViewerSelection | undefined
    }) => void | Promise<void>
  }
}
