import {
  CALCULATION_LIMITS,
  type CalculationResult,
  type PoscarExportReceipt,
  type Vec3
} from 'alchemion/core'
import { parseNebImages } from 'alchemion/formats'
import type { Viewer } from 'alchemion/viewer'
import { getLocale, tr, type Message } from './i18n'
import { drawResultCharts, type ResultChartData } from './result-charts'
import { resultFormats, resultKinds } from './result-controls'

export { appendResultTools } from './result-controls'

type Results = Viewer['results']
type State = ReturnType<Results['getState']>
type Layer = State['layers'][number]
type LayerSpec = Parameters<Results['addLayer']>[0]
type ImportOptions = Parameters<Results['import']>[1]
type LayerKind = keyof typeof resultKinds
type GridReference = readonly [resultId: string, datasetId: string]

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(`result-${id}`) as T
const input = (id: string) => el<HTMLInputElement>(id)
const value = (id: string) => input(id).value
const hide = (id: string, hidden: boolean) => {
  el(id).hidden = hidden
}
const disable = (id: string, disabled: boolean) => {
  el<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(id).disabled = disabled
}
const fields = (input: string) =>
  input
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
const rows = (input: string) =>
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
const formatNumber = (value: number) => Number(value.toPrecision(5)).toString()
const gridKey = (resultId: string, datasetId?: string) =>
  datasetId ? JSON.stringify([resultId, datasetId]) : ''
const gridReference = (id: string): GridReference | undefined =>
  value(id) ? (JSON.parse(value(id)) as GridReference) : undefined
const statusText = {
  unknown: 'resultUnknown',
  completed: 'resultCompleted',
  incomplete: 'resultIncomplete',
  converged: 'resultConverged',
  unconverged: 'resultUnconverged',
  computing: 'computing',
  ready: 'ready',
  hidden: 'resultHidden',
  incompatible: 'resultIncompatible',
  error: 'error',
  waiting: 'resultWaiting'
} as const satisfies Record<string, Message>
const importText = {
  computing: 'resultReading',
  ready: 'resultImported',
  error: 'resultImportFailed'
} as const satisfies Record<string, Message>

function number(id: string, fallback: number): number {
  const raw = value(id).trim()
  if (!raw) return fallback
  const next = Number(raw)
  if (!Number.isFinite(next)) throw new Error(tr('invalidNumber'))
  return next
}

function optionalNumber(id: string) {
  return value(id).trim() ? number(id, 0) : undefined
}

function select(
  id: string,
  options: readonly (readonly [string, string])[],
  preferred = value(id)
) {
  const element = el<HTMLSelectElement>(id)
  if (
    element.options.length !== options.length ||
    options.some(([key, text], i) => {
      const option = element.options[i]
      return option.value !== key || option.text !== text
    })
  )
    element.replaceChildren(...options.map(([key, text]) => new Option(text, key)))
  if (options.some(([key]) => key === preferred)) element.value = preferred
}

