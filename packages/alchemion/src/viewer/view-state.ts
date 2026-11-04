import { DEFAULT_OPTIONS, immutable, mergeOptions, validateCamera } from './options'
import type { PngExportOptions, ViewerViewState } from './types'
import { validateResultViewLayers } from './results/spec'
import type { ViewerResultViewState } from './results/types'

/** Validate the whole portable configuration before touching the live viewer. */
export function validateViewState(value: unknown): ViewerViewState {
  const input = value as ViewerViewState
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.version !== 1 ||
    Object.keys(input).some((key) => !['version', 'camera', 'options'].includes(key)) ||
    !input.options ||
    typeof input.options !== 'object' ||
    Array.isArray(input.options) ||
    Object.keys(DEFAULT_OPTIONS).some((key) => !Object.hasOwn(input.options, key)) ||
    !input.camera ||
    typeof input.camera !== 'object' ||
    Array.isArray(input.camera) ||
    Object.keys(input.camera).some(
      (key) => !['position', 'target', 'up', 'fovYDegrees', 'near', 'far'].includes(key)
    )
  )
    throw new TypeError('VIEW_STATE: a complete version 1 view configuration is required.')
  validateCamera(input.camera)
  return immutable({
    version: 1,
    camera: structuredClone(input.camera),
    options: mergeOptions(DEFAULT_OPTIONS, input.options)
  })
}

export function validatePortableViewState(value: unknown): ViewerViewState | ViewerResultViewState {
  const input = value as ViewerResultViewState
  if (input?.version !== 2) return validateViewState(value)
  if (Object.keys(input).some((key) => !['version', 'camera', 'options', 'layers'].includes(key)))
    throw new TypeError('RESULT_VIEW: unknown portable result view fields.')
  const base = validateViewState({ version: 1, camera: input.camera, options: input.options })
  return immutable({ ...base, version: 2, layers: validateResultViewLayers(input.layers) })
}

export function pngOptions(input: PngExportOptions, width: number, height: number) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['width', 'height', 'transparent'].includes(key))
  )
    throw new TypeError('PNG_OPTIONS: unsupported PNG options.')
  const next = {
    width: input.width ?? width,
    height: input.height ?? height,
    transparent: input.transparent ?? false
  }
  if (
    !Number.isSafeInteger(next.width) ||
    !Number.isSafeInteger(next.height) ||
    next.width <= 0 ||
    next.height <= 0 ||
    next.width * next.height > 33_554_432 ||
    typeof next.transparent !== 'boolean'
  )
    throw new RangeError('PNG_SIZE: positive pixel dimensions within 32 megapixels are required.')
  return next
}
