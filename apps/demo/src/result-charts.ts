import { reciprocalPoint, type CalculationData, type Cell, type ResultFrame } from 'alchemion/core'
import { tr, type Message } from './i18n'

type Series = readonly { x: number; y: number; breakBefore?: boolean }[]
type Tick = { x: number; label: string }
type ChartName = 'energy' | 'bands' | 'dos' | 'spectrum'
type Vibrations = Extract<CalculationData, { kind: 'vibration' }>
export type ResultChartData =
  | Extract<CalculationData, { kind: 'bands' | 'dos' }>
  | (Omit<Vibrations, 'modes'> & {
      modes: readonly Pick<Vibrations['modes'][number], 'id' | 'frequencyThz' | 'imaginary'>[]
    })
type ChartPoint = { x: number; y: number; index: number }
type Bounds = readonly [number, number]
const colors = ['#216e7b', '#bc591e', '#6760a9', '#357548']
const area = { left: 42, top: 8, right: 294, bottom: 123 }

const extent = (low: number, high: number): Bounds =>
  low === high ? [low - 0.5, high + 0.5] : [low, high]

function range(series: readonly Series[], axis: 'x' | 'y'): Bounds {
  let min = Infinity
  let max = -Infinity
  for (const line of series)
    for (const point of line) {
      min = Math.min(min, point[axis])
      max = Math.max(max, point[axis])
    }
  return min <= max ? extent(min, max) : [0, 1]
}

function plot(
  parent: HTMLElement,
  name: ChartName,
  title: Message,
  series: readonly Series[],
  options: {
    xLabel?: string
    yLabel?: string
    yRange?: Bounds
    ticks?: readonly Tick[]
    choices?: readonly ChartPoint[]
    selected?: number
    onChoose?: (index: number) => void
  } = {}
) {
  const heading = document.createElement('h3')
  heading.textContent = tr(title)
  const canvas = document.createElement('canvas')
  canvas.width = 302
  canvas.height = 151
  canvas.dataset.chart = name
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', heading.textContent)
  parent.append(heading, canvas)
  const context = canvas.getContext('2d')
  if (!context) return
  const [xMin, xMax] = range(series, 'x')
  const [yMin, yMax] = options.yRange ?? range(series, 'y')
  const x = (n: number) => area.left + ((n - xMin) / (xMax - xMin)) * (area.right - area.left)
  const y = (n: number) => area.bottom - ((n - yMin) / (yMax - yMin)) * (area.bottom - area.top)
  context.fillStyle = '#f8fbfc'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.font = '9px system-ui'
  context.strokeStyle = '#a7bbc2'
  context.fillStyle = '#405762'
  context.beginPath()
  context.moveTo(area.left, area.top)
  context.lineTo(area.left, area.bottom)
  context.lineTo(area.right, area.bottom)
  context.stroke()
  context.fillText(yMax.toPrecision(3), 1, area.top + 9, area.left - 3)
  context.fillText(yMin.toPrecision(3), 1, area.bottom, area.left - 3)
  if (options.yLabel) context.fillText(options.yLabel, 1, 56, area.left - 3)
  if (options.xLabel) context.fillText(options.xLabel, area.left, canvas.height - 3)
  const ticks = options.ticks ?? [
    { x: xMin, label: xMin.toPrecision(3) },
    { x: xMax, label: xMax.toPrecision(3) }
  ]
  let labelEnd = 0
  for (const tick of ticks) {
    const px = Math.min(x(tick.x), area.right - context.measureText(tick.label).width)
    if (px < labelEnd) continue
    context.fillText(tick.label, px, area.bottom + 12)
    labelEnd = px + context.measureText(tick.label).width + 5
  }
  for (const [index, line] of series.entries()) {
    context.strokeStyle = colors[index % colors.length]
    context.fillStyle = context.strokeStyle
    context.beginPath()
    for (const [i, point] of line.entries()) {
      const px = x(point.x)
      const py = y(point.y)
      if (!i || point.breakBefore) context.moveTo(px, py)
      else context.lineTo(px, py)
      if (line.length < 2 || options.choices?.length === line.length)
        context.fillRect(px - 1.5, py - 1.5, 3, 3)
    }
    context.stroke()
  }
  const marker = options.choices?.find((point) => point.index === options.selected)
  if (marker) {
    context.strokeStyle = '#ae292b'
    context.beginPath()
    context.moveTo(x(marker.x), area.top)
    context.lineTo(x(marker.x), area.bottom)
    context.stroke()
  }
  if (options.onChoose && options.choices?.length)
    canvas.addEventListener('click', (event) => {
      const bounds = canvas.getBoundingClientRect()
      const px = ((event.clientX - bounds.left) / bounds.width) * canvas.width
      let best: ChartPoint | undefined
      for (const point of options.choices!)
        if (!best || Math.abs(x(point.x) - px) < Math.abs(x(best.x) - px)) best = point
      if (best) options.onChoose!(best.index)
    })
}

