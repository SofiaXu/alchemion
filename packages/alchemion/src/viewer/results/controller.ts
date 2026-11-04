import {
  CALCULATION_LIMITS,
  calculationSize,
  matchResultFrame,
  registerResultFrame,
  validateCalculationResult
} from '../../core/calculation'
import type { CalculationData, CalculationResult, ResultFrame } from '../../core/calculation'
import { createStructureSnapshot } from '../../core/structure'
import { sampleResultGrid } from '../../core/result-geometry'
import type {
  AtomId,
  DerivedStructure,
  Diagnostic,
  ScientificResult,
  StructureSnapshot
} from '../../core/types'
import type { DerivationOptions } from '../../core/bonds'
import { abortError, ComputationError } from '../runtime/types'
import type { ComputationRuntimeOptions } from '../runtime/types'
import { createResultRuntime } from '../runtime/runtime'
import { validateResultLayer } from './spec'
import type { ResultGeometry, ResultTask } from './task'
import type {
  ResultBindingOptions,
  ResultFrameReference,
  ResultImportState,
  ResultLayerSpec,
  ResultLayerState,
  ResultPick,
  ResultViewLayer,
  ViewerResults,
  ViewerResultsState
} from './types'

export interface RenderResultLayer {
  readonly id: string
  readonly spec: ResultLayerSpec
  readonly frameId: string
  readonly datasetId?: string
  readonly geometry: ResultGeometry
}
interface Scene {
  readonly documentId?: string
  readonly revision: number
  readonly source?: StructureSnapshot
  readonly display?: StructureSnapshot
  readonly derived?: DerivedStructure
  readonly selected: readonly AtomId[]
  readonly ready: boolean
}
interface Host {
  scene(): Scene
  load(snapshot: StructureSnapshot): Promise<void>
  deriveOptions(snapshot: StructureSnapshot): DerivationOptions
  showFrame(
    snapshot: StructureSnapshot | undefined,
    derived: DerivedStructure | undefined,
    signal: AbortSignal
  ): Promise<void>
  render(layers: readonly RenderResultLayer[], signal: AbortSignal): Promise<void>
  clearGeometry(): void
  enableReciprocal(): Promise<void>
}
interface Binding {
  readonly documentId: string
  readonly frameId: string
  readonly rows: ReadonlyMap<AtomId, AtomId>
  readonly anchor?: ResultFrameReference
}
interface Layer {
  readonly id: string
  spec: ResultLayerSpec
  status: ResultLayerState['status']
  diagnostics: readonly Diagnostic[]
  key?: string
  controller?: AbortController
  render?: RenderResultLayer
  sources?: readonly string[]
  targetSources?: readonly string[]
  colorSources?: readonly string[]
  subtractSources?: readonly string[]
}
const diagnostic = (code: string, message: string): readonly Diagnostic[] => [
  { severity: 'error', code, message }
]
const error = (code: string, message: string) => new ComputationError(code, message)
const errorDiagnostics = (value: unknown): readonly Diagnostic[] =>
  value instanceof ComputationError
    ? value.diagnostics
    : diagnostic('RESULT_FAILURE', value instanceof Error ? value.message : String(value))
const unwrap = <T>(value: ScientificResult<T>): T => {
  if (!value.ok)
    throw new ComputationError(
      value.diagnostics[0].code,
      value.diagnostics[0].message,
      value.diagnostics
    )
  return value.value
}
const hashes = (result: CalculationResult) => result.sources.map((source) => source.sha256)
const matchingHashes = (expected: readonly string[] | undefined, result: CalculationResult) =>
  !expected ||
  (expected.length === result.sources.length &&
    expected.every((hash, i) => hash === result.sources[i].sha256))
const sameFrame = (a: ResultFrameReference | undefined, b: ResultFrameReference | undefined) =>
  a?.resultId === b?.resultId && a?.frameId === b?.frameId
const dataKinds: Partial<Record<ResultLayerSpec['kind'], CalculationData['kind']>> = {
  surface: 'grid',
  slice: 'grid',
  atomic: 'atomic',
  vibration: 'vibration',
  fermi: 'fermi-grid',
  'k-point': 'bands'
}

