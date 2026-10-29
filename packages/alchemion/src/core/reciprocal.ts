import { validateCell } from './cell'
import { invertMatrix, isFiniteVector, multiplyMatrixVector, scale, transpose } from './math'
import { failure, failureFrom, success } from './result'
import type { Cell, Matrix3, ScientificResult, Vec3 } from './types'

export interface ReciprocalLattice {
  readonly basis: Matrix3
  readonly unit: 'angstrom^-1'
}

/** B = 2π(A⁻¹)ᵀ; both matrices store columns. */
export function reciprocalLattice(cell: Cell): ScientificResult<ReciprocalLattice> {
  const errors = validateCell(cell)
  if (errors.length) return failureFrom(errors)
  const inverseTranspose = transpose(invertMatrix(cell.basis)!)
  const basis: Matrix3 = [
    scale(inverseTranspose[0], 2 * Math.PI),
    scale(inverseTranspose[1], 2 * Math.PI),
    scale(inverseTranspose[2], 2 * Math.PI)
  ]
  if (!basis.every(isFiniteVector))
    return failure('RECIPROCAL_OVERFLOW', 'Reciprocal basis overflowed.')
  return success({ basis, unit: 'angstrom^-1' })
}

export function reciprocalPoint(cell: Cell, h: Vec3): ScientificResult<Vec3> {
  if (!isFiniteVector(h))
    return failure('RECIPROCAL_COORDINATE', 'Reciprocal coordinates must be finite.')
  const lattice = reciprocalLattice(cell)
  if (!lattice.ok) return lattice
  const point = multiplyMatrixVector(lattice.value.basis, h)
  return isFiniteVector(point)
    ? success(point)
    : failure('RECIPROCAL_OVERFLOW', 'Reciprocal point overflowed.')
}
