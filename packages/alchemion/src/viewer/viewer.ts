import { cartesianToFractional } from '../core/cell'
import { measureAngle, measureDistance, measureTorsion } from '../core/measurements'
import type { BrillouinZone } from '../core/brillouin-zone'
import type { ReciprocalLattice } from '../core/reciprocal'
import type { AtomInstance, DerivedStructure, Diagnostic, ScientificResult } from '../core/types'
import { createThreeBackend } from './backend/three'
import { createRenderFrame } from './frame'
import { createControllerWithRuntime } from './runtime/controller'
import { createComputationRuntime } from './runtime/runtime'
import { abortError, ComputationError } from './runtime/types'
import type { ComputationContext, EditorState } from './runtime/types'
import {
  DEFAULT_OPTIONS,
  derivationChanged,
  derivationOptions,
  immutable,
  mergeOptions,
  validateCamera
} from './options'
import type {
  Viewer,
  ViewerCreateOptions,
  ViewerEvent,
  ViewerMeasurement,
  ViewerOptions,
  ViewerSelection,
  ViewerState
} from './types'

const cancelled = (error: unknown) => error instanceof Error && error.name === 'AbortError'
function diagnosticsOf(error: unknown): readonly Diagnostic[] {
  return error instanceof ComputationError
    ? error.diagnostics
    : [
        {
          severity: 'error',
          code: 'VIEWER_RENDER',
          message: error instanceof Error ? error.message : 'The viewer operation failed.'
        }
      ]
}
function resultValue<T>(result: ScientificResult<T>): T {
  if (!result.ok)
    throw new ComputationError(
      result.diagnostics[0].code,
      result.diagnostics[0].message,
      result.diagnostics
    )
  return result.value
}

