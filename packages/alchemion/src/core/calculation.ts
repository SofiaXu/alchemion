import { validateCell } from './cell'
import { getElement } from './data'
import { determinant, isFiniteVector, norm, subtract } from './math'
import { failure, failureFrom, success } from './result'
import { createStructureSnapshot } from './structure'
import type { AtomId, Cell, Matrix3, ScientificResult, StructureSnapshot, Vec3 } from './types'

export const CALCULATION_LIMITS = Object.freeze({
  fileBytes: 128 * 1024 ** 2,
  resultBytes: 256 * 1024 ** 2,
  gridSamples: 256 ** 3,
  frames: 2_000,
  atomFrames: 2_000_000,
  triangles: 500_000,
  gpuBytes: 128 * 1024 ** 2
})

export interface CalculationSource {
  readonly name: string
  readonly format: string
  readonly sha256: string
}
export interface ResultFrame {
  readonly id: string
  readonly structure: StructureSnapshot
  readonly step?: number
  readonly timeFs?: number
  readonly image?: number
  readonly energyEv?: number
  readonly energyKind?: string
}
export interface ResultGrid {
  readonly origin: Vec3
  readonly steps: Matrix3
  readonly dimensions: Vec3
  readonly periodic: readonly [boolean, boolean, boolean]
  /** Samples are indexed x + nx * (y + ny * z). Periodic axes omit the repeated endpoint. */
  readonly values: Float64Array | readonly number[]
}
export interface VibrationMode {
  readonly id: string
  readonly frequencyThz: number
  readonly imaginary: boolean
  readonly q?: Vec3
  readonly real: readonly Vec3[]
  readonly imag?: readonly Vec3[]
  /** Present when displacement requires division by the square root of atomic mass in u. */
  readonly masses?: readonly number[]
}
export interface FermiReference {
  readonly value: number
  readonly source: string
}
interface DataIdentity {
  readonly id: string
  readonly frameId: string
  readonly quantity: string
  readonly unit: string
  readonly method?: string
  readonly spin?: string
}
export type CalculationData = DataIdentity &
  (
    | {
        readonly kind: 'atomic'
        readonly values: readonly (number | Vec3 | null)[]
        readonly vector?: 'polar' | 'axial'
        readonly direction?: Vec3
      }
    | { readonly kind: 'grid'; readonly grid: ResultGrid }
    | {
        readonly kind: 'vibration'
        readonly modes: readonly VibrationMode[]
      }
    | {
        readonly kind: 'bands'
        readonly points: readonly {
          readonly fractional: Vec3
          readonly label?: string
          readonly breakBefore?: boolean
        }[]
        readonly bands: readonly {
          readonly band: number
          readonly spin?: string
          readonly energies: readonly number[]
        }[]
        readonly fermi?: FermiReference
      }
    | {
        readonly kind: 'dos'
        readonly energies: readonly number[]
        readonly series: readonly {
          readonly label: string
          readonly spin?: string
          readonly values: readonly number[]
        }[]
        readonly fermi?: FermiReference
      }
    | {
        readonly kind: 'fermi-grid'
        readonly band: number
        readonly grid: ResultGrid
        readonly fermi: FermiReference
      }
  )
export interface CalculationResult {
  readonly version: 1
  readonly id: string
  readonly sources: readonly CalculationSource[]
  readonly program?: { readonly name: string; readonly version?: string }
  readonly termination: 'unknown' | 'completed' | 'incomplete'
  readonly convergence: 'unknown' | 'converged' | 'unconverged'
  readonly frames: readonly ResultFrame[]
  readonly initialFrameId?: string
  readonly data: readonly CalculationData[]
}
export interface PoscarExportReceipt {
  readonly version: 1
  readonly cell: Cell
  readonly atoms: readonly {
    readonly fileAtomNumber: number
    readonly atomId: AtomId
    readonly element: string
    readonly fractional: Vec3
  }[]
}

