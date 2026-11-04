import { norm } from './math'
import { failure, success } from './result'
import type { Matrix3, Mobility, ScientificResult } from './types'

export const ALL_MOVABLE: Mobility = Object.freeze([true, true, true] as const)

export function isMobility(value: unknown): value is Mobility {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    [0, 1, 2].every((index) => typeof value[index] === 'boolean')
  )
}

/** Map the allowed displacement subspace through a nonsingular Direct-to-Direct map. */
export function transformMobility(
  movable: Mobility | undefined,
  transform: Matrix3,
  atomId: string
): ScientificResult<Mobility | undefined> {
  if (!movable || movable.every((value) => value === movable[0])) return success(movable)
  const output: [boolean, boolean, boolean] = [false, false, false]
  const activeColumns = transform.filter((_column, index) => movable[index])
  for (const column of activeColumns) {
    const length = norm(column)
    if (!Number.isFinite(length) || length <= 0)
      return failure('MOBILITY_TRANSFORM', 'The displacement transform is degenerate.', { atomId })
    for (let axis = 0; axis < 3; axis++)
      if (Math.abs(column[axis]) / length > 1e-10) output[axis] = true
  }
  return output.filter(Boolean).length === activeColumns.length
    ? success(output)
    : failure('MOBILITY_TRANSFORM', 'The transformed displacement cannot use Direct flags.', {
        atomId
      })
}
