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
import { observeResources } from './resources'

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
      void window.__m5Selection?.({
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
  await viewer.load(caller)
  ;(caller.atoms[0] as { element: string }).element = 'H'
  return {
    state: viewer.getState(),
    targets: targets(),
    render: measurement(),
    isolated: viewer.getSnapshot()!.atoms[0].element !== 'H',
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
async function dispose() {
  current().dispose()
  current().dispose()
  release?.()
  await pause(20)
  return ledger.snapshot()
}
window.m5 = {
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
  multiple,
  unavailable,
  contextLoss,
  lifecycle,
  benchLoad,
  benchTargets,
  interact,
  updates,
  updateProbe,
  dispose,
  clear: () => {
    current().clear()
    return inspect()
  },
  resourceDetails: () => ledger.listenerDetails()
}
export type M5Api = typeof window.m5
declare global {
  interface Window {
    m5: {
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
      multiple: typeof multiple
      unavailable: typeof unavailable
      contextLoss: typeof contextLoss
      lifecycle: typeof lifecycle
      benchLoad: typeof benchLoad
      benchTargets: typeof benchTargets
      interact: typeof interact
      updates: typeof updates
      updateProbe: typeof updateProbe
      dispose: typeof dispose
      clear: () => ReturnType<typeof inspect>
      resourceDetails: () => ReturnType<typeof ledger.listenerDetails>
    }
    __m5Selection?: (result: {
      sequence: number
      time: number
      selection: import('alchemion/viewer').ViewerSelection | undefined
    }) => void | Promise<void>
  }
}