const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const count = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
const finiteOptional = (value: number | undefined) => value === undefined || Number.isFinite(value)
const stringOptional = (value: string | undefined) => value === undefined || nonempty(value)
const finiteList = (values: readonly number[], length?: number) =>
  Array.isArray(values) &&
  (length === undefined || values.length === length) &&
  Array.from(values).every(Number.isFinite)
const vectors = (values: readonly Vec3[], length: number) =>
  Array.isArray(values) && values.length === length && Array.from(values).every(isFiniteVector)

export function calculationSize(result: CalculationResult): {
  bytes: number
  samples: number
  atomFrames: number
} {
  let samples = 0
  let atomFrames = 0
  let bytes = 0
  for (const frame of result.frames) {
    atomFrames += frame.structure.atoms.length
    // An upper bound for JSON text including optional atom/bond metadata.
    bytes += 2 * JSON.stringify(frame.structure).length
  }
  for (const data of result.data) {
    if (data.kind === 'grid' || data.kind === 'fermi-grid') {
      samples += data.grid.values.length
      bytes += 8 * data.grid.values.length
    } else {
      bytes += 2 * JSON.stringify(data).length
    }
  }
  return { bytes, samples, atomFrames }
}

function validGrid(grid: ResultGrid): boolean {
  if (
    !grid ||
    !isFiniteVector(grid.origin) ||
    !isFiniteVector(grid.dimensions) ||
    !grid.dimensions.every((size) => count(size) && size >= 2) ||
    !vectors(grid.steps, 3) ||
    !Number.isFinite(determinant(grid.steps)) ||
    Math.abs(determinant(grid.steps)) === 0 ||
    !Array.isArray(grid.periodic) ||
    grid.periodic.length !== 3 ||
    !Array.from(grid.periodic).every((flag) => typeof flag === 'boolean')
  )
    return false
  const length = grid.dimensions.reduce((a, b) => a * b, 1)
  return (
    length <= CALCULATION_LIMITS.gridSamples &&
    (grid.values instanceof Float64Array || Array.isArray(grid.values)) &&
    grid.values.length === length &&
    (grid.values instanceof Float64Array
      ? grid.values.every(Number.isFinite)
      : finiteList(grid.values))
  )
}

const validFermi = (fermi: FermiReference | undefined) =>
  !!fermi && Number.isFinite(fermi.value) && nonempty(fermi.source)

function validData(data: CalculationData, frame: ResultFrame): boolean {
  const length = frame.structure.atoms.length
  switch (data.kind) {
    case 'grid':
      return validGrid(data.grid)
    case 'fermi-grid':
      return (
        frame.structure.kind === 'periodic' &&
        count(data.band) &&
        validFermi(data.fermi) &&
        validGrid(data.grid) &&
        data.grid.periodic.every(Boolean)
      )
    case 'atomic':
      return (
        Array.isArray(data.values) &&
        data.values.length === length &&
        (data.vector === undefined || ['polar', 'axial'].includes(data.vector)) &&
        (data.direction === undefined ||
          (isFiniteVector(data.direction) && norm(data.direction) > 0)) &&
        Array.from(data.values).every(
          (value) =>
            value === null || (data.vector ? isFiniteVector(value) : Number.isFinite(value))
        )
      )
    case 'vibration': {
      if (!Array.isArray(data.modes) || !data.modes.length) return false
      const ids = new Set<string>()
      for (const mode of data.modes as readonly VibrationMode[]) {
        if (
          !mode ||
          !nonempty(mode.id) ||
          ids.has(mode.id) ||
          !Number.isFinite(mode.frequencyThz) ||
          mode.frequencyThz < 0 ||
          typeof mode.imaginary !== 'boolean' ||
          (mode.q !== undefined && !isFiniteVector(mode.q)) ||
          !vectors(mode.real, length) ||
          (mode.imag !== undefined && !vectors(mode.imag, length)) ||
          (mode.masses !== undefined &&
            (!finiteList(mode.masses, length) || mode.masses.some((mass) => mass <= 0)))
        )
          return false
        ids.add(mode.id)
      }
      return true
    }
    case 'bands':
      return (
        Array.isArray(data.points) &&
        data.points.length > 0 &&
        (data.points as Extract<CalculationData, { kind: 'bands' }>['points']).every(
          (point) =>
            !!point &&
            isFiniteVector(point.fractional) &&
            stringOptional(point.label) &&
            (point.breakBefore === undefined || typeof point.breakBefore === 'boolean')
        ) &&
        Array.isArray(data.bands) &&
        data.bands.length > 0 &&
        (data.bands as Extract<CalculationData, { kind: 'bands' }>['bands']).every(
          (band) =>
            !!band &&
            count(band.band) &&
            stringOptional(band.spin) &&
            finiteList(band.energies, data.points.length)
        ) &&
        (data.fermi === undefined || validFermi(data.fermi))
      )
    case 'dos':
      return (
        finiteList(data.energies) &&
        data.energies.length > 0 &&
        data.energies.every((value, index) => index === 0 || value > data.energies[index - 1]) &&
        Array.isArray(data.series) &&
        data.series.length > 0 &&
        (data.series as Extract<CalculationData, { kind: 'dos' }>['series']).every(
          (entry) =>
            !!entry &&
            nonempty(entry.label) &&
            stringOptional(entry.spin) &&
            finiteList(entry.values, data.energies.length)
        ) &&
        (data.fermi === undefined || validFermi(data.fermi))
      )
    default:
      return false
  }
}

