import { cross, determinant, dot, invertMatrix, isFiniteVector, multiplyMatrixVector, norm } from './math'
import { failure, failureFrom, success } from './result'
import type { Cell, CellParameters, Diagnostic, Matrix3, ScientificResult, Vec3 } from './types'

export function validateCell(cell: Cell): readonly Diagnostic[] {
  if (!cell || !Array.isArray(cell.basis) || cell.basis.length !== 3 || !cell.basis.every(isFiniteVector)) {
    return [{ severity: 'error', code: 'CELL_BASIS', message: 'Cell basis must contain three finite column vectors.' }]
  }
  const lengths = cell.basis.map(norm)
  const volume = determinant(cell.basis)
  const normalizedVolume = volume / (lengths[0] * lengths[1] * lengths[2])
  if (lengths.some((n) => !(n > 0)) || !Number.isFinite(volume) || !(volume > 0) || !(normalizedVolume > 1e-10) || !invertMatrix(cell.basis)) {
    return [{ severity: 'error', code: 'CELL_DEGENERATE', message: 'Cell must be finite, right-handed and non-degenerate.' }]
  }
  for (const [field, measurement] of Object.entries(cell.parameterUncertainties ?? {})) {
    if (!['a','b','c','alpha','beta','gamma'].includes(field) || !measurement || !Number.isFinite(measurement.standardUncertainty) || measurement.standardUncertainty < 0) {
      return [{ severity: 'error', code: 'CELL_UNCERTAINTY', message: 'Invalid cell parameter uncertainty.', context: { field } }]
    }
  }
  return []
}

export function createCell(input: CellParameters | Cell): ScientificResult<Cell> {
  let cell: Cell
  if (!input || typeof input !== 'object') return failure('CELL_INPUT', 'Cell input is required.')
  if ('basis' in input) {
    cell = input
  } else {
    const { a, b, c, alpha, beta, gamma } = input
    if (![a, b, c, alpha, beta, gamma].every(Number.isFinite) || [a,b,c].some((v) => v <= 0) || [alpha,beta,gamma].some((v) => v <= 0 || v >= 180)) {
      return failure('CELL_PARAMETERS', 'Cell lengths must be positive and angles must be in (0, 180) degrees.')
    }
    const radians = Math.PI / 180
    const ca = Math.cos(alpha * radians), cb = Math.cos(beta * radians), cg = Math.cos(gamma * radians), sg = Math.sin(gamma * radians)
    const cx = c * cb
    const cy = c * (ca - cb * cg) / sg
    const czSquared = c * c - cx * cx - cy * cy
    if (!(czSquared > 0)) return failure('CELL_DEGENERATE', 'Cell angles do not define a positive volume.')
    cell = { basis: [[a, 0, 0], [b * cg, b * sg, 0], [cx, cy, Math.sqrt(czSquared)]] }
  }
  const diagnostics = validateCell(cell)
  if (diagnostics.length) return failureFrom(diagnostics)
  // Copy every nested field: consumers never share mutable input buffers with core.
  return success(JSON.parse(JSON.stringify(cell)) as Cell)
}

export function cellVolume(cell: Cell): ScientificResult<number> {
  const errors = validateCell(cell)
  return errors.length ? failureFrom(errors) : success(determinant(cell.basis))
}

export function cellParameters(cell: Cell): ScientificResult<CellParameters> {
  const errors = validateCell(cell)
  if (errors.length) return failureFrom(errors)
  const [a, b, c] = cell.basis.map(norm)
  const angle = (u: Vec3, v: Vec3) => Math.atan2(norm(cross(u, v)), dot(u, v)) * 180 / Math.PI
  return success({ a, b, c, alpha: angle(cell.basis[1],cell.basis[2]), beta: angle(cell.basis[0],cell.basis[2]), gamma: angle(cell.basis[0],cell.basis[1]) })
}

function transform(cell: Cell, position: Vec3, inverse: boolean): ScientificResult<Vec3> {
  const errors = validateCell(cell)
  if (errors.length) return failureFrom(errors)
  if (!isFiniteVector(position)) return failure('COORDINATE_NONFINITE', 'Coordinate must contain three finite numbers.')
  const matrix = inverse ? invertMatrix(cell.basis)! : cell.basis
  const result = multiplyMatrixVector(matrix, position)
  return isFiniteVector(result) ? success(result) : failure('COORDINATE_OVERFLOW', 'Coordinate conversion overflowed.')
}
export const fractionalToCartesian = (cell: Cell, position: Vec3): ScientificResult<Vec3> => transform(cell, position, false)
export const cartesianToFractional = (cell: Cell, position: Vec3): ScientificResult<Vec3> => transform(cell, position, true)
export type { Matrix3 }
