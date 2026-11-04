import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { CALCULATION_LIMITS } from '../../core/calculation'
import type { CalculationData, CalculationResult, ResultFrame } from '../../core/calculation'
import { add, isFiniteVector, norm, scale, subtract } from '../../core/math'
import { fractionalToCartesian } from '../../core/cell'
import {
  compareResultStructures,
  differenceResultGrids,
  foldResultKPoint,
  generateResultFermiSurface,
  generateResultIsosurface,
  generateResultSlice,
  resultModeDisplacement,
  transformResultVector,
  unfoldResultFrames,
  validateResultModeSupercell
} from '../../core/result-geometry'
import type { ResultMesh } from '../../core/result-geometry'
import { failure, success } from '../../core/result'
import { createSupercell } from '../../core/supercell'
import { IDENTITY_OPERATION, resolveSymmetry } from '../../core/symmetry'
import type {
  AtomId,
  AtomInstance,
  ScientificResult,
  StructureSnapshot,
  Vec3
} from '../../core/types'
import { parseCalculationResult } from '../../formats/calculation'
import type { ResultImportOptions, ResultLayerSpec } from './types'

export interface ResultGlyph {
  readonly position: Vec3
  readonly tip?: Vec3
  readonly atomId?: AtomId
  readonly value?: number | Vec3
  readonly label?: string
}
export interface ResultGeometry {
  readonly meshes?: readonly (ResultMesh & {
    readonly color?: string
    readonly gradient?: boolean
  })[]
  readonly glyphs?: readonly ResultGlyph[]
  readonly reciprocal?: boolean
  readonly quantity: string
  readonly unit: string
  readonly summary?: string
}
export type ResultTask =
  | {
      readonly kind: 'result-import'
      readonly file: File | string
      readonly options: ResultImportOptions
    }
  | {
      readonly kind: 'result-layer'
      readonly spec: ResultLayerSpec
      readonly frame: ResultFrame
      readonly data?: CalculationData
      readonly colorData?: CalculationData
      readonly subtractData?: CalculationData
      readonly target?: ResultFrame
      readonly atomIds: readonly AtomId[]
      readonly instances: readonly AtomInstance[]
      readonly source: StructureSnapshot
      readonly selected: readonly AtomId[]
    }
  | { readonly kind: 'result-unfold'; readonly frames: readonly ResultFrame[] }
export type ResultTaskValue = CalculationResult | ResultGeometry | readonly ResultFrame[]

function position(structure: StructureSnapshot, index: number): Vec3 {
  if (structure.kind === 'molecular') return structure.atoms[index].cartesian
  const point = fractionalToCartesian(structure.cell, structure.atoms[index].fractional)
  if (!point.ok) throw new Error(point.diagnostics[0].message)
  return point.value
}