/** Validate JSON or SDK input and isolate all buffers and frame snapshots. */
export function validateCalculationResult(input: unknown): ScientificResult<CalculationResult> {
  const result = input as CalculationResult
  if (
    !result ||
    result.version !== 1 ||
    !nonempty(result.id) ||
    !Array.isArray(result.sources) ||
    !result.sources.length ||
    !(result.sources as readonly CalculationSource[]).every(
      (source) =>
        !!source &&
        nonempty(source.name) &&
        nonempty(source.format) &&
        typeof source.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(source.sha256)
    ) ||
    (result.program !== undefined &&
      (!result.program ||
        !nonempty(result.program.name) ||
        !stringOptional(result.program.version))) ||
    !['unknown', 'completed', 'incomplete'].includes(result.termination) ||
    !['unknown', 'converged', 'unconverged'].includes(result.convergence) ||
    !Array.isArray(result.frames) ||
    !result.frames.length ||
    !Array.isArray(result.data)
  ) {
    return failure(
      'RESULT_SCHEMA',
      'A version 1 calculation result with sources and frames is required.'
    )
  }
  if (result.frames.length > CALCULATION_LIMITS.frames)
    return failure('RESULT_BUDGET', 'The calculation exceeds the frame budget.')
  const frames = new Map<string, ResultFrame>()
  let atomFrames = 0
  for (const frame of result.frames as readonly ResultFrame[]) {
    if (
      !frame ||
      !nonempty(frame.id) ||
      frames.has(frame.id) ||
      (frame.step !== undefined && !count(frame.step)) ||
      (frame.image !== undefined && !count(frame.image)) ||
      !finiteOptional(frame.timeFs) ||
      !finiteOptional(frame.energyEv) ||
      !stringOptional(frame.energyKind)
    )
      return failure(
        'RESULT_FRAME',
        'Frame identifiers and numeric metadata must be valid and unique.'
      )
    if (Array.isArray(frame.structure?.atoms)) atomFrames += frame.structure.atoms.length
    if (atomFrames > CALCULATION_LIMITS.atomFrames)
      return failure('RESULT_BUDGET', 'The calculation exceeds the atom-frame budget.')
    const structure = createStructureSnapshot(frame.structure)
    if (!structure.ok) return failureFrom(structure.diagnostics)
    frames.set(frame.id, { ...frame, structure: structure.value })
  }
  if (result.initialFrameId !== undefined && !frames.has(result.initialFrameId))
    return failure('RESULT_FRAME', 'The initial frame reference is unavailable.')
  const ids = new Set<string>()
  let samples = 0
  for (const data of result.data as readonly CalculationData[]) {
    const frame = data && frames.get(data.frameId)
    if (
      !frame ||
      !nonempty(data.id) ||
      ids.has(data.id) ||
      !nonempty(data.quantity) ||
      !nonempty(data.unit) ||
      !stringOptional(data.method) ||
      !stringOptional(data.spin) ||
      !validData(data, frame)
    )
      return failure(
        'RESULT_DATA',
        'A dataset has invalid values, units, identity or a missing frame.',
        {
          field: data?.id ?? 'data'
        }
      )
    if (data.kind === 'grid' || data.kind === 'fermi-grid') samples += data.grid.values.length
    if (samples > CALCULATION_LIMITS.gridSamples)
      return failure('RESULT_BUDGET', 'The calculation exceeds the grid sample budget.', {
        field: data.id
      })
    ids.add(data.id)
  }
  try {
    if (calculationSize(result).bytes > CALCULATION_LIMITS.resultBytes)
      return failure('RESULT_BUDGET', 'The calculation exceeds the resident data budget.')
    return success({
      ...result,
      sources: result.sources.map((source: CalculationSource) => ({ ...source })),
      ...(result.program ? { program: { ...result.program } } : {}),
      frames: [...frames.values()],
      data: (result.data as readonly CalculationData[]).map((data): CalculationData => {
        if (data.kind !== 'grid' && data.kind !== 'fermi-grid')
          return JSON.parse(JSON.stringify(data)) as CalculationData
        const { values, ...geometry } = data.grid
        const { grid: _grid, ...properties } = data
        void _grid
        return {
          ...(JSON.parse(JSON.stringify(properties)) as typeof properties),
          grid: {
            ...(JSON.parse(JSON.stringify(geometry)) as typeof geometry),
            values: Float64Array.from(values)
          }
        } as CalculationData
      })
    })
  } catch {
    return failure('RESULT_SCHEMA', 'Calculation result metadata must be cloneable data.')
  }
}

