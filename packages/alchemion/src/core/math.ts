import type { Matrix3, Vec3 } from './types'

export const IDENTITY_MATRIX: Matrix3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const norm = (a: Vec3): number => Math.hypot(...a)
export const determinant = (a: Matrix3): number => dot(a[0], cross(a[1], a[2]))
export const transpose = (a: Matrix3): Matrix3 => [[a[0][0], a[1][0], a[2][0]], [a[0][1], a[1][1], a[2][1]], [a[0][2], a[1][2], a[2][2]]]
export const multiplyMatrixVector = (a: Matrix3, v: Vec3): Vec3 => add(add(scale(a[0], v[0]), scale(a[1], v[1])), scale(a[2], v[2]))
export const multiplyMatrices = (a: Matrix3, b: Matrix3): Matrix3 => [multiplyMatrixVector(a, b[0]), multiplyMatrixVector(a, b[1]), multiplyMatrixVector(a, b[2])]
export function invertMatrix(a: Matrix3): Matrix3 | undefined {
  const det = determinant(a)
  if (!Number.isFinite(det) || det === 0) return undefined
  const inverse = transpose([scale(cross(a[1], a[2]), 1 / det), scale(cross(a[2], a[0]), 1 / det), scale(cross(a[0], a[1]), 1 / det)])
  return inverse.every(isFiniteVector) ? inverse : undefined
}
export function isFiniteVector(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n))
}
export const isIntegerVector = (value: unknown): value is Vec3 => isFiniteVector(value) && value.every(Number.isSafeInteger)
export const nearlyEqual = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 + 1e-10 * Math.max(Math.abs(a), Math.abs(b))