function atomic(
  task: Extract<ResultTask, { kind: 'result-layer' }>
): ScientificResult<ResultGeometry> {
  const { data, spec, instances, atomIds, frame, source, selected } = task
  if (data?.kind !== 'atomic') return failure('RESULT_ATOMIC', 'Choose an atomic dataset.')
  const rows = new Map(atomIds.map((id, index) => [id, index]))
  const selection = new Set(selected)
  const operations =
    source.kind === 'periodic' ? resolveSymmetry(source.symmetry, source.cell) : undefined
  const rotations = new Map(
    operations?.ok ? operations.value.map((op) => [op.id, op.rotation]) : []
  )
  const glyphs: ResultGlyph[] = []
  for (const instance of instances) {
    const row = rows.get(instance.sourceAtomId)
    if (
      row === undefined ||
      (spec.selectedOnly && !selection.has(instance.sourceAtomId)) ||
      (spec.elements && !spec.elements.includes(frame.structure.atoms[row].element))
    )
      continue
    let value = data.values[row]
    if (value === null) continue
    if (isFiniteVector(value) && source.kind === 'periodic' && data.vector) {
      const original = value
      const rotation = rotations.get(instance.symmetryOperationId)
      if (!rotation && instance.symmetryOperationId !== IDENTITY_OPERATION.id)
        return failure(
          'RESULT_VECTOR_TRANSFORM',
          'The displayed symmetry transform is unavailable.'
        )
      if (rotation) {
        const transformed = transformResultVector(value, rotation, source.cell, data.vector)
        if (!transformed.ok) return transformed
        value = transformed.value
      }
      for (const equivalent of instance.equivalentSources) {
        if (equivalent.symmetryOperationId === instance.symmetryOperationId) continue
        const equivalentRotation = rotations.get(equivalent.symmetryOperationId)
        if (!equivalentRotation)
          return failure(
            'RESULT_VECTOR_TRANSFORM',
            'An equivalent site has an unavailable symmetry transform.'
          )
        const transformed = transformResultVector(
          original,
          equivalentRotation,
          source.cell,
          data.vector
        )
        if (!transformed.ok) return transformed
        if (norm(subtract(value, transformed.value)) > 1e-8 * Math.max(1, norm(value)))
          return failure(
            'RESULT_VECTOR_AMBIGUOUS',
            'Equivalent operations disagree on the vector at a special position.',
            {
              atomId: instance.sourceAtomId
            }
          )
      }
    }
    const tip =
      spec.arrows !== false && isFiniteVector(value)
        ? add(instance.cartesian, scale(value, spec.scale ?? 1))
        : undefined
    glyphs.push({
      position: instance.cartesian,
      atomId: instance.sourceAtomId,
      value,
      tip,
      label: spec.labels
        ? `${typeof value === 'number' ? value.toPrecision(4) : norm(value).toPrecision(4)} ${data.unit}`
        : undefined
    })
    if (glyphs.length > 10_000)
      return failure('RESULT_BUDGET', 'The layer exceeds 10,000 atomic glyphs.')
  }
  return success({
    glyphs,
    quantity: data.quantity,
    unit: data.unit,
    summary: data.vector ? `1 ${data.unit} → ${spec.scale ?? 1} Å` : undefined
  })
}