/** Creates one owned canvas/backend and one lazily started, controller-owned Worker. */
export function createViewer(container: HTMLElement, initial: ViewerCreateOptions = {}): Viewer {
  if (!container?.ownerDocument || typeof container.appendChild !== 'function')
    throw new TypeError('VIEWER_CONTAINER: an HTML container is required.')
  const { historyLimit, mode, timeoutMs, camera, ...presentation } = initial
  let options = mergeOptions(DEFAULT_OPTIONS, presentation)
  if (camera) validateCamera(camera)
  const document = container.ownerDocument
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none'
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Alchemion structure viewer')
  const overlay = document.createElement('div')
  overlay.dataset.alchemionOverlay = ''
  overlay.style.cssText =
    'position:absolute;inset:0;pointer-events:none;overflow:hidden;font:12px system-ui,sans-serif;color:#202936'
  const originalPosition = container.style.position
  const setRelative = document.defaultView?.getComputedStyle(container).position === 'static'
  if (setRelative) container.style.position = 'relative'
  container.append(canvas, overlay)
  const listeners = new Set<(event: ViewerEvent) => void>()
  const waiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>()
  let disposed = false
  let viewRevision = 0
  let frameSequence = 0
  let activeFrame: AbortController | undefined
  let viewBusy = false
  let viewFailure: readonly Diagnostic[] | undefined
  let displayDiagnostics: readonly Diagnostic[] = []
  let selection: ViewerSelection | undefined
  let selectionAnchor: ViewerSelection | undefined
  let measurement: ViewerMeasurement | undefined
  let measurePoints: AtomInstance[] = []
  let prepared: { derived: DerivedStructure; context: ComputationContext } | undefined
  let shown: typeof prepared
  let state: EditorState
  let sourceCalls = 0
  let centerDocument: string | undefined
  let auxiliary: { key: string; reciprocal?: ReciprocalLattice; zone?: BrillouinZone } | undefined
  let controller: ReturnType<typeof createControllerWithRuntime>
  const context = () => ({ documentId: state?.documentId, revision: state?.revision ?? 0 })
  const getState = (): ViewerState =>
    immutable({
      ...context(),
      status: disposed ? 'disposed' : viewFailure ? 'error' : viewBusy ? 'computing' : state.status,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      diagnostics: [...state.diagnostics, ...displayDiagnostics, ...(viewFailure ?? [])],
      options,
      ...(selection ? { selection } : {}),
      ...(measurement ? { measurement } : {})
    })
  function emit(event: ViewerEvent) {
    immutable(event)
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch (error) {
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }
  function rejectWaiters(error: Error) {
    for (const waiter of [...waiters]) {
      waiters.delete(waiter)
      waiter.reject(error)
    }
  }
  function publish() {
    const current = getState()
    emit({ type: 'state', state: current })
    if (current.status === 'ready') {
      for (const waiter of [...waiters]) {
        waiters.delete(waiter)
        waiter.resolve()
      }
    } else if (current.status === 'error' || current.status === 'disposed') {
      rejectWaiters(
        current.status === 'disposed'
          ? abortError()
          : new ComputationError(
              current.diagnostics[0]?.code ?? 'VIEWER_ERROR',
              current.diagnostics[0]?.message ?? 'Rendering failed.',
              current.diagnostics
            )
      )
    }
  }
  function waitForDisplay(): Promise<void> {
    const current = getState()
    if (current.status === 'ready') return Promise.resolve()
    if (current.status === 'disposed') return Promise.reject(abortError())
    if (current.status === 'error')
      return Promise.reject(
        new ComputationError(
          'VIEWER_ERROR',
          'The viewer is in an error state.',
          current.diagnostics
        )
      )
    return new Promise<void>((resolve, reject) => waiters.add({ resolve, reject }))
  }
  function invalidateFrame() {
    frameSequence++
    activeFrame?.abort()
    activeFrame = undefined
    viewBusy = false
  }
  function updateOverlay() {
    backend.setOverlay({
      selectedAtomIds: selection?.kind === 'atom' ? [selection.instance.id] : [],
      selectedBondIds: selection?.kind === 'bond' ? [selection.bond.id] : [],
      points: measurePoints.map((point) => point.cartesian),
      ...(measurement
        ? {
            label: `${measurement.value.toFixed(4)} ${measurement.unit === 'angstrom' ? 'Å' : '°'}`
          }
        : {})
    })
  }
  function resetInteraction(resetSelection: boolean) {
    if (resetSelection) {
      selection = undefined
      selectionAnchor = undefined
      emit({ type: 'selection', ...context() })
    }
    measurement = undefined
    measurePoints = []
    emit({ type: 'measurement', diagnostics: [], ...context() })
    updateOverlay()
  }
  function restoreSelection(derived: DerivedStructure) {
    const anchor = selectionAnchor ?? selection
    if (!anchor) return
    const atoms = new Map(derived.atoms.map((atom) => [atom.id, atom]))
    selection = undefined
    if (anchor.kind === 'atom') {
      const instance = atoms.get(anchor.instance.id)
      if (instance) selection = { kind: 'atom', instance }
    } else {
      const bond = derived.bonds.find((entry) => entry.id === anchor.bond.id)
      if (bond && atoms.has(bond.endpoints[0]) && atoms.has(bond.endpoints[1]))
        selection = {
          kind: 'bond',
          bond,
          endpoints: [atoms.get(bond.endpoints[0])!, atoms.get(bond.endpoints[1])!]
        }
    }
    selectionAnchor = selection
    emit({ type: 'selection', selection, ...context() })
    updateOverlay()
  }
  function report(error: unknown, fatal = false) {
    if (cancelled(error) || disposed) return
    const diagnostics = diagnosticsOf(error)
    if (fatal) {
      viewFailure = diagnostics
      backend.clear()
      shown = undefined
    }
    emit({ type: 'error', diagnostics, ...context() })
    publish()
  }
  let backend: ReturnType<typeof createThreeBackend>
  try {
    backend = createThreeBackend(canvas, overlay, {
      click(x, y) {
        clicked(x, y)
      },
      contextLost() {
        if (disposed) return
        invalidateFrame()
        viewFailure = [
          {
            severity: 'error',
            code: 'WEBGL_CONTEXT_LOST',
            message: 'The WebGL2 context was lost; the current source is retained for restoration.'
          }
        ]
        shown = undefined
        emit({ type: 'error', diagnostics: viewFailure, ...context() })
        if (state) publish()
      },
      contextRestored() {
        if (disposed || !controller) return
        viewFailure = undefined
        auxiliary = undefined
        prepared = undefined
        if (controller.getState().snapshot)
          void controller.recompute().catch((error) => report(error))
        else publish()
      },
      error(error) {
        if (state) report(error, true)
      }
    })
  } catch (error) {
    canvas.remove()
    overlay.remove()
    if (setRelative) container.style.position = originalPosition
    throw error
  }
  async function present(
    derived: DerivedStructure,
    request: ComputationContext,
    parent: AbortSignal
  ): Promise<void> {
    const sequence = ++frameSequence
    activeFrame?.abort()
    viewBusy = true
    viewFailure = undefined
    publish()
    try {
      while (true) {
        if (disposed || parent.aborted || sequence !== frameSequence) throw abortError()
        const version = viewRevision,
          nextOptions = options
        const local = new AbortController()
        activeFrame = local
        const signal = AbortSignal.any([parent, local.signal])
        try {
          const source = controller.getState()
          if (
            !source.snapshot ||
            source.documentId !== request.documentId ||
            source.revision !== request.revision
          )
            throw abortError()
          const key = `${request.documentId}:${request.revision}`
          if (auxiliary?.key !== key) auxiliary = { key }
          if (source.snapshot.kind === 'periodic') {
            if (
              (nextOptions.showReciprocalLattice || nextOptions.showBrillouinZone) &&
              !auxiliary.reciprocal
            ) {
              const result = await controller.compute(
                { kind: 'reciprocal', cell: source.snapshot.cell },
                { signal }
              )
              if (result.category !== 'reciprocal')
                throw new Error('Unexpected reciprocal task category.')
              auxiliary.reciprocal = result.value
            }
            if (nextOptions.showBrillouinZone && !auxiliary.zone) {
              const result = await controller.compute(
                { kind: 'brillouin-zone', cell: source.snapshot.cell },
                { signal }
              )
              if (result.category !== 'brillouin-zone')
                throw new Error('Unexpected BZ task category.')
              auxiliary.zone = result.value
            }
          }
          if (signal.aborted || sequence !== frameSequence || version !== viewRevision)
            throw abortError()
          const built = createRenderFrame(source.snapshot, derived, nextOptions, {
            ...(nextOptions.showReciprocalLattice ? { reciprocal: auxiliary.reciprocal } : {}),
            ...(nextOptions.showBrillouinZone ? { zone: auxiliary.zone } : {})
          })
          await backend.commit(
            { ...built.frame, fitToView: !camera && centerDocument !== request.documentId },
            { ...request, viewRevision: version },
            signal
          )
          if (signal.aborted || sequence !== frameSequence || version !== viewRevision)
            throw abortError()
          displayDiagnostics = built.diagnostics
          shown = { derived, context: request }
          restoreSelection(derived)
          centerDocument = request.documentId
          return
        } catch (error) {
          if (
            cancelled(error) &&
            !disposed &&
            !parent.aborted &&
            sequence === frameSequence &&
            version !== viewRevision
          )
            continue
          throw error
        }
      }
    } catch (error) {
      if (sequence === frameSequence && !cancelled(error) && !disposed) {
        viewFailure = diagnosticsOf(error)
        backend.clear()
        shown = undefined
      }
      throw error
    } finally {
      if (sequence === frameSequence) {
        activeFrame = undefined
        viewBusy = false
        publish()
      }
    }
  }
  try {
    controller = createControllerWithRuntime(
      {
        historyLimit,
        mode,
        timeoutMs,
        commit: async (derived, request, signal) => {
          prepared = { derived, context: request }
          await present(derived, request, signal)
        }
      },
      createComputationRuntime({ mode, timeoutMs }),
      (snapshot) => derivationOptions(snapshot, options)
    )
  } catch (error) {
    backend.dispose()
    canvas.remove()
    overlay.remove()
    if (setRelative) container.style.position = originalPosition
    throw error
  }
  state = controller.getState()
  const unsubscribe = controller.subscribe((next) => {
    const previous = state
    state = next
    if (next.status === 'computing') {
      invalidateFrame()
      prepared = undefined
      viewFailure = undefined
      displayDiagnostics = []
      if (next.documentId !== previous.documentId) {
        selection = undefined
        selectionAnchor = undefined
        shown = undefined
        auxiliary = undefined
        backend.clear()
        resetInteraction(true)
      } else {
        selectionAnchor = selectionAnchor ?? selection
        selection = undefined
        resetInteraction(false)
      }
    } else if (next.status === 'error') {
      backend.clear()
      shown = undefined
      emit({ type: 'error', diagnostics: next.diagnostics, ...context() })
    }
    if (
      next.canUndo !== previous.canUndo ||
      next.canRedo !== previous.canRedo ||
      next.documentId !== previous.documentId
    )
      emit({ type: 'history', canUndo: next.canUndo, canRedo: next.canRedo, ...context() })
    publish()
  })
  const resize = () => {
    if (!disposed)
      backend.resize(
        container.clientWidth,
        container.clientHeight,
        document.defaultView?.devicePixelRatio ?? 1
      )
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  if (camera) backend.setCamera(camera)
  function clicked(x: number, y: number) {
    if (disposed || getState().status !== 'ready' || !shown) return
    const mode = options.interactionMode
    if (mode === 'none') return
    if (mode === 'pick-point') {
      const point = backend.point(x, y)
      if (!point) return
      const snapshot = controller.getState().snapshot!
      const fractional =
        snapshot.kind === 'periodic'
          ? resultValue(cartesianToFractional(snapshot.cell, point.cartesian))
          : undefined
      emit({
        type: 'point',
        ...context(),
        point: { ...point, unit: 'angstrom', ...(fractional ? { fractional } : {}) }
      })
      return
    }
    const hit = backend.pick(x, y),
      derived = shown.derived
    const atoms = new Map(derived.atoms.map((atom) => [atom.id, atom]))
    if (mode === 'select') {
      selection = undefined
      if (hit?.kind === 'atom') {
        const instance = atoms.get(hit.instanceId)
        if (instance) selection = { kind: 'atom', instance }
      } else if (hit?.kind === 'bond') {
        const bond = derived.bonds.find((entry) => entry.id === hit.instanceId)
        if (bond)
          selection = {
            kind: 'bond',
            bond,
            endpoints: [atoms.get(bond.endpoints[0])!, atoms.get(bond.endpoints[1])!]
          }
      }
      selectionAnchor = selection
      emit({ type: 'selection', selection, ...context() })
      updateOverlay()
      publish()
      return
    }
    if (hit?.kind !== 'atom') return
    const instance = atoms.get(hit.instanceId)
    if (!instance) return
    const count = mode === 'measure-distance' ? 2 : mode === 'measure-angle' ? 3 : 4
    if (measurePoints.length === count) {
      measurePoints = []
      measurement = undefined
    }
    measurePoints.push(instance)
    if (measurePoints.length === count) {
      const p = measurePoints.map((entry) => entry.cartesian)
      const result =
        count === 2
          ? measureDistance(p[0], p[1])
          : count === 3
            ? measureAngle(p[0], p[1], p[2])
            : measureTorsion(p[0], p[1], p[2], p[3])
      measurement = result.ok
        ? {
            ...result.value,
            kind: count === 2 ? 'distance' : count === 3 ? 'angle' : 'torsion',
            instances: [...measurePoints]
          }
        : undefined
      emit({ type: 'measurement', measurement, diagnostics: result.diagnostics, ...context() })
    }
    updateOverlay()
    publish()
  }
  function open() {
    if (disposed) throw new ComputationError('VIEWER_DISPOSED', 'The viewer is disposed.')
  }
  async function sourceOperation(action: () => Promise<void>): Promise<void> {
    open()
    sourceCalls++
    try {
      await action()
    } catch (error) {
      report(error)
      throw error
    } finally {
      sourceCalls--
    }
  }
  return {
    load: (snapshot) => sourceOperation(() => controller.load(snapshot)),
    getSnapshot: () => controller.getState().snapshot,
    getState,
    async setOptions(patch: Partial<ViewerOptions>) {
      open()
      const previous = options,
        next = mergeOptions(options, patch)
      if (JSON.stringify(previous) === JSON.stringify(next)) return
      options = next
      viewRevision++
      activeFrame?.abort()
      if (previous.interactionMode !== next.interactionMode) resetInteraction(true)
      if (!state.snapshot && sourceCalls === 0) {
        publish()
        return
      }
      if (derivationChanged(previous, next)) await sourceOperation(() => controller.recompute())
      else if (state.status === 'computing' || viewBusy) await waitForDisplay()
      else if (prepared) {
        try {
          await present(prepared.derived, prepared.context, new AbortController().signal)
        } catch (error) {
          report(error, true)
          throw error
        }
      }
    },
    execute: (command) => sourceOperation(() => controller.execute(command)),
    undo: () => sourceOperation(() => controller.undo()),
    redo: () => sourceOperation(() => controller.redo()),
    getCamera: () => backend.getCamera(),
    setCamera(pose) {
      open()
      validateCamera(pose)
      backend.setCamera(structuredClone(pose))
    },
    rotate(azimuth, elevation) {
      open()
      if (![azimuth, elevation].every(Number.isFinite))
        throw new RangeError('Camera angles must be finite degrees.')
      backend.rotate(azimuth, elevation)
    },
    zoom(factor) {
      open()
      if (!Number.isFinite(factor) || factor <= 0)
        throw new RangeError('Zoom factor must be positive and finite.')
      backend.zoom(factor)
    },
    center() {
      open()
      backend.center()
    },
    subscribe(listener) {
      listener({ type: 'state', state: getState() })
      if (!disposed) listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      if (disposed) return
      invalidateFrame()
      rejectWaiters(abortError())
      controller.clear()
      backend.clear()
      viewFailure = undefined
      displayDiagnostics = []
      prepared = undefined
      shown = undefined
      auxiliary = undefined
      resetInteraction(true)
      publish()
    },
    dispose() {
      if (disposed) return
      disposed = true
      invalidateFrame()
      rejectWaiters(abortError())
      observer.disconnect()
      controller.dispose()
      unsubscribe()
      backend.dispose()
      canvas.remove()
      overlay.remove()
      if (setRelative && container.style.position === 'relative')
        container.style.position = originalPosition
      prepared = undefined
      shown = undefined
      auxiliary = undefined
      selection = undefined
      measurement = undefined
      measurePoints = []
      publish()
      listeners.clear()
    }
  }
}
