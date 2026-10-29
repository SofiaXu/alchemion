import { describe, expect, test } from 'vitest'
import {
  cartesianToFractional,
  cellParameters,
  cellVolume,
  checkReportedCellVolume,
  createCell,
  fractionalToCartesian
} from '../cell'
import type { Matrix3, ScientificResult, Vec3 } from '../types'
import reference from './fixtures/scientific-reference.json'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
function close(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    1e-9 + 1e-10 * Math.max(Math.abs(actual), Math.abs(expected))
  )
}
function vector(actual: Vec3, expected: readonly number[]) {
  actual.forEach((n, i) => close(n, expected[i]))
}

describe('T-DOM-01 independent cell references', () => {
  for (const fixture of reference.cellCases) {
    test(fixture.name, () => {
      const cell = value(createCell({ basis: fixture.basis as unknown as Matrix3 }))
      close(value(cellVolume(cell)), fixture.volume)
      const parameters = value(cellParameters(cell))
      for (const key of ['a', 'b', 'c', 'alpha', 'beta', 'gamma'] as const)
        close(parameters[key], fixture.parameters[key])
      vector(
        value(fractionalToCartesian(cell, fixture.fractional as unknown as Vec3)),
        fixture.cartesian
      )
      const inversePosition = value(
        cartesianToFractional(cell, fixture.cartesian as unknown as Vec3)
      )
      vector(inversePosition, fixture.fractional)
      const scale = Math.max(parameters.a, parameters.b, parameters.c)
      value(fractionalToCartesian(cell, inversePosition)).forEach((n, i) =>
        close(n / scale, fixture.cartesian[i] / scale)
      )
      // Parameter reconstruction fixes the conventional orientation, not a rotated input basis.
      const conventional = value(createCell(fixture.parameters))
      close(value(cellVolume(conventional)), fixture.volume)
      const recovered = value(cellParameters(conventional))
      for (const key of ['a', 'b', 'c', 'alpha', 'beta', 'gamma'] as const)
        close(recovered[key], fixture.parameters[key])
    })
  }
  test('degrees, caller isolation and reported volume cannot alter the transform', () => {
    const basis: [[number, number, number], [number, number, number], [number, number, number]] = [
      [2, 0, 0],
      [0, 3, 0],
      [0, 0, 4]
    ]
    const cell = value(createCell({ basis }))
    basis[0][0] = 99
    vector(value(fractionalToCartesian(cell, [0.5, 0.5, 0.5])), [1, 1.5, 2])
    const mismatched = checkReportedCellVolume(cell, 200)
    expect(mismatched.ok && mismatched.value).toBe(24)
    expect(mismatched.diagnostics[0]?.code).toBe('CELL_VOLUME_MISMATCH')
    expect(checkReportedCellVolume(cell, 24.01, 0.02).diagnostics).toEqual([])
    vector(value(fractionalToCartesian(cell, [0.5, 0.5, 0.5])), [1, 1.5, 2])
    const degrees = value(createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 60 }))
    close(degrees.basis[1][0], 1.5)
    close(degrees.basis[1][1], (3 * Math.sqrt(3)) / 2)
  })
  test('invalid lengths, angles, handedness, degeneracy and non-finite values fail explicitly', () => {
    const valid = { a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 }
    for (const invalid of [
      { ...valid, a: 0 },
      { ...valid, b: -1 },
      { ...valid, alpha: 180 },
      { ...valid, gamma: 0 },
      { ...valid, alpha: 10, beta: 10, gamma: 170 },
      { ...valid, c: NaN }
    ])
      expect(createCell(invalid).ok).toBe(false)
    for (const basis of [
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, -1]
      ],
      [
        [1, 0, 0],
        [1, 1e-12, 0],
        [0, 0, 1]
      ],
      [
        [1, 0, 0],
        [0, 0, 0],
        [0, 0, 1]
      ]
    ] as Matrix3[])
      expect(createCell({ basis }).ok).toBe(false)
    const cell = value(createCell(valid))
    expect(fractionalToCartesian(cell, [Infinity, 0, 0]).ok).toBe(false)
    expect(checkReportedCellVolume(cell, 0).ok).toBe(false)
  })
})