async function geometry(
  task: Extract<ResultTask, { kind: 'result-layer' }>,
  checkpoint: () => Promise<void>
): Promise<ScientificResult<ResultGeometry>> {
  const { frame, data, target, spec } = task
  if (spec.kind === 'atomic') return atomic(task)
  if (spec.kind === 'comparison') {
    if (!target) return failure('RESULT_COMPARE_TARGET', 'Select the target comparison frame.')
    const compared = compareResultStructures(frame.structure, target.structure, {
      pairs: spec.pairs,
      fit: spec.fit,
      removeCellDeformation: spec.removeCellDeformation
    })
    if (!compared.ok) return compared
    const { rmsd, atoms, cell, unmatchedReference, unmatchedTarget } = compared.value
    const summary = [
      `RMSD ${rmsd.toPrecision(5)} Å`,
      `${atoms.length} ↔ ${unmatchedReference.length}/${unmatchedTarget.length} unmatched`,
      ...(cell
        ? [
            `ΔV ${cell.volumeDelta.toPrecision(5)} Å³`,
            `Δa,b,c: ${cell.basisDelta.map((axis) => axis.map((value) => value.toPrecision(3)).join(',')).join(' / ')} Å`,
            `Δα,β,γ: ${(['alpha', 'beta', 'gamma'] as const).map((axis) => (cell.target[axis] - cell.reference[axis]).toPrecision(4)).join(', ')}°`
          ]
        : [])
    ].join(' · ')
    const byId = new Map(frame.structure.atoms.map((atom, index) => [atom.id, task.atomIds[index]]))
    const matched = new Map(atoms.map((atom) => [atom.targetId, atom]))
    return success(
      {
        quantity: 'displacement',
        unit: 'Å',
        summary,
        glyphs: compared.value.targetPositions.map(({ id, position }) => {
          const atom = matched.get(id)
          return {
            position,
            tip: atom?.from,
            atomId: atom ? byId.get(atom.referenceId) : undefined,
            value: atom?.displacement,
            label: spec.labels && atom ? `${norm(atom.displacement).toPrecision(4)} Å` : undefined
          }
        })
      },
      compared.diagnostics
    )
  }
  if (spec.kind === 'vibration') {
    if (data?.kind !== 'vibration') return failure('RESULT_MODE', 'Choose a vibration dataset.')
    const mode =
      spec.modeId === undefined ? data.modes[0] : data.modes.find((item) => item.id === spec.modeId)
    if (!mode) return failure('RESULT_MODE', 'The selected mode is unavailable.')
    const repetitions = spec.supercell ?? [1, 1, 1]
    const matrix = [
      [repetitions[0], 0, 0],
      [0, repetitions[1], 0],
      [0, 0, repetitions[2]]
    ] as const
    const compatible = validateResultModeSupercell(mode, matrix)
    if (!compatible.ok) return compatible
    const glyphs: ResultGlyph[] = []
    const structure = frame.structure
    if (repetitions.reduce((a, b) => a * b, 1) * structure.atoms.length > 10_000)
      return failure('RESULT_BUDGET', 'The mode exceeds 10,000 displayed atoms.')
    const indexById = new Map(structure.atoms.map((atom, index) => [atom.id, index]))
    if (structure.kind === 'molecular' && repetitions.some((value) => value !== 1))
      return failure('RESULT_MODE_SUPERCELL', 'A molecular mode has no periodic replicas.')
    const copies =
      structure.kind === 'periodic' && repetitions.some((value) => value !== 1)
        ? createSupercell(structure, repetitions)
        : undefined
    if (copies && !copies.ok) return copies
    const atoms = copies?.value.snapshot ?? structure
    for (let index = 0; index < atoms.atoms.length; index++) {
      const source = copies?.value.atomMapping[index].source
      const row = source ? indexById.get(source.sourceAtomId)! : index
      const displacement = resultModeDisplacement(
        mode,
        row,
        source?.integerCellOffset ?? [0, 0, 0],
        spec.phase ?? 0,
        spec.scale ?? 1
      )
      if (!displacement.ok) return displacement
      const origin = position(atoms, index)
      glyphs.push({
        position: add(origin, displacement.value),
        tip: spec.arrows !== false ? origin : undefined,
        atomId: task.atomIds[row],
        value: displacement.value
      })
    }
    return success({
      glyphs,
      quantity: 'mode displacement',
      unit: 'Å',
      summary: `${mode.frequencyThz} THz${mode.imaginary ? ' i · illustrative phase' : ''}`
    })
  }
  if (spec.kind === 'k-point') {
    if (frame.structure.kind !== 'periodic' || data?.kind !== 'bands')
      return failure('RESULT_K_POINT', 'A periodic band dataset is required.')
    const point = data.points[spec.kIndex ?? 0]
    if (!point) return failure('RESULT_K_POINT', 'The band k point is unavailable.')
    const folded = foldResultKPoint(frame.structure.cell, point.fractional)
    if (!folded.ok) return folded
    return success({
      glyphs: [{ position: folded.value, label: point.label, value: point.fractional }],
      reciprocal: true,
      quantity: 'k',
      unit: 'reciprocal fractional'
    })
  }
  if (spec.kind === 'fermi') {
    if (frame.structure.kind !== 'periodic' || data?.kind !== 'fermi-grid')
      return failure(
        'RESULT_FERMI_GRID',
        'A complete periodic three-dimensional k grid is required.'
      )
    const mesh = await generateResultFermiSurface(
      data.grid,
      frame.structure.cell,
      data.fermi.value,
      { checkpoint }
    )
    return mesh.ok
      ? success(
          {
            meshes: [mesh.value],
            reciprocal: true,
            quantity: data.quantity,
            unit: data.unit,
            summary: `E_F = ${data.fermi.value} ${data.unit} · ${data.fermi.source}`
          },
          mesh.diagnostics
        )
      : mesh
  }
  if (data?.kind !== 'grid') return failure('RESULT_GRID', 'Choose a real-space grid dataset.')
  const { colorData, subtractData } = task
  if (spec.colorDatasetId && (colorData?.kind !== 'grid' || colorData.frameId !== data.frameId))
    return failure(
      'RESULT_GRID_COLOR',
      'The color field must be a grid on the same registered frame.'
    )
  if (
    spec.subtractDatasetId &&
    (subtractData?.kind !== 'grid' ||
      subtractData.frameId !== data.frameId ||
      subtractData.unit !== data.unit ||
      subtractData.quantity !== data.quantity)
  )
    return failure(
      'RESULT_GRID_DIFFERENCE',
      'The fields must share a registered frame, quantity and unit.'
    )
  let grid = data.grid
  if (subtractData?.kind === 'grid') {
    const difference = await differenceResultGrids(grid, subtractData.grid, {
      resample: spec.resample,
      checkpoint
    })
    if (!difference.ok) return difference
    grid = difference.value
  }
  const meshes: NonNullable<ResultGeometry['meshes']>[number][] = []
  const options = {
    checkpoint,
    tiles: spec.tiles,
    colorGrid: colorData?.kind === 'grid' ? colorData.grid : undefined
  }
  if (spec.kind === 'slice') {
    const mesh = await generateResultSlice(grid, spec.plane!, options)
    if (!mesh.ok) return mesh
    meshes.push({ ...mesh.value, color: spec.color, gradient: true })
  } else {
    let remaining: number = CALCULATION_LIMITS.triangles
    for (const [threshold, color] of [
      [spec.threshold, spec.color],
      [spec.negativeThreshold, spec.negativeColor ?? '#d04768']
    ] as const) {
      if (threshold === undefined) continue
      if (!remaining)
        return failure('RESULT_BUDGET', 'The combined surface exceeds the triangle budget.')
      const mesh = await generateResultIsosurface(grid, threshold, {
        ...options,
        maxTriangles: remaining
      })
      if (!mesh.ok) return mesh
      remaining -= mesh.value.positions.length / 9
      meshes.push({ ...mesh.value, color, gradient: !!options.colorGrid })
    }
  }
  return success({
    meshes,
    quantity: colorData?.quantity ?? data.quantity,
    unit: colorData?.unit ?? data.unit
  })
}