function diagnostics(
  id: string,
  items: readonly { code: string; message: string; sourceLocation?: unknown; context?: unknown }[]
) {
  const element = el(id)
  element.hidden = items.length === 0
  element.textContent = items
    .map(({ code, message, sourceLocation, context }) =>
      [
        `${code} · ${message}`,
        sourceLocation && JSON.stringify(sourceLocation),
        context && JSON.stringify(context)
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n')
}

function metadata(result: CalculationResult | undefined) {
  if (!result) return undefined
  return {
    initialFrameId: result.initialFrameId,
    frames: result.frames.map(({ id, structure }) => ({
      id,
      atomCount: structure.atoms.length,
      atoms: structure.atoms.slice(0, 6).map(({ id, element }) => ({ id, element })),
      cell: structure.kind === 'periodic' ? structure.cell : undefined
    })),
    charts: result.data.flatMap<ResultChartData>((dataset) => {
      if (dataset.kind === 'bands' || dataset.kind === 'dos') return [dataset]
      if (dataset.kind !== 'vibration') return []
      const modes = dataset.modes.map(({ id, frequencyThz, imaginary }) => ({
        id,
        frequencyThz,
        imaginary
      }))
      return [{ ...dataset, modes }]
    })
  }
}

type ResultSummary = State['results'][number]
type FrameSummary = ResultSummary['frames'][number]
const frameLabel = (frame: FrameSummary) =>
  [
    frame.id,
    frame.image !== undefined && `${tr('resultImage')} ${frame.image}`,
    frame.step !== undefined && `${tr('resultStep')} ${frame.step}`,
    frame.timeFs !== undefined && `${formatNumber(frame.timeFs)} fs`,
    frame.energyEv !== undefined && `${formatNumber(frame.energyEv)} eV`
  ]
    .filter((item) => item !== false)
    .join(' · ')
const resultLabel = (result: ResultSummary) => result.sources[0]?.name ?? result.id
const kindLabel = (kind: LayerSpec['kind']) =>
  tr(kind === 'k-point' ? 'resultKPoint' : resultKinds[kind])

interface Host {
  readonly signal: AbortSignal
  viewer(): Viewer | undefined
  on(id: string, event: string, listener: (event: Event) => void): void
  action(id: string, action: () => unknown | Promise<unknown>): void
  form(id: string, action: () => unknown | Promise<unknown>): void
  run(action: () => unknown | Promise<unknown>): Promise<void>
  vector(input: string): Vec3
  pending(value: boolean): void
}

export function installResultTools(host: Host) {
  const resultApi = () => {
    const viewer = host.viewer()
    if (!viewer) throw new Error(tr('unavailable'))
    return viewer.results
  }
  const on = (id: string, event: string, callback: (event: Event) => void) =>
    host.on(`result-${id}`, event, callback)
  const action = (id: string, callback: () => unknown | Promise<unknown>) =>
    host.action(`result-${id}`, callback)
  const form = (id: string, callback: () => unknown | Promise<unknown>) =>
    host.form(`result-${id}`, callback)
  let state: State | undefined
  let loadedId: string | undefined
  let details: ReturnType<typeof metadata>
  let chartKey = ''
  let timer = 0
  let animation = 0
  let playbackGeneration = 0
  let vibrationGeneration = 0
  let playing = false
  let vibrating = false
  let resultGeneration = 0
  let markingKPoint = false
  let pendingKPoint: LayerSpec | undefined
  let pendingFrame: { resultId: string; frameId?: string } | undefined

  const chosen = () => state?.results.find(({ id }) => id === value('choice'))
  const chosenLayer = () => state?.layers.find(({ id }) => id === value('layer-choice'))
  const currentResult = () => {
    const result = chosen()
    if (!result) throw new Error(tr('resultNeeded'))
    return result
  }
  const currentFrame = () => value('frame') || undefined
  const kind = () => value('layer-kind') as LayerKind
  const ensureDetails = () => {
    const selected = chosen()?.id
    if (selected === loadedId) return
    loadedId = selected
    details = metadata(selected ? resultApi().get(selected) : undefined)
    chartKey = ''
  }

  function pause() {
    playbackGeneration++
    playing = false
    window.clearTimeout(timer)
    timer = 0
  }

  function stopVibration() {
    vibrationGeneration++
    vibrating = false
    window.cancelAnimationFrame(animation)
    animation = 0
  }

  function renderMapping() {
    const frame = details?.frames.find(({ id }) => id === currentFrame())
    const source = host.viewer()?.getSnapshot()
    const atomIds = fields(value('atom-ids'))
    const seen = new Set<string>()
    const preview = frame?.atoms.map((atom, index) => {
      const id = atomIds[index]
      const matches =
        !!id &&
        !seen.has(id) &&
        source?.atoms.find((item) => item.id === id)?.element === atom.element
      if (id) seen.add(id)
      return `${index + 1} · ${atom.element} ${atom.id}${id ? ` → ${id} ${matches ? '✓' : '?'}` : ''}`
    })
    el('mapping-preview').textContent = frame
      ? [`${frame.atomCount} ${tr('atoms')}`, ...preview!].join('\n')
      : ''
  }

  function renderLayerFields() {
    const selected = kind()
    const frame = currentFrame()
    const grid = selected === 'surface' || selected === 'slice'
    const comparison = selected === 'comparison'
    const vibration = selected === 'vibration'
    const atomic = selected === 'atomic'
    const current = chosen()
    const datasets = current?.data.filter((data) => data.frameId === frame) ?? []
    const dataKind = grid ? 'grid' : selected === 'fermi' ? 'fermi-grid' : selected
    const matching = datasets.filter((dataset) => dataset.kind === dataKind)
    const option = ({ id, kind, quantity, unit, spin }: (typeof matching)[number]) =>
      [
        id,
        [quantity, spin, kind === 'fermi-grid' && id, unit && `(${unit})`]
          .filter(Boolean)
          .join(' · ')
      ] as const
    select('data', matching.map(option))
    const otherGrids = (state?.results ?? []).flatMap((result) =>
      result.bound
        ? result.data
            .filter(
              (item) =>
                item.kind === 'grid' &&
                (result.id !== current?.id || (item.frameId === frame && item.id !== value('data')))
            )
            .map(
              (item) =>
                [
                  gridKey(result.id, item.id),
                  `${resultLabel(result)} · ${item.frameId} · ${option(item)[1]}`
                ] as const
            )
        : []
    )
    const emptyGrid = ['', tr('resultPrimaryField')] as const
    select('color-data', [emptyGrid, ...otherGrids])
    select('subtract-data', [emptyGrid, ...otherGrids])
    select(
      'target',
      (state?.results ?? []).map((result) => [result.id, resultLabel(result)])
    )
    const target = state?.results.find(({ id }) => id === value('target'))
    const targetFrames = target?.frames ?? []
    select(
      'target-frame',
      targetFrames.map((item) => [item.id, frameLabel(item)]),
      value('target-frame') || targetFrames.at(-1)?.id
    )
    const vibrationData = details?.charts.find(
      ({ id, kind }) => id === value('data') && kind === 'vibration'
    )
    const modes = vibrationData?.kind === 'vibration' ? vibrationData.modes : []
    select(
      'mode',
      modes.map((mode) => [
        mode.id,
        `${mode.id} · ${formatNumber(Math.abs(mode.frequencyThz))}${mode.imaginary ? 'i' : ''} THz`
      ])
    )
    el('mode-notice').textContent = modes.find(({ id }) => id === value('mode'))?.imaginary
      ? tr('resultImaginary')
      : ''
    el('fermi-notice').textContent =
      selected === 'fermi' && !matching.length ? tr('resultNoGrid') : ''
    hide('data-fields', comparison)
    hide('surface-fields', selected !== 'surface')
    hide('slice-fields', selected !== 'slice')
    hide('grid-fields', !grid)
    hide('atomic-fields', !atomic)
    hide('compare-fields', !comparison)
    hide('pair-fields', target?.id === current?.id)
    hide('vibration-fields', !vibration)
    hide('scale-fields', !atomic && !vibration && !comparison)
    hide('color-scale', !grid && !atomic)
    el('layer-form').dataset.datasetCount = String(matching.length)
    const available = comparison ? Boolean(targetFrames.length) : matching.length > 0
    disable('add-layer', !chosen()?.bound || !available)
    disable('apply-layer', !chosen()?.bound || !available || !chosenLayer())
    disable('animate', chosenLayer()?.spec.kind !== 'vibration' || vibrating)
    disable('pause-animation', !vibrating)
    disable('stop-animation', chosenLayer()?.spec.kind !== 'vibration')
  }

  function renderCharts() {
    const frame = currentFrame()
    const result = chosen()
    const chartData = details?.charts.filter((item) => item.frameId === frame) ?? []
    const energyReferences = new Map<number, string>()
    for (const dataset of chartData)
      if (dataset.kind !== 'vibration' && dataset.fermi)
        energyReferences.set(dataset.fermi.value, dataset.fermi.source)
    select('energy-basis', [
      ['', tr('resultAbsolute')],
      ...[...energyReferences].map(
        ([energy, source]) =>
          [
            String(energy),
            `${tr('resultFermiReference')} ${formatNumber(energy)} eV · ${source}`
          ] as const
      )
    ])
    hide('energy-reference', !energyReferences.size)
    const bands = chartData.find((item) => item.kind === 'bands')
    select(
      'k-index',
      (bands?.kind === 'bands' ? bands.points : []).map((point, index) => [
        String(index),
        `${point.label ? `${point.label} · ` : ''}${index + 1} [${point.fractional.map(formatNumber).join(', ')}]`
      ])
    )
    hide('k-controls', !bands)
    disable('k-mark', !result?.bound || markingKPoint)
    const frames = result?.frames ?? []
    hide('charts', !chartData.length && frames.every(({ energyEv }) => energyEv === undefined))
    const next = JSON.stringify([
      getLocale(),
      result?.id,
      frame,
      value('energy-basis'),
      value('k-index'),
      value('mode')
    ])
    if (chartKey === next) return
    chartKey = next
    drawResultCharts(el('chart-plots'), frames, chartData, {
      cell: details?.frames.find(({ id }) => id === frame)?.cell,
      frame: frames.findIndex(({ id }) => id === frame),
      kIndex: Number(value('k-index')),
      mode: value('mode'),
      energyOffset: Number(value('energy-basis')),
      chooseFrame(index) {
        pause()
        chooseFrame(index)
        void host.run(previewFrame)
      },
      chooseKPoint(index) {
        input('k-index').value = String(index)
        renderCharts()
        if (chosen()?.bound) void host.run(markKPoint)
      },
      chooseMode(id) {
        input('layer-kind').value = 'vibration'
        renderLayerFields()
        input('mode').value = id
        renderCharts()
        const layer = chosenLayer()
        if (
          layer?.spec.kind === 'vibration' &&
          layer.spec.resultId === result?.id &&
          layer.spec.frameId === frame
        ) {
          stopVibration()
          void host.run(() => resultApi().updateLayer(layer.id, { modeId: id, phase: 0 }))
        }
      }
    })
  }

  function render(preferredResult = value('choice'), preferredLayer = value('layer-choice')) {
    const api = host.viewer()?.results
    if (api) state = api.getState()
    const results = state?.results ?? []
    select(
      'choice',
      results.map((result) => [result.id, resultLabel(result)]),
      preferredResult
    )
    ensureDetails()
    const result = chosen()
    const activeFrame = pendingFrame ?? state?.frame
    const selectedFrame = activeFrame?.resultId === result?.id ? activeFrame?.frameId : undefined
    const frames = result?.frames ?? []
    select(
      'frame',
      frames.map((frame) => [frame.id, frameLabel(frame)]),
      selectedFrame ?? currentFrame()
    )
    const currentIndex = Math.max(
      0,
      frames.findIndex(({ id }) => id === currentFrame())
    )
    input('frame-slider').max = String(Math.max(0, frames.length - 1))
    input('frame-slider').value = String(currentIndex)
    disable('frame-slider', frames.length < 2)
    for (const id of ['import', 'neb']) disable(id, !api)
    for (const id of ['bind', 'open', 'remove']) disable(id, !result)
    disable('preview-frame', !result?.bound)
    disable('exit-preview', !state?.frame)
    disable('play', !result?.bound || frames.length < 2 || playing)
    disable('pause', !playing)
    hide('frame-preview', !result)
    const binding = el('binding-status')
    binding.dataset.state = result ? (result.bound ? 'bound' : 'unbound') : 'empty'
    binding.textContent = result ? tr(result.bound ? 'resultBound' : 'resultUnbound') : ''
    el('run-status').textContent = result
      ? `${tr('resultTermination')} · ${tr(statusText[result.termination])}\n${tr('resultConvergence')} · ${tr(statusText[result.convergence])}`
      : ''
    const latestImport = state?.imports.at(-1)
    const importStatus = el('import-status')
    importStatus.dataset.state = latestImport?.status ?? 'empty'
    importStatus.textContent = latestImport
      ? `${latestImport.name} · ${tr(importText[latestImport.status])}`
      : ''
    diagnostics('import-diagnostics', latestImport?.diagnostics ?? [])
    const layers = state?.layers ?? []
    host.pending(
      Boolean(
        state?.imports.some(({ status }) => status === 'computing') ||
        layers.some(({ status }) => status === 'computing')
      )
    )
    select(
      'layer-choice',
      layers.map((layer) => [
        layer.id,
        `${kindLabel(layer.spec.kind)} · ${layer.spec.datasetId ?? layer.spec.resultId} · ${tr(statusText[layer.status])}`
      ]),
      preferredLayer
    )
    const layer = chosenLayer()
    const layerStatus = el('layer-status')
    layerStatus.dataset.state = layer?.status ?? 'empty'
    layerStatus.textContent = layer
      ? [tr(statusText[layer.status]), layer.summary].filter(Boolean).join(' · ')
      : ''
    diagnostics('layer-diagnostics', layer?.diagnostics ?? [])
    for (const id of ['toggle-layer', 'remove-layer']) disable(id, !layer)
    disable('pick', !layers.length)
    el('pick-details').textContent = state?.pick
      ? JSON.stringify(state.pick, null, 2)
      : tr('resultNothingPicked')
    renderMapping()
    renderLayerFields()
    renderCharts()
  }

  const setFormat = () => {
    hide('cube-fields', value('format') !== 'cube')
    hide('path-fields', value('format') !== 'vasprun')
  }
  on('format', 'change', setFormat)
  setFormat()
  form('import-form', async () => {
    const file = input('file').files?.[0]
    if (!file) throw new Error(tr('resultFileNeeded'))
    const generation = ++resultGeneration
    const format = value('format') as keyof typeof resultFormats
    const path =
      format === 'vasprun' && value('path').trim()
        ? (JSON.parse(value('path')) as ImportOptions['path'])
        : undefined
    const result = await resultApi().import(file, {
      format,
      ...(format === 'cube'
        ? { quantity: value('quantity').trim(), unit: value('unit').trim() }
        : {}),
      ...(path ? { path } : {}),
      ...(format === 'outcar' ? { reference: host.viewer()?.getSnapshot() } : {})
    })
    if (!host.signal.aborted && generation === resultGeneration) render(result.id)
  })

  form('neb-form', async () => {
    const files = Array.from(input('neb-files').files ?? [])
    const entries = rows(value('neb-rows'))
      .map((line) => {
        const [index, name, energy] = line.split(',').map((part) => part.trim())
        const file = files.find((candidate) => candidate.name === name)
        const image = index ? Number(index) : Number.NaN
        const energyEv = energy ? Number(energy) : undefined
        if (
          !file ||
          !Number.isSafeInteger(image) ||
          image < 0 ||
          (energyEv !== undefined && !Number.isFinite(energyEv))
        )
          throw new Error(tr('resultNebInvalid'))
        return { file, image, energyEv }
      })
      .sort((a, b) => a.image - b.image)
    if (
      entries.length < 2 ||
      entries.length > CALCULATION_LIMITS.frames ||
      entries.length !== files.length ||
      new Set(entries.map(({ file }) => file.name)).size !== entries.length ||
      entries.reduce((sum, { file }) => sum + file.size, 0) > CALCULATION_LIMITS.resultBytes ||
      entries.some(
        ({ file, image }, i) =>
          file.size > CALCULATION_LIMITS.fileBytes || image !== entries[0].image + i
      )
    )
      throw new Error(tr('resultNebInvalid'))
    const generation = ++resultGeneration
    const images = []
    for (const { file, image, energyEv } of entries) {
      const text = await file.text()
      if (host.signal.aborted || generation !== resultGeneration) return false
      images.push({ image, text, name: file.name, energyEv })
    }
    const parsed = parseNebImages(images)
    if (!parsed.ok)
      throw Object.assign(new Error(tr('resultImportFailed')), { diagnostics: parsed.diagnostics })
    const result = await resultApi().register(parsed.value)
    if (!host.signal.aborted && generation === resultGeneration) render(result.id)
  })

  on('choice', 'change', () => {
    pause()
    stopVibration()
    input('frame').value = ''
    render()
  })
  on('atom-ids', 'input', renderMapping)
  action('bind', async () => {
    const result = currentResult()
    const file = input('receipt').files?.[0]
    const atomIds = fields(value('atom-ids'))
    if (file && file.size > CALCULATION_LIMITS.fileBytes) throw new Error(tr('fileReadFailed'))
    const frameId = currentFrame()
    const receipt = file ? (JSON.parse(await file.text()) as PoscarExportReceipt) : undefined
    if (host.signal.aborted) return false
    await resultApi().bind(result.id, {
      receipt,
      frameId: atomIds.length || (receipt && !details?.initialFrameId) ? frameId : undefined,
      atomIds: atomIds.length ? atomIds : undefined
    })
  })
  action('open', () => {
    pause()
    stopVibration()
    return resultApi().open(currentResult().id, currentFrame())
  })
  action('remove', () => {
    pause()
    stopVibration()
    return resultApi().remove(currentResult().id)
  })

  function chooseFrame(index: number) {
    const frame = chosen()?.frames[index]
    if (!frame) return
    input('frame').value = frame.id
    input('frame-slider').value = String(index)
    renderMapping()
    renderLayerFields()
    renderCharts()
  }

  async function previewFrame() {
    const result = currentResult()
    if (!result.bound) return false
    const request = { resultId: result.id, frameId: currentFrame() }
    pendingFrame = request
    try {
      await resultApi().setFrame(request.resultId, request.frameId, {
        continuous: input('continuous').checked
      })
    } finally {
      if (pendingFrame === request) {
        pendingFrame = undefined
        if (!host.signal.aborted) render()
      }
    }
  }
  on('frame', 'change', () => {
    pause()
    chooseFrame(chosen()?.frames.findIndex(({ id }) => id === currentFrame()) ?? -1)
    if (chosen()?.bound) void host.run(previewFrame)
  })
  on('frame-slider', 'input', () => {
    pause()
    chooseFrame(Number(value('frame-slider')))
    if (chosen()?.bound) void host.run(previewFrame)
  })
  action('preview-frame', previewFrame)
  action('exit-preview', () => {
    pause()
    pendingFrame = undefined
    return resultApi().setFrame()
  })
  on('continuous', 'change', () => {
    if (state?.frame && state.frame.resultId === chosen()?.id) void host.run(previewFrame)
  })
  action('play', () => {
    const result = currentResult()
    const rate = number('rate', 5)
    if (rate <= 0 || rate > 60) throw new Error(tr('invalidNumber'))
    pause()
    playing = true
    const generation = playbackGeneration
    let index = Math.max(
      0,
      result.frames.findIndex(({ id }) => id === currentFrame())
    )
    if (index + 1 === result.frames.length) index = 0
    const advance = async () => {
      if (generation !== playbackGeneration || host.signal.aborted) return
      chooseFrame(index)
      try {
        await previewFrame()
      } catch (error) {
        if (generation !== playbackGeneration || host.signal.aborted) return
        pause()
        render()
        await host.run(() => {
          throw error
        })
        return
      }
      if (generation !== playbackGeneration || host.signal.aborted) return
      if (++index < result.frames.length)
        timer = window.setTimeout(() => void advance(), 1000 / rate)
      else {
        pause()
        render()
      }
    }
    render()
    void advance()
  })
  action('pause', () => {
    pause()
    render()
  })

  function layerSpec(): LayerSpec {
    const layerKind = kind()
    const datasetId = value('data') || undefined
    if (layerKind !== 'comparison' && !datasetId) throw new Error(tr('resultDatasetNeeded'))
    const surface = layerKind === 'surface'
    const slice = layerKind === 'slice'
    const grid = surface || slice
    const atomic = layerKind === 'atomic'
    const comparison = layerKind === 'comparison'
    const vibration = layerKind === 'vibration'
    const colorBy = grid ? gridReference('color-data') : undefined
    const subtract = grid ? gridReference('subtract-data') : undefined
    const resultId = currentResult().id
    const targetResultId = value('target')
    const tiles = grid ? rows(value('tiles')).map(host.vector) : []
    const elements = atomic ? fields(value('elements')) : []
    const pairs =
      comparison && targetResultId !== resultId
        ? rows(value('pairs')).map((line) => {
            const ids = fields(line)
            if (ids.length !== 2) throw new Error(tr('resultPairHelp'))
            return { referenceId: ids[0], targetId: ids[1] }
          })
        : undefined
    return {
      kind: layerKind,
      resultId,
      frameId: currentFrame(),
      datasetId,
      visible: input('visible').checked,
      opacity: number('opacity', 0.6),
      order: number('order', 0),
      color: value('color'),
      ...(surface && {
        threshold: number('threshold', 0.05),
        negativeThreshold: optionalNumber('negative-threshold'),
        negativeColor: value('negative-color')
      }),
      ...(slice && {
        plane: {
          point: host.vector(value('plane-point')),
          normal: host.vector(value('plane-normal'))
        }
      }),
      ...(grid && {
        tiles: tiles.length ? tiles : undefined,
        colorResultId: colorBy?.[0] === resultId ? undefined : colorBy?.[0],
        colorDatasetId: colorBy?.[1],
        subtractResultId: subtract?.[0] === resultId ? undefined : subtract?.[0],
        subtractDatasetId: subtract?.[1],
        resample: input('resample').checked
      }),
      ...((grid || atomic) && { min: optionalNumber('min'), max: optionalNumber('max') }),
      ...((atomic || comparison || vibration) && { scale: number('scale', 1) }),
      ...(atomic && {
        elements: elements.length ? elements : undefined,
        selectedOnly: input('selected-only').checked,
        labels: input('labels').checked,
        arrows: input('arrows').checked
      }),
      ...(comparison && {
        targetResultId,
        targetFrameId: value('target-frame'),
        removeCellDeformation: input('remove-deformation').checked,
        fit: input('rigid-fit').checked,
        pairs
      }),
      ...(vibration && {
        modeId: value('mode'),
        phase: number('phase', 0),
        supercell: host.vector(value('supercell'))
      })
    }
  }

  function restoreLayerForm(layer: Layer) {
    const { spec } = layer
    if (spec.kind === 'k-point') return
    input('choice').value = spec.resultId
    ensureDetails()
    input('layer-kind').value = spec.kind
    const frames = chosen()?.frames ?? []
    select(
      'frame',
      frames.map((frame) => [frame.id, frameLabel(frame)]),
      spec.frameId
    )
    renderLayerFields()
    input('data').value = spec.datasetId ?? ''
    if (spec.targetResultId) input('target').value = spec.targetResultId
    renderLayerFields()
    for (const [id, content] of Object.entries({
      'target-frame': spec.targetFrameId ?? value('target-frame'),
      mode: spec.modeId ?? value('mode'),
      threshold: spec.threshold ?? 0.05,
      'negative-threshold': spec.negativeThreshold ?? '',
      'negative-color': spec.negativeColor ?? '#2266c8',
      'plane-point': spec.plane?.point.join(' ') ?? '0 0 0',
      'plane-normal': spec.plane?.normal.join(' ') ?? '0 0 1',
      tiles: spec.tiles?.map((tile) => tile.join(' ')).join('\n') ?? '',
      'color-data': gridKey(spec.colorResultId ?? spec.resultId, spec.colorDatasetId),
      'subtract-data': gridKey(spec.subtractResultId ?? spec.resultId, spec.subtractDatasetId),
      pairs:
        spec.pairs?.map(({ referenceId, targetId }) => `${referenceId} ${targetId}`).join('\n') ??
        '',
      elements: spec.elements?.join(' ') ?? '',
      min: spec.min ?? '',
      max: spec.max ?? '',
      opacity: spec.opacity ?? 0.6,
      order: spec.order ?? 0,
      color: spec.color ?? '#d7662c',
      scale: spec.scale ?? 1,
      phase: spec.phase ?? 0,
      supercell: spec.supercell?.join(' ') ?? '1 1 1'
    }))
      input(id).value = String(content)
    for (const [id, checked] of Object.entries({
      visible: spec.visible !== false,
      resample: spec.resample === true,
      'selected-only': spec.selectedOnly === true,
      labels: spec.labels === true,
      arrows: spec.arrows !== false,
      'remove-deformation': spec.removeCellDeformation === true,
      'rigid-fit': spec.fit === true
    }))
      input(id).checked = checked
    renderCharts()
    renderMapping()
  }

  for (const id of ['layer-kind', 'data', 'mode', 'target'])
    on(id, 'change', () => {
      stopVibration()
      renderLayerFields()
      renderCharts()
    })
  for (const id of ['choice', 'frame', 'target', 'target-frame'])
    on(id, 'change', () => {
      input('pairs').value = ''
      el('pair-count').textContent = ''
    })
  action('suggest-pairs', () => {
    const reference = resultApi()
      .get(currentResult().id)
      ?.frames.find(({ id }) => id === currentFrame())?.structure.atoms
    const target = resultApi()
      .get(value('target'))
      ?.frames.find(({ id }) => id === value('target-frame'))?.structure.atoms
    if (!reference || !target) return false
    const pairs = reference.flatMap((atom, i) =>
      atom.element === target[i]?.element ? [`${atom.id} ${target[i].id}`] : []
    )
    input('pairs').value = pairs.join('\n')
    el('pair-count').textContent =
      `${tr('resultMatched')} ${pairs.length} · ${tr('resultUnmatched')} ${Math.max(reference.length, target.length) - pairs.length}`
  })
  on('layer-choice', 'change', () => {
    stopVibration()
    const layer = chosenLayer()
    if (layer) restoreLayerForm(layer)
    render()
  })
  form('layer-form', async () => {
    const id = await resultApi().addLayer(layerSpec())
    render(value('choice'), id)
  })
  action('apply-layer', () => {
    const layer = chosenLayer()
    if (layer) return resultApi().updateLayer(layer.id, layerSpec())
  })
  action('remove-layer', () => {
    stopVibration()
    const layer = chosenLayer()
    if (layer) return resultApi().removeLayer(layer.id)
  })
  action('toggle-layer', () => {
    const layer = chosenLayer()
    if (layer) return resultApi().updateLayer(layer.id, { visible: layer.spec.visible === false })
  })
  action('pick', () => {
    const viewer = host.viewer()
    if (!viewer) throw new Error(tr('unavailable'))
    document.querySelector<HTMLSelectElement>('#interaction-mode')!.value = 'pick-result'
    return viewer.setOptions({ interactionMode: 'pick-result' })
  })
  action('animate', () => {
    const layer = chosenLayer()
    if (layer?.spec.kind !== 'vibration') return false
    stopVibration()
    vibrating = true
    const generation = vibrationGeneration
    const start = performance.now()
    const tick = async (now: number) => {
      if (generation !== vibrationGeneration || host.signal.aborted) return
      try {
        await resultApi().updateLayer(layer.id, {
          phase: (((now - start) / 1000) * 2 * Math.PI) % (2 * Math.PI)
        })
      } catch (error) {
        if (generation !== vibrationGeneration || host.signal.aborted) return
        stopVibration()
        render()
        await host.run(() => {
          throw error
        })
        return
      }
      if (generation === vibrationGeneration && !host.signal.aborted)
        animation = window.requestAnimationFrame((next) => void tick(next))
    }
    animation = window.requestAnimationFrame((now) => void tick(now))
    render()
  })
  action('stop-animation', async () => {
    stopVibration()
    const layer = chosenLayer()
    if (layer?.spec.kind === 'vibration') await resultApi().removeLayer(layer.id)
    render()
  })
  action('pause-animation', () => {
    stopVibration()
    render()
  })
  async function markKPoint() {
    const result = currentResult()
    const dataset = result.data.find(
      ({ kind, frameId }) => kind === 'bands' && frameId === currentFrame()
    )
    if (!dataset) return false
    pendingKPoint = {
      kind: 'k-point',
      resultId: result.id,
      frameId: currentFrame(),
      datasetId: dataset.id,
      kIndex: Number(value('k-index'))
    }
    if (markingKPoint) return false
    markingKPoint = true
    try {
      const viewer = host.viewer()
      if (!viewer?.getState().options.showBrillouinZone)
        await viewer?.setOptions({ showBrillouinZone: true })
      document.querySelector<HTMLInputElement>('#show-bz')!.checked = true
      while (pendingKPoint && !host.signal.aborted) {
        const spec = pendingKPoint
        pendingKPoint = undefined
        const existing = state?.layers.find(
          (layer) => layer.spec.kind === 'k-point' && layer.spec.resultId === spec.resultId
        )
        if (existing) await resultApi().updateLayer(existing.id, spec)
        const id = existing?.id ?? (await resultApi().addLayer(spec))
        if (!pendingKPoint && chosen()?.id === spec.resultId) render(spec.resultId, id)
      }
    } finally {
      markingKPoint = false
      renderCharts()
    }
  }
  on('energy-basis', 'change', renderCharts)
  on('k-index', 'change', () => {
    renderCharts()
    if (chosen()?.bound) void host.run(markKPoint)
  })
  action('k-mark', markKPoint)

  const api = host.viewer()?.results
  const unsubscribe = api?.subscribe((next) => {
    state = next
    if (playing && !chosen()?.bound) pause()
    if (vibrating && !next.layers.some(({ id }) => id === value('layer-choice'))) stopVibration()
    render()
  })
  for (const id of ['cancel', 'clear'])
    host.on(id, 'click', () => {
      resultGeneration++
      pendingFrame = undefined
      pendingKPoint = undefined
      pause()
      stopVibration()
      render()
    })
  host.signal.addEventListener(
    'abort',
    () => {
      resultGeneration++
      pause()
      stopVibration()
      unsubscribe?.()
    },
    { once: true }
  )
  render()
  return render
}