function remap(frame: ResultFrame, rows: ReadonlyMap<AtomId, AtomId>): StructureSnapshot {
  const structure = frame.structure
  const id = (original: AtomId) => {
    const mapped = rows.get(original)
    if (!mapped) throw error('RESULT_FRAME_MAPPING', 'The frame has an unmapped atom identity.')
    return mapped
  }
  const bonds = structure.bonds.map((bond) => ({
    ...bond,
    endpoints: bond.endpoints.map((endpoint) => ({
      ...endpoint,
      sourceAtomId: id(endpoint.sourceAtomId)
    })) as unknown as typeof bond.endpoints
  }))
  return unwrap(
    createStructureSnapshot(
      structure.kind === 'periodic'
        ? {
            ...structure,
            bonds,
            atoms: structure.atoms.map((atom) => ({ ...atom, id: id(atom.id) }))
          }
        : {
            ...structure,
            bonds,
            atoms: structure.atoms.map((atom) => ({ ...atom, id: id(atom.id) }))
          }
    )
  )
}

export function createViewerResults(host: Host, options: ComputationRuntimeOptions) {
  const runtime = createResultRuntime(options)
  const results = new Map<string, CalculationResult>()
  const sizes = new Map<string, ReturnType<typeof calculationSize>>()
  const bindings = new Map<string, Binding>()
  const layers = new Map<string, Layer>()
  const imports = new Map<string, ResultImportState>()
  const listeners = new Set<(state: ViewerResultsState) => void>()
  let activeFrame: ResultFrameReference | undefined
  let picked: ResultPick | undefined
  let preview: AbortController | undefined
  let renderSignal = new AbortController()
  let renderQueue = Promise.resolve()
  let sceneEpoch = 0
  let instanceEpoch = 0
  let previousInstances: DerivedStructure | undefined
  let unfoldedCache: { id: string; frames: readonly ResultFrame[] } | undefined
  let sequence = 0
  let disposed = false

  function getState(): ViewerResultsState {
    const scene = host.scene()
    return structuredClone({
      results: [...results.values()].map((result) => ({
        id: result.id,
        sources: result.sources,
        termination: result.termination,
        convergence: result.convergence,
        frames: result.frames.map(({ id, step, timeFs, image, energyEv, energyKind }) => ({
          id,
          step,
          timeFs,
          image,
          energyEv,
          energyKind
        })),
        data: result.data.map(({ id, kind, frameId, quantity, unit, spin }) => ({
          id,
          kind,
          frameId,
          quantity,
          unit,
          spin
        })),
        bound: compatible(result, scene)
      })),
      layers: [...layers.values()].map((layer) => ({
        id: layer.id,
        spec: layer.spec,
        status: layer.status,
        diagnostics: layer.diagnostics,
        summary: layer.render?.geometry.summary
      })),
      frame: activeFrame,
      pick: picked,
      imports: [...imports.values()]
    })
  }
  function publish() {
    if (!listeners.size) return
    const state = getState()
    for (const listener of [...listeners]) listener(state)
  }
  function ensureOpen() {
    if (disposed) throw error('VIEWER_DISPOSED', 'The viewer is disposed.')
  }
  function resultById(id: string) {
    const result = results.get(id)
    if (!result) throw error('RESULT_MISSING', 'The calculation result is unavailable.')
    return result
  }
  function frameById(result: CalculationResult, id: string | undefined) {
    const frame =
      id === undefined ? result.frames[0] : result.frames.find((candidate) => candidate.id === id)
    if (!frame) throw error('RESULT_FRAME', 'The selected result frame is unavailable.')
    return frame
  }
  function context(scene = host.scene()) {
    return { documentId: scene.documentId ?? 'no-structure', revision: scene.revision }
  }
  function compatible(result: CalculationResult, scene: Scene): boolean {
    const binding = bindings.get(result.id)
    if (!binding || binding.documentId !== scene.documentId || !scene.source) return false
    if (binding.anchor && !sameFrame(binding.anchor, activeFrame)) return false
    const frame = frameById(result, binding.frameId)
    return matchResultFrame(
      frame.structure,
      (binding.anchor ? scene.display : scene.source) ?? scene.source,
      frame.structure.atoms.map((atom) => binding.rows.get(atom.id) ?? '')
    )
  }
  function assignBinding(
    result: CalculationResult,
    frame: ResultFrame,
    ids: readonly AtomId[],
    anchor?: ResultFrameReference
  ) {
    const { documentId } = host.scene()
    if (!documentId) throw error('RESULT_NO_DOCUMENT', 'Load a structure to bind the result.')
    const rows = new Map(frame.structure.atoms.map((atom, index) => [atom.id, ids[index]]))
    const elements = new Map(frame.structure.atoms.map((atom) => [atom.id, atom.element]))
    for (const entry of result.frames) {
      if (
        entry.structure.atoms.length !== rows.size ||
        entry.structure.atoms.some((atom) => elements.get(atom.id) !== atom.element)
      )
        throw error(
          'RESULT_FRAME_MAPPING',
          'Result frames must preserve mapped atom identities and elements.'
        )
    }
    bindings.set(result.id, { documentId, frameId: frame.id, rows, anchor })
  }
  function record(result: CalculationResult) {
    const previous = results.get(result.id)
    if (previous && !matchingHashes(hashes(previous), result))
      throw error(
        'RESULT_ID_CONFLICT',
        'The result identifier already refers to different source content.'
      )
    if (previous) return structuredClone(previous)
    const size = calculationSize(result)
    let { bytes, samples, atomFrames } = size
    let frames = result.frames.length
    for (const [id, value] of sizes) {
      bytes += value.bytes
      samples += value.samples
      atomFrames += value.atomFrames
      frames += results.get(id)!.frames.length
    }
    if (
      bytes > CALCULATION_LIMITS.resultBytes ||
      samples > CALCULATION_LIMITS.gridSamples ||
      atomFrames > CALCULATION_LIMITS.atomFrames ||
      frames > CALCULATION_LIMITS.frames
    )
      throw error('RESULT_BUDGET', 'The viewer result registry exceeds its resident budget.')
    results.set(result.id, result)
    sizes.set(result.id, size)
    unfoldedCache = undefined
    publish()
    void refresh()
    return structuredClone(result)
  }
  function queueRender() {
    const signal = renderSignal.signal
    const job = renderQueue.then(async () => {
      if (signal.aborted || disposed || !host.scene().ready) return
      const visible = [...layers.values()]
        .flatMap((layer) => (layer.render ? [layer.render] : []))
        .sort((a, b) => (a.spec.order ?? 0) - (b.spec.order ?? 0))
      let triangles = 0
      let bytes = 0
      for (const render of visible) {
        for (const mesh of render.geometry.meshes ?? []) {
          triangles += mesh.positions.length / 9
          bytes += mesh.positions.byteLength * (mesh.gradient ? 2 : 1)
        }
        bytes += (render.geometry.glyphs?.length ?? 0) * 192
      }
      if (triangles > CALCULATION_LIMITS.triangles || bytes > CALCULATION_LIMITS.gpuBytes)
        throw error(
          'RESULT_GPU_BUDGET',
          'Visible layers exceed the shared geometry or GPU buffer budget.'
        )
      await host.render(visible, signal)
      if (signal.aborted) return
      for (const render of visible) {
        const layer = layers.get(render.id)
        if (layer?.render === render) layer.status = 'ready'
      }
      publish()
    })
    renderQueue = job.catch(() => {})
    return job
  }
  function unset(layer: Layer, status: Layer['status'], diagnostics: readonly Diagnostic[] = []) {
    layer.controller?.abort()
    layer.controller = undefined
    layer.render = undefined
    layer.key = undefined
    layer.status = status
    layer.diagnostics = diagnostics
  }
  function resolve(layer: Layer, scene: Scene) {
    const { spec } = layer
    const result = results.get(spec.resultId)
    const targetResult = spec.targetResultId ? results.get(spec.targetResultId) : result
    if (
      !result ||
      !matchingHashes(layer.sources, result) ||
      (spec.kind === 'comparison' &&
        (!targetResult || !matchingHashes(layer.targetSources, targetResult)))
    ) {
      unset(
        layer,
        'waiting',
        diagnostic('RESULT_SOURCE_MISSING', 'The referenced calculation files must be associated.')
      )
      return
    }
    if (!compatible(result, scene)) {
      unset(
        layer,
        'incompatible',
        diagnostic(
          'RESULT_FRAME_MISMATCH',
          'The result binding does not match the current structure.'
        )
      )
      return
    }
    const binding = bindings.get(result.id)!
    const shownId = activeFrame?.resultId === result.id ? activeFrame.frameId : binding.frameId
    const initialData = result.data.find((data) => data.id === spec.datasetId)
    const dataset =
      initialData?.frameId === shownId
        ? initialData
        : result.data.find(
            (data) =>
              data.frameId === shownId &&
              (initialData
                ? data.kind === initialData.kind &&
                  data.quantity === initialData.quantity &&
                  data.spin === initialData.spin &&
                  data.method === initialData.method
                : spec.datasetId === undefined && data.kind === dataKinds[spec.kind])
          )
    const frameId = spec.frameId ?? dataset?.frameId ?? shownId
    if (
      frameId !== shownId ||
      (activeFrame && activeFrame.resultId !== result.id && !binding.anchor)
    ) {
      unset(
        layer,
        'incompatible',
        diagnostic('RESULT_FRAME_MISMATCH', 'The selected frame has no compatible layer data.')
      )
      return
    }
    if (
      spec.kind !== 'comparison' &&
      !dataset &&
      (spec.kind !== 'fermi' || spec.datasetId !== undefined)
    ) {
      unset(
        layer,
        'incompatible',
        diagnostic('RESULT_DATASET_MISSING', 'The selected frame has no matching dataset.')
      )
      return
    }
    const frame = frameById(result, frameId)
    const atomIds = frame.structure.atoms.map((atom) => binding.rows.get(atom.id)!)
    const target =
      spec.kind === 'comparison' && targetResult
        ? frameById(targetResult, spec.targetFrameId ?? targetResult.frames.at(-1)?.id)
        : undefined
    function secondary(
      resultId: string | undefined,
      dataId: string | undefined,
      expected: readonly string[] | undefined
    ) {
      if (!dataId) return
      const secondaryResult = resultId ? results.get(resultId) : result
      if (!secondaryResult || !matchingHashes(expected, secondaryResult))
        throw error('RESULT_SOURCE_MISSING', 'Associate the secondary field file.')
      const data = secondaryResult.data.find((data) => data.id === dataId)
      if (secondaryResult === result) return data
      const other = bindings.get(secondaryResult.id)
      if (!data || !other || !compatible(secondaryResult, scene))
        throw error(
          'RESULT_FRAME_MISMATCH',
          'The secondary field requires a compatible frame binding.'
        )
      const shown =
        activeFrame?.resultId === secondaryResult.id ? activeFrame.frameId : other.frameId
      if (shown !== data.frameId || !scene.display)
        throw error(
          'RESULT_FRAME_MISMATCH',
          'The secondary field does not describe the displayed frame.'
        )
      const otherFrame = frameById(secondaryResult, shown)
      if (
        !matchResultFrame(
          otherFrame.structure,
          scene.display,
          otherFrame.structure.atoms.map((atom) => other.rows.get(atom.id)!)
        )
      )
        throw error(
          'RESULT_FRAME_MISMATCH',
          'The secondary field geometry differs from the displayed frame.'
        )
      return { ...data, frameId }
    }
    const task: Extract<ResultTask, { kind: 'result-layer' }> = {
      kind: 'result-layer',
      spec,
      frame,
      data: dataset,
      target,
      atomIds,
      instances: spec.kind === 'atomic' ? scene.derived!.atoms : [],
      source: scene.display ?? scene.source!,
      selected: scene.selected,
      colorData: secondary(spec.colorResultId, spec.colorDatasetId, layer.colorSources),
      subtractData: secondary(spec.subtractResultId, spec.subtractDatasetId, layer.subtractSources)
    }
    return task
  }
  async function refreshOne(layer: Layer, scene: Scene) {
    if (layer.spec.visible === false || layer.spec.opacity === 0) {
      unset(layer, 'hidden')
      return
    }
    if (!scene.ready || !scene.derived) {
      unset(layer, 'waiting')
      return
    }
    const key = JSON.stringify([
      sceneEpoch,
      activeFrame,
      layer.spec,
      layer.spec.kind === 'atomic' ? instanceEpoch : 0,
      layer.spec.selectedOnly ? scene.selected : []
    ])
    if (key === layer.key) return
    let task
    try {
      task = resolve(layer, scene)
    } catch (cause) {
      unset(layer, 'incompatible', errorDiagnostics(cause))
      layer.key = key
      return
    }
    if (!task) return
    const local = new AbortController()
    unset(layer, 'computing')
    layer.key = key
    layer.controller = local
    publish()
    try {
      const value = await runtime.compute(
        { ...context(scene), scope: layer.id, task },
        { signal: local.signal }
      )
      if (local.signal.aborted || layer.controller !== local || value.category !== 'result-layer')
        return
      layer.render = {
        id: layer.id,
        spec: layer.spec,
        frameId: task.frame.id,
        datasetId: task.data?.id,
        geometry: value.value
      }
      layer.diagnostics = value.diagnostics
      await queueRender()
    } catch (cause) {
      if (local.signal.aborted || layer.controller !== local) return
      const failedRender = layer.render
      unset(layer, 'error', errorDiagnostics(cause))
      layer.key = key
      if (failedRender) await queueRender().catch(() => {})
    } finally {
      if (layer.controller === local) layer.controller = undefined
      publish()
    }
  }
  async function refresh() {
    if (disposed || !layers.size) return
    const scene = host.scene()
    if (scene.derived !== previousInstances) {
      previousInstances = scene.derived
      instanceEpoch++
    }
    const pending = [...layers.values()].map((layer) => refreshOne(layer, scene))
    await queueRender().catch(() => {})
    await Promise.all(pending)
    publish()
  }
  function invalidate(resetFrame = true) {
    sceneEpoch++
    if (resetFrame) {
      runtime.invalidate()
      unfoldedCache = undefined
      preview?.abort()
      preview = undefined
      activeFrame = undefined
    }
    picked = undefined
    renderSignal.abort()
    renderSignal = new AbortController()
    if (resetFrame)
      for (const [id, item] of imports) if (item.status === 'computing') imports.delete(id)
    for (const layer of layers.values()) unset(layer, 'waiting')
    host.clearGeometry()
    publish()
  }
  function sourceChanged(switched: boolean) {
    if (switched) bindings.clear()
    invalidate()
  }

  const api: ViewerResults = {
    async import(file, options) {
      ensureOpen()
      const id = `import-${++sequence}`
      const name = typeof file === 'string' ? (options.name ?? options.format) : file.name
      if (imports.size >= 128) {
        const completed = [...imports].find(([, entry]) => entry.status !== 'computing')
        if (!completed) throw error('RESULT_IMPORT_BUDGET', 'Too many pending result imports.')
        imports.delete(completed[0])
      }
      imports.set(id, { id, name, status: 'computing', diagnostics: [] })
      publish()
      try {
        const output = await runtime.compute({
          ...context(),
          scope: id,
          task: { kind: 'result-import', file, options }
        })
        if (disposed || !imports.has(id) || output.category !== 'result-import') throw abortError()
        const result = record(output.value)
        imports.set(id, { id, name, status: 'ready', diagnostics: output.diagnostics })
        publish()
        return result
      } catch (cause) {
        if (imports.has(id))
          imports.set(id, { id, name, status: 'error', diagnostics: errorDiagnostics(cause) })
        publish()
        throw cause
      }
    },
    async register(input) {
      ensureOpen()
      return record(unwrap(validateCalculationResult(input)))
    },
    get(id) {
      const result = results.get(id)
      return result && structuredClone(result)
    },
    async bind(id, options: ResultBindingOptions = {}) {
      ensureOpen()
      const result = resultById(id)
      if (options.receipt && !result.initialFrameId && !options.frameId)
        throw error(
          'RESULT_CONFIRM_FRAME',
          'Confirm the input frame before using this POSCAR mapping.'
        )
      const frame = frameById(result, options.frameId ?? result.initialFrameId)
      const scene = host.scene()
      const anchor = activeFrame?.resultId !== id ? activeFrame : undefined
      const source = anchor ? scene.display : scene.source
      if (!source) throw error('RESULT_NO_DOCUMENT', 'Load a structure to bind the result.')
      const ids = unwrap(registerResultFrame(frame.structure, source, options))
      assignBinding(result, frame, ids, anchor)
      publish()
      await refresh()
    },
    async open(id, frameId) {
      ensureOpen()
      const result = resultById(id)
      const frame = frameById(result, frameId ?? result.initialFrameId)
      await host.load(frame.structure)
      assignBinding(
        result,
        frame,
        frame.structure.atoms.map((atom) => atom.id)
      )
      publish()
      await refresh()
    },
    async setFrame(id, frameId, options) {
      ensureOpen()
      const scene = host.scene()
      if (!scene.ready && !preview)
        throw error('RESULT_NO_FRAME', 'Wait for a complete structure frame.')
      preview?.abort()
      const local = new AbortController()
      preview = local
      try {
        let next: ResultFrameReference | undefined
        let snapshot: StructureSnapshot | undefined
        let derived: DerivedStructure | undefined
        if (id !== undefined) {
          const result = resultById(id)
          const binding = bindings.get(id)
          if (!binding || binding.anchor || !compatible(result, scene))
            throw error(
              'RESULT_FRAME_MISMATCH',
              'Bind the result to the source structure before previewing a frame.'
            )
          let frame = frameById(result, frameId)
          next = { resultId: id, frameId: frame.id }
          if (options?.continuous) {
            if (unfoldedCache?.id === id)
              frame = unfoldedCache.frames.find((entry) => entry.id === frame.id)!
            else {
              const resident = [...sizes.values()].reduce((total, size) => total + size.bytes, 0)
              const cacheBudget = Math.min(
                32 * 1024 ** 2,
                CALCULATION_LIMITS.resultBytes - resident
              )
              const keep = (sizes.get(id)?.bytes ?? Infinity) <= cacheBudget
              const frames = keep
                ? result.frames
                : result.frames.slice(0, result.frames.indexOf(frame) + 1)
              const unfolded = await runtime.compute(
                { ...context(scene), scope: 'preview', task: { kind: 'result-unfold', frames } },
                { signal: local.signal }
              )
              if (unfolded.category !== 'result-unfold')
                throw error('RESULT_PROTOCOL', 'Missing unfolded frames.')
              if (local.signal.aborted) throw abortError()
              if (keep) unfoldedCache = { id, frames: unfolded.value }
              frame = unfolded.value.find((entry) => entry.id === frame.id)!
            }
          }
          snapshot = remap(frame, binding.rows)
          const computed = await runtime.compute(
            {
              ...context(scene),
              scope: 'preview',
              task: {
                kind: 'derive',
                snapshot,
                options: {
                  ...host.deriveOptions(snapshot),
                  ...(options?.continuous
                    ? { wrapFractional: false, cutoff: { kind: 'none' } }
                    : {})
                }
              }
            },
            { signal: local.signal }
          )
          if (computed.category !== 'derive')
            throw error('RESULT_PROTOCOL', 'Missing preview geometry.')
          derived = computed.value
        }
        if (local.signal.aborted) throw abortError()
        await host.showFrame(snapshot, derived, local.signal)
        if (local.signal.aborted) throw abortError()
        invalidate(false)
        activeFrame = next
        publish()
        await refresh()
      } finally {
        if (preview === local) preview = undefined
      }
    },
    async addLayer(input) {
      ensureOpen()
      if (layers.size >= 128) throw error('RESULT_LAYER_BUDGET', 'Too many result layers.')
      const spec = validateResultLayer(input)
      let id: string
      do {
        id = `layer-${++sequence}`
      } while (layers.has(id))
      if (spec.kind === 'fermi' || spec.kind === 'k-point') await host.enableReciprocal()
      layers.set(id, { id, spec, status: 'waiting', diagnostics: [] })
      publish()
      await refresh()
      return id
    },
    async updateLayer(id, patch) {
      ensureOpen()
      const layer = layers.get(id)
      if (!layer) throw error('RESULT_LAYER_MISSING', 'The result layer is unavailable.')
      const spec = validateResultLayer({ ...layer.spec, ...patch })
      if (spec.kind === 'fermi' || spec.kind === 'k-point') await host.enableReciprocal()
      if (spec.resultId !== layer.spec.resultId) layer.sources = undefined
      if (spec.targetResultId !== layer.spec.targetResultId) layer.targetSources = undefined
      if (spec.colorResultId !== layer.spec.colorResultId) layer.colorSources = undefined
      if (spec.subtractResultId !== layer.spec.subtractResultId) layer.subtractSources = undefined
      unset(layer, 'waiting')
      layer.spec = spec
      if (picked?.layerId === id) picked = undefined
      await refresh()
    },
    async removeLayer(id) {
      ensureOpen()
      layers.get(id)?.controller?.abort()
      layers.delete(id)
      if (picked?.layerId === id) picked = undefined
      await queueRender()
      publish()
    },
    async remove(id) {
      ensureOpen()
      if (activeFrame?.resultId === id) await api.setFrame()
      results.delete(id)
      sizes.delete(id)
      bindings.delete(id)
      if (unfoldedCache?.id === id) unfoldedCache = undefined
      await refresh()
      publish()
    },
    getState,
    subscribe(listener) {
      listener(getState())
      if (!disposed) listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }

  return {
    api,
    invalidate,
    sourceChanged,
    refresh,
    get previewing() {
      return !!activeFrame || !!preview
    },
    get pending() {
      return (
        !!preview ||
        [...layers.values()].some((layer) => !!layer.controller) ||
        [...imports.values()].some((item) => item.status === 'computing')
      )
    },
    pick(value: ResultPick | undefined) {
      const layer = value && layers.get(value.layerId)
      picked = layer && layer.status === 'ready' ? value : undefined
      if (
        picked &&
        layer &&
        !layer.spec.subtractDatasetId &&
        picked.coordinateUnit === 'angstrom'
      ) {
        const data = results
          .get(layer.spec.colorResultId ?? picked.resultId)
          ?.data.find((data) => data.id === (layer.spec.colorDatasetId ?? picked?.datasetId))
        if (data?.kind === 'grid') {
          const sampled = sampleResultGrid(data.grid, picked.position)
          if (sampled.ok) picked = { ...picked, value: sampled.value }
        }
      }
      publish()
    },
    viewLayers(): readonly ResultViewLayer[] {
      return [...layers.values()].map((layer) => {
        const result = results.get(layer.spec.resultId)
        const target = results.get(layer.spec.targetResultId ?? layer.spec.resultId)
        const color = layer.spec.colorResultId ? results.get(layer.spec.colorResultId) : undefined
        const subtract = layer.spec.subtractResultId
          ? results.get(layer.spec.subtractResultId)
          : undefined
        return {
          id: layer.id,
          spec: layer.spec,
          sources: layer.sources ?? (result ? hashes(result) : []),
          targetSources:
            layer.spec.kind === 'comparison'
              ? (layer.targetSources ?? (target ? hashes(target) : []))
              : undefined,
          colorSources: layer.colorSources ?? (color ? hashes(color) : undefined),
          subtractSources: layer.subtractSources ?? (subtract ? hashes(subtract) : undefined)
        }
      })
    },
    async restore(input: readonly ResultViewLayer[]) {
      for (const layer of layers.values()) unset(layer, 'waiting')
      layers.clear()
      for (const item of input) layers.set(item.id, { ...item, status: 'waiting', diagnostics: [] })
      // Restored IDs can come from a different viewer session.
      while (layers.has(`layer-${sequence + 1}`)) sequence++
      if (!layers.size) await queueRender()
      else await refresh()
      publish()
    },
    dispose() {
      if (disposed) return
      invalidate()
      disposed = true
      runtime.dispose()
      listeners.clear()
      bindings.clear()
      layers.clear()
      results.clear()
      sizes.clear()
      imports.clear()
    }
  }
}