function positionMatches(a: Vec3, b: Vec3, periodic: boolean): boolean {
  const delta = subtract(a, b)
  return periodic
    ? delta.every((value) => Math.abs(value - Math.round(value)) <= 1e-6)
    : norm(delta) <= 1e-5
}
function cellsMatch(a: Cell, b: Cell): boolean {
  return a.basis.every((column, index) => norm(subtract(column, b.basis[index])) <= 1e-5)
}

/** Test frame geometry with an explicit mapping from file row to host atom ID. */
export function matchResultFrame(
  frame: StructureSnapshot,
  source: StructureSnapshot,
  atomIds: readonly AtomId[]
): boolean {
  if (
    frame.kind !== source.kind ||
    frame.atoms.length !== source.atoms.length ||
    atomIds.length !== frame.atoms.length ||
    new Set(atomIds).size !== atomIds.length
  )
    return false
  if (frame.kind === 'periodic' && source.kind === 'periodic') {
    if (!cellsMatch(frame.cell, source.cell)) return false
    const byId = new Map(source.atoms.map((atom) => [atom.id, atom]))
    return frame.atoms.every((atom, index) => {
      const match = byId.get(atomIds[index])
      return (
        match?.element === atom.element && positionMatches(atom.fractional, match.fractional, true)
      )
    })
  }
  if (frame.kind === 'molecular' && source.kind === 'molecular') {
    const byId = new Map(source.atoms.map((atom) => [atom.id, atom]))
    return frame.atoms.every((atom, index) => {
      const match = byId.get(atomIds[index])
      return (
        match?.element === atom.element && positionMatches(atom.cartesian, match.cartesian, false)
      )
    })
  }
  return false
}

