import { describe, expect, it } from 'vitest'
import { measureAngle, measureDistance, measureTorsion } from '../measurements'
import type { ScientificResult, Vec3 } from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}

describe('T-DOM-04 displayed Cartesian measurements', () => {
  it('measures analytic distance and preserves an actual cross-cell separation', () => {
    expect(value(measureDistance([0, 0, 0], [3, 4, 0]))).toEqual({ value: 5, unit: 'angstrom' })
    expect(value(measureDistance([0, 0, 0], [0, 0, 0])).value).toBe(0)
    expect(value(measureDistance([0.2, 0, 0], [9.2, 0, 0])).value).toBe(9)
  })

  it.each([
    [[2, 0, 0], 0],
    [[0, 2, 0], 90],
    [[-2, 0, 0], 180]
  ] as const)('measures an analytic angle toward %j', (c, expected) => {
    const result = value(measureAngle([1, 0, 0], [0, 0, 0], c))
    expect(result.unit).toBe('degree')
    expect(Math.abs(result.value - expected)).toBeLessThanOrEqual(1e-6)
  })

  it('uses the signed A-B-C-D convention, including mirror and reverse order', () => {
    const a: Vec3 = [0, 0, 0],
      b: Vec3 = [1, 0, 0],
      c: Vec3 = [1, 1, 0]
    const positive: Vec3 = [1, 1, 1],
      negative: Vec3 = [1, 1, -1]
    expect(value(measureTorsion(a, b, c, positive)).value).toBeCloseTo(90, 10)
    expect(value(measureTorsion(a, b, c, negative)).value).toBeCloseTo(-90, 10)
    expect(value(measureTorsion(positive, c, b, a)).value).toBeCloseTo(90, 10)
    expect(value(measureTorsion(a, b, c, [2, 1, 0])).value).toBe(180)
    expect(value(measureTorsion(a, b, c, [0, 1, 0])).value).toBe(0)
  })

  it('returns diagnostics for zero-length/collinear angles and nonfinite input', () => {
    const results = [
      measureAngle([0, 0, 0], [0, 0, 0], [1, 0, 0]),
      measureAngle([1e-9, 0, 0], [0, 0, 0], [1, 0, 0]),
      measureTorsion([0, 0, 0], [1, 0, 0], [1, 0, 0], [1, 1, 1]),
      measureTorsion([0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]),
      measureTorsion([0, 0, 0], [1, 0, 0], [2, 1e-13, 0], [2, 1, 0])
    ]
    for (const result of results) {
      expect(result.ok).toBe(false)
      expect(result.diagnostics[0].code).toBe('MEASUREMENT_UNDEFINED')
      expect('value' in result).toBe(false)
    }
    expect(measureDistance([NaN, 0, 0], [0, 0, 0]).ok).toBe(false)
    expect(measureAngle([Infinity, 0, 0], [0, 0, 0], [1, 0, 0]).ok).toBe(false)
  })

  it('normalizes finite vectors before cross products to avoid avoidable overflow', () => {
    expect(value(measureAngle([1e150, 0, 0], [0, 0, 0], [0, 1e150, 0])).value).toBe(90)
  })
})