export async function runResultTask(
  task: ResultTask,
  checkpoint: () => Promise<void>
): Promise<ScientificResult<ResultTaskValue>> {
  if (task.kind === 'result-layer') return geometry(task, checkpoint)
  if (task.kind === 'result-unfold') return unfoldResultFrames(task.frames, checkpoint)
  if (typeof task.file === 'string') {
    // Every UTF-16 code unit uses at least one byte in UTF-8.
    if (task.file.length > CALCULATION_LIMITS.fileBytes)
      return failure('RESULT_BUDGET', 'The result file exceeds the byte budget.')
    await checkpoint()
    return parseCalculationResult(task.file, task.options)
  }
  if (task.file.size > CALCULATION_LIMITS.fileBytes)
    return failure('RESULT_BUDGET', 'The result file exceeds the byte budget.', {
      field: task.file.name
    })
  const digest = sha256.create()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const chunks: string[] = []
  for (let start = 0; start < task.file.size; start += 256 * 1024) {
    const bytes = new Uint8Array(await task.file.slice(start, start + 256 * 1024).arrayBuffer())
    digest.update(bytes)
    chunks.push(decoder.decode(bytes, { stream: true }))
    await checkpoint()
  }
  chunks.push(decoder.decode())
  return parseCalculationResult(chunks.join(''), {
    ...task.options,
    name: task.options.name ?? task.file.name,
    sha256: bytesToHex(digest.digest())
  })
}
