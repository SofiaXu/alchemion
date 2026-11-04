import { isIntegerVector, transpose } from './math'
import { failure, success } from './result'
import type { Matrix3, ScientificResult, Vec3 } from './types'

type Integer3 = readonly [bigint, bigint, bigint]
const integer = ([a, b, c]: Vec3): Integer3 => [BigInt(a), BigInt(b), BigInt(c)]
const cross = ([a, b, c]: Integer3, [x, y, z]: Integer3): Integer3 => [
  b * z - c * y,
  c * x - a * z,
  a * y - b * x
]
const dot = ([a, b, c]: Integer3, [x, y, z]: Integer3) => a * x + b * y + c * z
const vector = (input: Integer3): Vec3 | undefined => {
  const output: Vec3 = [Number(input[0]), Number(input[1]), Number(input[2])]
  return isIntegerVector(output) ? output : undefined
}

export interface IntegerCellTransform {
  readonly inverse: Matrix3
  readonly index: number
  key(position: Vec3): string
  representatives(): readonly Vec3[] | undefined
  fractionalRepresentative(position: Vec3): Vec3
  decompose(position: Vec3, representative: Vec3): Vec3 | undefined
  translateBack(position: Vec3, newCellOffset: Vec3): Vec3 | undefined
}

/** Exact quotient arithmetic for the sublattice M Z³. */
export function integerCellTransform(
  matrix: Matrix3,
  maxIndex: number
): ScientificResult<IntegerCellTransform> {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 3 ||
    ![0, 1, 2].every((axis) => {
      const column = matrix[axis]
      return isIntegerVector(column) && [0, 1, 2].every((row) => Number.isSafeInteger(column[row]))
    })
  )
    return failure('SUPERCELL_MATRIX', 'Cell transforms require three safe integer columns.')
  const [a, b, c] = matrix.map(integer)
  const rows = [cross(b, c), cross(c, a), cross(a, b)] as const
  const det = dot(a, rows[0])
  if (det <= 0n) return failure('SUPERCELL_MATRIX', 'The matrix determinant must be positive.')
  if (det > BigInt(maxIndex))
    return failure('SUPERCELL_BUDGET', 'The requested supercell exceeds the repeat-cell budget.')
  const mod = (value: bigint) => ((value % det) + det) % det
  const adjugate = (input: Integer3): Integer3 => [
    dot(rows[0], input),
    dot(rows[1], input),
    dot(rows[2], input)
  ]
  const multiply = (q: Integer3): Integer3 => [
    a[0] * q[0] + b[0] * q[1] + c[0] * q[2],
    a[1] * q[0] + b[1] * q[1] + c[1] * q[2],
    a[2] * q[0] + b[2] * q[1] + c[2] * q[2]
  ]
  const key = (input: Vec3) => adjugate(integer(input)).map(mod).join(',')
  const index = Number(det)
  return success({
    index,
    inverse: transpose(
      rows.map((row) => row.map((entry) => Number(entry) / index)) as unknown as Matrix3
    ),
    key,
    representatives() {
      // The three unit vectors generate all quotient classes; each is queued once.
      const queue: Vec3[] = [[0, 0, 0]]
      const seen = new Set([key(queue[0])])
      for (let cursor = 0; cursor < queue.length && queue.length < index; cursor++) {
        const [x, y, z] = queue[cursor]
        for (const next of [
          [x + 1, y, z],
          [x, y + 1, z],
          [x, y, z + 1]
        ] as const) {
          const residue = key(next)
          if (seen.has(residue)) continue
          seen.add(residue)
          queue.push(next)
        }
      }
      const normalized: Vec3[] = []
      for (const position of queue) {
        const [x, y, z] = integer(position)
        const [u, v, w] = adjugate([x, y, z])
        const floor = (value: bigint) => (value - mod(value)) / det
        const [i, j, k] = multiply([floor(u), floor(v), floor(w)])
        const representative = vector([x - i, y - j, z - k])
        if (!representative) return undefined
        normalized.push(representative)
      }
      return normalized.sort(
        (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
      )
    },
    fractionalRepresentative(position) {
      const [x, y, z] = adjugate(integer(position)).map(mod)
      return [Number(x) / index, Number(y) / index, Number(z) / index]
    },
    decompose(position, representative) {
      const [x, y, z] = integer(position)
      const [i, j, k] = integer(representative)
      const numerators = adjugate([x - i, y - j, z - k])
      if (numerators.some((value) => value % det !== 0n)) return undefined
      return vector([numerators[0] / det, numerators[1] / det, numerators[2] / det])
    },
    translateBack(position, newCellOffset) {
      const [x, y, z] = integer(position)
      const [i, j, k] = multiply(integer(newCellOffset))
      return vector([x - i, y - j, z - k])
    }
  })
}
