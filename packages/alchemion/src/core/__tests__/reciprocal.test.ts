import { describe, expect, it } from 'vitest'
import { computeBrillouinZone } from '../brillouin-zone'
import { reciprocalLattice, reciprocalPoint } from '../reciprocal'
import type { Cell, Matrix3, ScientificResult } from '../types'
import reference from './fixtures/scientific-reference.json'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const equal = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    1e-9 + 1e-10 * Math.max(Math.abs(actual), Math.abs(expected))
  )
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, entry, i) => sum + entry * b[i], 0)
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const subtract = (a: readonly number[], b: readonly number[]) => a.map((entry, i) => entry - b[i])

describe('T-DOM-05 reciprocal lattice and independently referenced first BZ', () => {
  it.each(reference.cellCases)('satisfies AᵀB=2πI for $name', (fixture) => {
    const cell: Cell = { basis: fixture.basis as unknown as Matrix3 }
    const reciprocal = value(reciprocalLattice(cell))
    expect(reciprocal.unit).toBe('angstrom^-1')
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        equal(dot(cell.basis[i], reciprocal.basis[j]), i === j ? 2 * Math.PI : 0)
    const point = value(reciprocalPoint(cell, [1, -2, 0.5]))
    for (let axis = 0; axis < 3; axis++)
      equal(
        point[axis],
        reciprocal.basis[0][axis] - 2 * reciprocal.basis[1][axis] + 0.5 * reciprocal.basis[2][axis]
      )
  })

  it.each(reference.bzCases)('matches independent SciPy/Qhull geometry for $name', (fixture) => {
    const cell: Cell = { basis: fixture.basis as unknown as Matrix3 }
    const original = JSON.stringify(cell)
    const result = value(computeBrillouinZone(cell))
    expect(JSON.stringify(cell)).toBe(original)
    expect(result.unit).toBe('angstrom^-1')
    expect(result.volumeUnit).toBe('angstrom^-3')
    expect(result.vertices).toHaveLength(fixture.vertices.length)
    expect(result.faces).toHaveLength(fixture.faces.length)
    equal(result.volume, fixture.volume)
    for (const expected of fixture.vertices) {
      expect(
        result.vertices.some((actual) =>
          actual.every(
            (entry, axis) =>
              Math.abs(entry - expected[axis]) <=
              1e-9 + 1e-10 * Math.max(Math.abs(entry), Math.abs(expected[axis]))
          )
        )
      ).toBe(true)
    }
    const edges = new Map<string, number>()
    for (const face of result.faces) {
      expect(face.vertices.length).toBeGreaterThanOrEqual(3)
      const points = face.vertices.map((index) => result.vertices[index])
      const normal = cross(subtract(points[1], points[0]), subtract(points[2], points[0]))
      expect(dot(normal, face.normal)).toBeGreaterThan(0)
      for (const point of result.vertices)
        expect(dot(point, face.normal) - face.offset).toBeLessThanOrEqual(
          1e-9 + 1e-10 * Math.abs(face.offset)
        )
      for (let i = 0; i < face.vertices.length; i++) {
        const a = face.vertices[i],
          b = face.vertices[(i + 1) % face.vertices.length]
        const key = [Math.min(a, b), Math.max(a, b)].join(',')
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true)
    expect(result.vertices.length - edges.size + result.faces.length).toBe(2)
    for (const point of result.vertices)
      expect(
        result.vertices.some((other) =>
          other.every((entry, axis) => Math.abs(entry + point[axis]) <= 1e-8)
        )
      ).toBe(true)
    expect(result.convergence.omittedVectorLowerBound).toBeGreaterThan(
      2 * result.convergence.maxVertexRadius
    )
    expect(fixture.certificate.omittedVectorLowerBound).toBeGreaterThan(
      2 * fixture.certificate.maxVertexRadius
    )
    if (fixture.name === 'cubic') {
      expect(result.vertices).toHaveLength(8)
      expect(result.faces).toHaveLength(6)
      expect(result.triangles).toHaveLength(12)
      for (const point of result.vertices)
        for (const coordinate of point) equal(Math.abs(coordinate), Math.PI / 2)
      equal(result.volume, Math.PI ** 3)
    }
    if (fixture.name === 'multi-shell') {
      expect(result.convergence.shell).toBeGreaterThan(1)
      expect(
        result.faces.some((face) =>
          face.reciprocalIndex.some((coordinate) => Math.abs(coordinate) > 1)
        )
      ).toBe(true)
    }
  })

  it('rejects unproved finite enumeration and candidate-budget exhaustion', () => {
    const cell: Cell = {
      basis: [
        [1, 0, 0],
        [2.2, 0.5, 0],
        [0, 0, 1]
      ]
    }
    for (const options of [{ maxShell: 1 }, { maxCandidates: 10 }]) {
      const result = computeBrillouinZone(cell, options)
      expect(result.ok).toBe(false)
      expect(result.diagnostics[0].code).toBe('BZ_BUDGET')
      expect('value' in result).toBe(false)
    }
  })

  it('reports invalid inputs rather than a partial or nonfinite BZ', () => {
    expect(
      computeBrillouinZone({
        basis: [
          [0, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ]
      }).ok
    ).toBe(false)
    expect(
      computeBrillouinZone(
        {
          basis: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
          ]
        },
        { maxShell: 0 }
      ).ok
    ).toBe(false)
    expect(
      reciprocalPoint(
        {
          basis: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
          ]
        },
        [NaN, 0, 0]
      ).ok
    ).toBe(false)
    expect(reference.environment.numpy).toBe('2.2.6')
    expect(reference.environment.scipy).toBe('1.15.3')
  })
})
