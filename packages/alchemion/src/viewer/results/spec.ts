import { isFiniteVector, isIntegerVector, norm } from '../../core/math'
import type { ResultLayerSpec, ResultViewLayer } from './types'

const kinds = ['surface', 'slice', 'atomic', 'comparison', 'vibration', 'fermi', 'k-point']
const ids = [
  'datasetId',
  'frameId',
  'colorDatasetId',
  'colorResultId',
  'subtractDatasetId',
  'subtractResultId',
  'targetResultId',
  'targetFrameId',
  'modeId'
] as const
const switches = [
  'visible',
  'resample',
  'removeCellDeformation',
  'fit',
  'selectedOnly',
  'labels',
  'arrows'
] as const
const numbers = [
  'opacity',
  'order',
  'threshold',
  'negativeThreshold',
  'scale',
  'min',
  'max',
  'phase',
  'kIndex'
] as const
const colors = ['color', 'negativeColor'] as const
const fields = new Set<string>([
  'kind',
  'resultId',
  ...ids,
  ...switches,
  ...numbers,
  ...colors,
  'plane',
  'tiles',
  'elements',
  'supercell',
  'pairs'
])
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const object = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value)

export function validateResultLayer(input: unknown): ResultLayerSpec {
  const layer = input as ResultLayerSpec
  if (
    !object(layer) ||
    !kinds.includes(layer.kind) ||
    !isId(layer.resultId) ||
    Object.keys(layer).some((key) => !fields.has(key)) ||
    ids.some((key) => layer[key] !== undefined && !isId(layer[key])) ||
    switches.some((key) => layer[key] !== undefined && typeof layer[key] !== 'boolean') ||
    numbers.some((key) => layer[key] !== undefined && !Number.isFinite(layer[key])) ||
    colors.some(
      (key) =>
        layer[key] !== undefined &&
        (typeof layer[key] !== 'string' || !/^#[\da-fA-F]{6}$/.test(layer[key]))
    ) ||
    (layer.opacity !== undefined && (layer.opacity < 0 || layer.opacity > 1)) ||
    (layer.scale !== undefined && layer.scale < 0) ||
    (layer.min !== undefined && layer.max !== undefined && layer.min > layer.max) ||
    (layer.kIndex !== undefined && (!Number.isSafeInteger(layer.kIndex) || layer.kIndex < 0)) ||
    (layer.plane !== undefined &&
      (!layer.plane ||
        !isFiniteVector(layer.plane.point) ||
        !isFiniteVector(layer.plane.normal) ||
        norm(layer.plane.normal) === 0)) ||
    (layer.kind === 'slice' && layer.plane === undefined) ||
    (layer.kind === 'surface' &&
      layer.threshold === undefined &&
      layer.negativeThreshold === undefined) ||
    (layer.pairs !== undefined &&
      (!Array.isArray(layer.pairs) ||
        layer.pairs.length > 10_000 ||
        !Array.from(layer.pairs).every(
          (pair) => object(pair) && isId(pair.referenceId) && isId(pair.targetId)
        ))) ||
    (layer.kind === 'comparison' &&
      layer.targetResultId !== undefined &&
      layer.targetResultId !== layer.resultId &&
      !layer.pairs) ||
    (layer.tiles !== undefined &&
      (!Array.isArray(layer.tiles) ||
        layer.tiles.length > 125 ||
        !Array.from(layer.tiles).every(isIntegerVector))) ||
    (layer.elements !== undefined &&
      (!Array.isArray(layer.elements) || !Array.from(layer.elements).every(isId))) ||
    (layer.supercell !== undefined &&
      (!isIntegerVector(layer.supercell) ||
        layer.supercell.some((n) => n < 1) ||
        layer.supercell.reduce((a, b) => a * b, 1) > 125))
  ) {
    throw new TypeError('RESULT_LAYER: invalid result layer parameters.')
  }
  return structuredClone(layer)
}
const digests = (value: readonly string[]) =>
  Array.isArray(value) &&
  Array.from(value).every((hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))
export function validateResultViewLayers(input: unknown): readonly ResultViewLayer[] {
  if (!Array.isArray(input) || input.length > 128)
    throw new TypeError('RESULT_VIEW: a bounded array of layer references is required.')
  const ids = new Set<string>()
  return Array.from(input, (item: ResultViewLayer) => {
    if (
      !object(item) ||
      !isId(item.id) ||
      ids.has(item.id) ||
      !digests(item.sources) ||
      (item.targetSources !== undefined && !digests(item.targetSources)) ||
      (item.colorSources !== undefined && !digests(item.colorSources)) ||
      (item.subtractSources !== undefined && !digests(item.subtractSources))
    )
      throw new TypeError('RESULT_VIEW: invalid or duplicate layer reference.')
    ids.add(item.id)
    return {
      id: item.id,
      spec: validateResultLayer(item.spec),
      sources: [...item.sources],
      ...(item.targetSources ? { targetSources: [...item.targetSources] } : {}),
      ...(item.colorSources ? { colorSources: [...item.colorSources] } : {}),
      ...(item.subtractSources ? { subtractSources: [...item.subtractSources] } : {})
    }
  })
}