function trajectory(
  frames: readonly Pick<ResultFrame, 'step' | 'timeFs' | 'image' | 'energyEv'>[]
) {
  const timed = frames.length > 0 && frames.every((frame) => frame.timeFs !== undefined)
  const neb = frames.length > 0 && frames.every((frame) => frame.image !== undefined)
  const points: ChartPoint[] = []
  for (const [index, frame] of frames.entries()) {
    if (frame.energyEv === undefined) continue
    points.push({
      x: timed ? frame.timeFs! : neb ? frame.image! : (frame.step ?? index),
      y: frame.energyEv,
      index
    })
  }
  return {
    points,
    line: points.map((point, i) => ({
      ...point,
      breakBefore: i > 0 && points[i - 1].index + 1 !== point.index
    })),
    xLabel: timed ? 'fs' : tr(neb ? 'resultImage' : 'resultStep')
  }
}

type Bands = Extract<ResultChartData, { kind: 'bands' }>

function kPath(bands: Bands, cell: Cell | undefined) {
  const points: ChartPoint[] = []
  const ticks: Tick[] = []
  let distance = 0
  let previous: readonly number[] | undefined
  for (const [index, point] of bands.points.entries()) {
    const reciprocal = cell && reciprocalPoint(cell, point.fractional)
    const position = reciprocal && reciprocal.ok ? reciprocal.value : point.fractional
    if (previous && !point.breakBefore)
      distance += Math.hypot(...position.map((value, axis) => value - previous![axis]))
    points.push({ x: distance, y: 0, index })
    if (point.label) {
      const last = ticks.at(-1)
      if (last?.x === distance) {
        if (last.label !== point.label) last.label += ` / ${point.label}`
      } else ticks.push({ x: distance, label: point.label })
    }
    previous = position
  }
  return { points, ticks }
}

export function drawResultCharts(
  parent: HTMLElement,
  frames: readonly Pick<ResultFrame, 'step' | 'timeFs' | 'image' | 'energyEv'>[],
  data: readonly ResultChartData[],
  settings: {
    cell?: Cell
    frame: number
    kIndex: number
    mode?: string
    energyOffset: number
    chooseFrame(index: number): void
    chooseKPoint(index: number): void
    chooseMode(id: string): void
  }
) {
  parent.replaceChildren()
  const { points, line, xLabel } = trajectory(frames)
  if (points.length)
    plot(parent, 'energy', 'resultEnergy', [line], {
      xLabel,
      yLabel: 'eV',
      choices: points,
      selected: settings.frame,
      onChoose: settings.chooseFrame
    })
  const bands = data.find((dataset) => dataset.kind === 'bands')
  const dos = data.find((dataset) => dataset.kind === 'dos')
  const modes = data.find((dataset) => dataset.kind === 'vibration')
  const { energyOffset } = settings
  const path = bands && kPath(bands, settings.cell)
  const bandSeries =
    bands && path
      ? bands.bands.map((series) =>
          series.energies.map((energy, i) => ({
            x: path.points[i].x,
            y: energy - energyOffset,
            breakBefore: bands.points[i].breakBefore
          }))
        )
      : []
  const dosSeries = dos
    ? dos.series.map((series) =>
        series.values.map((value, i) => ({ x: value, y: dos.energies[i] - energyOffset }))
      )
    : []
  const yRange = range([...bandSeries, ...dosSeries], 'y')
  if (path)
    plot(parent, 'bands', 'resultBands', bandSeries, {
      xLabel: settings.cell ? 'k (Å⁻¹)' : 'k',
      yLabel: 'eV',
      yRange,
      ticks: path.ticks.length ? path.ticks : undefined,
      choices: path.points,
      selected: settings.kIndex,
      onChoose: settings.chooseKPoint
    })
  if (dos) plot(parent, 'dos', 'resultDos', dosSeries, { xLabel: dos.unit, yLabel: 'eV', yRange })
  if (modes) {
    const modePoints = modes.modes.map((mode, index) => ({
      x: index + 1,
      y: mode.imaginary ? -Math.abs(mode.frequencyThz) : mode.frequencyThz,
      index,
      breakBefore: true
    }))
    plot(parent, 'spectrum', 'resultSpectrum', [modePoints], {
      yLabel: 'THz',
      choices: modePoints,
      selected: modes.modes.findIndex((mode) => mode.id === settings.mode),
      onChoose: (index) => settings.chooseMode(modes.modes[index].id)
    })
  }
}
