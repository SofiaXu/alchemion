import { getElement } from '../core/data'
import type { DerivationOptions } from '../core/bonds'
import type { StructureSnapshot, Vec3 } from '../core/types'
import type { CameraPose, ViewerOptions } from './types'

export function immutable<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}
export const DEFAULT_OPTIONS: ViewerOptions = immutable({
  renderMode: 'space-filling',
  elementStyles: {},
  atomScale: 1,
  ballRadius: 0.45,
  bondRadius: 0.12,
  missingRadius: 1.5,
  showLattice: false,
  showReciprocalLattice: false,
  showBrillouinZone: false,
  showSymmetryMates: true,
  neighborCells: [],
  cutoff: { kind: 'none' },
  inferBonds: true,
  interactionMode: 'none',
  showPerformance: false
})

const vector = (input: unknown): input is Vec3 =>
  Array.isArray(input) && input.length === 3 && input.every(Number.isFinite)
export function validateCamera(pose: CameraPose): void {
  if (
    !pose ||
    !vector(pose.position) ||
    !vector(pose.target) ||
    !vector(pose.up) ||
    !Number.isFinite(pose.fovYDegrees) ||
    pose.fovYDegrees <= 0 ||
    pose.fovYDegrees >= 180 ||
    !Number.isFinite(pose.near) ||
    !Number.isFinite(pose.far) ||
    pose.near <= 0 ||
    pose.far <= pose.near
  )
    throw new RangeError(
      'CAMERA_PARAMETERS: a finite perspective pose with 0 < near < far is required.'
    )
  const direction = pose.target.map((v, i) => v - pose.position[i])
  const cross = [
    direction[1] * pose.up[2] - direction[2] * pose.up[1],
    direction[2] * pose.up[0] - direction[0] * pose.up[2],
    direction[0] * pose.up[1] - direction[1] * pose.up[0]
  ]
  if (Math.hypot(...direction) < 1e-12 || Math.hypot(...cross) < 1e-12)
    throw new RangeError(
      'CAMERA_PARAMETERS: the view direction and up vector must be nonzero and independent.'
    )
}

export function mergeOptions(current: ViewerOptions, patch: Partial<ViewerOptions>): ViewerOptions {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new TypeError('VIEWER_OPTIONS: options must be an object.')
  for (const key of Object.keys(patch))
    if (!(key in DEFAULT_OPTIONS)) throw new TypeError(`VIEWER_OPTIONS: unknown option ${key}.`)
  const next = { ...current, ...structuredClone(patch) }
  if (!['space-filling', 'ball-and-stick'].includes(next.renderMode))
    throw new TypeError('VIEWER_OPTIONS: unsupported render mode.')
  for (const key of ['atomScale', 'ballRadius', 'bondRadius', 'missingRadius'] as const)
    if (!Number.isFinite(next[key]) || next[key] <= 0)
      throw new RangeError(`VIEWER_OPTIONS: ${key} must be positive and finite.`)
  for (const key of [
    'showLattice',
    'showReciprocalLattice',
    'showBrillouinZone',
    'showSymmetryMates',
    'inferBonds',
    'showPerformance'
  ] as const)
    if (typeof next[key] !== 'boolean')
      throw new TypeError(`VIEWER_OPTIONS: ${key} must be boolean.`)
  if (
    ![
      'none',
      'select',
      'pick-point',
      'measure-distance',
      'measure-angle',
      'measure-torsion'
    ].includes(next.interactionMode)
  )
    throw new TypeError('VIEWER_OPTIONS: unsupported interaction mode.')
  if (
    !Array.isArray(next.neighborCells) ||
    next.neighborCells.some((cell) => !vector(cell) || !cell.every(Number.isSafeInteger))
  )
    throw new RangeError('VIEWER_OPTIONS: neighbor cells must be integer triples.')
  if (
    !next.cutoff ||
    !['none', 'fraction', 'bond'].includes(next.cutoff.kind) ||
    (next.cutoff.kind === 'fraction' &&
      (!vector(next.cutoff.width) || next.cutoff.width.some((n) => n < 0)))
  )
    throw new RangeError(
      'VIEWER_OPTIONS: cutoff requires a known kind and nonnegative finite widths.'
    )
  if (
    !next.elementStyles ||
    typeof next.elementStyles !== 'object' ||
    Array.isArray(next.elementStyles)
  )
    throw new TypeError('VIEWER_OPTIONS: elementStyles must be a record.')
  for (const [symbol, style] of Object.entries(next.elementStyles)) {
    if (!getElement(symbol) || !style || typeof style !== 'object' || Array.isArray(style))
      throw new TypeError('VIEWER_OPTIONS: styles must reference supported element symbols.')
    if (
      Object.keys(style).some((key) => !['color', 'spaceFillingRadius', 'ballRadius'].includes(key))
    )
      throw new TypeError('VIEWER_OPTIONS: unknown element style field.')
    if (style.color !== undefined && !/^#[\da-f]{6}$/i.test(style.color))
      throw new TypeError('VIEWER_OPTIONS: colors must be #RRGGBB.')
    for (const key of ['spaceFillingRadius', 'ballRadius'] as const)
      if (style[key] !== undefined && (!Number.isFinite(style[key]) || style[key]! <= 0))
        throw new RangeError('VIEWER_OPTIONS: element radii must be positive finite Å values.')
  }
  return immutable(next)
}

export function derivationOptions(
  snapshot: StructureSnapshot,
  options: ViewerOptions
): DerivationOptions {
  return {
    inferBonds: options.inferBonds,
    ...(snapshot.kind === 'periodic'
      ? {
          applySymmetry: options.showSymmetryMates,
          neighborCells: options.neighborCells,
          cutoff: options.cutoff
        }
      : {})
  }
}
export function derivationChanged(a: ViewerOptions, b: ViewerOptions): boolean {
  return ['inferBonds', 'showSymmetryMates', 'neighborCells', 'cutoff'].some(
    (key) =>
      JSON.stringify(a[key as keyof ViewerOptions]) !==
      JSON.stringify(b[key as keyof ViewerOptions])
  )
}
