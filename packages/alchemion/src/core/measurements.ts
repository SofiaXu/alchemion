import { cross, dot, isFiniteVector, norm, scale, subtract } from './math'
import { failure, success } from './result'
import type { ScientificResult, Vec3 } from './types'

export interface Measurement {
  readonly value: number
  readonly unit: 'angstrom' | 'degree'
}

const invalidPoint = () =>
  failure('MEASUREMENT_COORDINATE', 'Measurement points must be finite Å Cartesian coordinates.')
const undefinedAngle = () =>
  failure('MEASUREMENT_UNDEFINED', 'The selected points do not define this angle.')

/** Uses the selected displayed positions, without applying a minimum-image convention. */
export function measureDistance(a: Vec3, b: Vec3): ScientificResult<Measurement> {
  if (![a, b].every(isFiniteVector)) return invalidPoint()
  const value = norm(subtract(b, a))
  return Number.isFinite(value)
    ? success({ value, unit: 'angstrom' })
    : failure('MEASUREMENT_OVERFLOW', 'Distance overflowed.')
}

export function measureAngle(a: Vec3, b: Vec3, c: Vec3): ScientificResult<Measurement> {
  if (![a, b, c].every(isFiniteVector)) return invalidPoint()
  const ba = subtract(a, b),
    bc = subtract(c, b)
  const l1 = norm(ba),
    l2 = norm(bc)
  if (!Number.isFinite(l1) || !Number.isFinite(l2))
    return failure('MEASUREMENT_OVERFLOW', 'Angle vectors overflowed.')
  if (l1 <= 1e-9 || l2 <= 1e-9) return undefinedAngle()
  const u = scale(ba, 1 / l1),
    v = scale(bc, 1 / l2)
  const value = (Math.atan2(norm(cross(u, v)), dot(u, v)) * 180) / Math.PI
  return success({ value, unit: 'degree' })
}

/** A-B-C-D, atan2((n1×n2)·unit(C-B), n1·n2), in (-180°, 180°]. */
export function measureTorsion(a: Vec3, b: Vec3, c: Vec3, d: Vec3): ScientificResult<Measurement> {
  if (![a, b, c, d].every(isFiniteVector)) return invalidPoint()
  const edges = [subtract(b, a), subtract(c, b), subtract(d, c)]
  const lengths = edges.map(norm)
  if (lengths.some((length) => !Number.isFinite(length)))
    return failure('MEASUREMENT_OVERFLOW', 'Torsion vectors overflowed.')
  if (lengths.some((length) => length <= 1e-9)) return undefinedAngle()
  const [u, v, w] = edges.map((edge, i) => scale(edge, 1 / lengths[i]))
  const n1 = cross(u, v),
    n2 = cross(v, w)
  const l1 = norm(n1),
    l2 = norm(n2)
  if (l1 <= 1e-12 || l2 <= 1e-12) return undefinedAngle()
  const p = scale(n1, 1 / l1),
    q = scale(n2, 1 / l2)
  let value = (Math.atan2(dot(cross(p, q), v), dot(p, q)) * 180) / Math.PI
  if (value <= -180) value = 180
  if (Object.is(value, -0)) value = 0
  return success({ value, unit: 'degree' })
}