export function registerResultFrame(
  frame: StructureSnapshot,
  source: StructureSnapshot,
  options: { readonly receipt?: PoscarExportReceipt; readonly atomIds?: readonly AtomId[] } = {}
): ScientificResult<readonly AtomId[]> {
  if (frame.kind !== source.kind)
    return failure(
      'RESULT_STRUCTURE_KIND',
      'The result and document must use the same coordinate kind.'
    )
  if (options.receipt) {
    const receipt = options.receipt
    if (
      receipt.version !== 1 ||
      frame.kind !== 'periodic' ||
      !receipt.cell ||
      validateCell(receipt.cell).some((item) => item.severity === 'error') ||
      !cellsMatch(frame.cell, receipt.cell) ||
      !Array.isArray(receipt.atoms) ||
      receipt.atoms.length !== frame.atoms.length
    )
      return failure(
        'RESULT_RECEIPT',
        'The POSCAR mapping does not match the result input cell or atom count.'
      )
    for (const [index, row] of receipt.atoms.entries()) {
      const atom = frame.atoms[index]
      if (
        !row ||
        row.fileAtomNumber !== index + 1 ||
        !nonempty(row.atomId) ||
        row.element !== atom.element ||
        !getElement(row.element) ||
        !isFiniteVector(row.fractional) ||
        !positionMatches(row.fractional, atom.fractional, true)
      )
        return failure(
          'RESULT_RECEIPT_ROW',
          'A POSCAR mapping row conflicts with the result input geometry.',
          {
            field: String(index + 1)
          }
        )
    }
  }
  const ids = options.receipt?.atoms.map((row) => row.atomId) ?? options.atomIds
  if (ids) {
    if (!matchResultFrame(frame, source, ids))
      return failure(
        'RESULT_BINDING',
        'The mapped frame does not match the active document geometry.'
      )
    return success(Object.freeze([...ids]))
  }
  // Without a receipt, require a unique element-and-position match for every atom.
  if (
    frame.atoms.length !== source.atoms.length ||
    (frame.kind === 'periodic' &&
      source.kind === 'periodic' &&
      !cellsMatch(frame.cell, source.cell))
  )
    return failure('RESULT_BINDING', 'The atom count or cell does not match the active document.')
  const matchIds: AtomId[] = []
  const byPosition = new Map<string, (typeof source.atoms)[number][]>()
  const periodic = frame.kind === 'periodic'
  const binCount = 1_000_000
  const bin = (value: number) =>
    periodic
      ? Math.floor((value - Math.floor(value)) * binCount) % binCount
      : Math.floor(value / 1e-5)
  const coordinate = (atom: (typeof source.atoms)[number]) =>
    'fractional' in atom ? atom.fractional : atom.cartesian
  const positionKey = (element: string, x: number, y: number, z: number) =>
    `${element}:${x}:${y}:${z}`
  const adjacent = (value: number) => [
    ...new Set(
      [-1, 0, 1].map((offset) =>
        periodic ? (value + offset + binCount) % binCount : value + offset
      )
    )
  ]
  for (const atom of source.atoms) {
    const [x, y, z] = coordinate(atom).map(bin)
    const key = positionKey(atom.element, x, y, z)
    const group = byPosition.get(key)
    if (group) group.push(atom)
    else byPosition.set(key, [atom])
  }
  for (const atom of frame.atoms) {
    const position = coordinate(atom)
    const [x, y, z] = position.map(bin)
    const candidates = adjacent(x)
      .flatMap((i) =>
        adjacent(y).flatMap((j) =>
          adjacent(z).flatMap((k) => byPosition.get(positionKey(atom.element, i, j, k)) ?? [])
        )
      )
      .filter((candidate) => positionMatches(position, coordinate(candidate), periodic))
    if (candidates.length !== 1)
      return failure(
        candidates.length ? 'RESULT_AMBIGUOUS' : 'RESULT_UNMATCHED',
        'Choose an explicit atom mapping or open the result as an independent structure.',
        { atomId: atom.id }
      )
    matchIds.push(candidates[0].id)
  }
  if (new Set(matchIds).size !== matchIds.length)
    return failure('RESULT_AMBIGUOUS', 'Several result rows match the same source atom.')
  return success(Object.freeze(matchIds))
}
