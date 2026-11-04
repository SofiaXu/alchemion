import { describe, expect, it } from 'vitest'
import { deriveStructure } from '../bonds'
import type { ResultFrame, VibrationMode } from '../calculation'
import {
  closestResultImage,
  compareResultStructures,
  foldResultKPoint,
  resultModeDisplacement,
  transformResultVector,
  unfoldResultFrames,
  validateResultModeSupercell
} from '../result-geometry'
import type {
  Cell,
  Matrix3,
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  ScientificResult,
  Vec3
} from '../types'

const value = <T>(result: ScientificResult<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}

const near = (actual: Vec3, expected: Vec3) =>
  actual.forEach((coordinate, axis) => expect(coordinate).toBeCloseTo(expected[axis], 11))

const identity: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
]

function periodic(basis: Matrix3, fractional: Vec3): PeriodicStructureSnapshot {
  return {
    kind: 'periodic',
    cell: { basis },
    atoms: [{ id: 'a', element: 'Si', fractional }],
    bonds: []
  }
}

function molecule(points: readonly Vec3[]): MolecularStructureSnapshot {
  return {
    kind: 'molecular',
    atoms: points.map((cartesian, index) => ({ id: String(index), element: 'C', cartesian })),
    bonds: []
  }
}

describe('calculation results structure and reciprocal geometry', () => {
  it('uses the lattice metric for skew periodic displacement, ambiguity and reciprocal folding', () => {
    const skew: Matrix3 = [
      [1, 0, 0],
      [0.9, 0.3, 0],
      [0, 0, 1]
    ]
    const image = value(closestResultImage(skew, [0.49, 0.49, 0]))
    expect(image.image).toEqual([0, -1, 0])
    near(image.displacement, [0.031, -0.153, 0])
    expect(value(closestResultImage(identity, [0.5, 0, 0])).ambiguous).toBe(true)
    const reciprocalCell: Cell = {
      basis: [
        [2 * Math.PI, -6 * Math.PI, 0],
        [0, (20 * Math.PI) / 3, 0],
        [0, 0, 2 * Math.PI]
      ]
    }
    near(value(foldResultKPoint(reciprocalCell, [0.49, 0.49, 0])), [0.031, -0.153, 0])
  })

  it('reports changing cell parameters and removes homogeneous deformation only on request', () => {
    const before = periodic(
      [
        [10, 0, 0],
        [0, 10, 0],
        [0, 0, 10]
      ],
      [0.1, 0.2, 0.3]
    )
    const after = periodic(
      [
        [20, 0, 0],
        [0, 10, 0],
        [0, 0, 10]
      ],
      [0.1, 0.2, 0.3]
    )
    const compare = value(compareResultStructures(before, after))
    expect(compare.rmsd).toBeCloseTo(1)
    near(compare.atoms[0].displacement, [1, 0, 0])
    expect(compare.cell?.volumeDelta).toBe(1000)
    expect(compare.cell?.target.gamma).toBe(90)
    expect(
      value(compareResultStructures(before, after, { removeCellDeformation: true })).rmsd
    ).toBe(0)
  })

  it('aligns a rotated translated molecule with a proper rotation and detects unmatched sites', () => {
    const sites: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 3]
    ]
    const before = molecule(sites)
    const after = molecule([...sites.map(([x, y, z]): Vec3 => [4 - y, -5 + x, z + 6]), [8, 3, 2]])
    const fit = value(compareResultStructures(before, after, { fit: true }))
    expect(fit.rmsd).toBeCloseTo(0, 12)
    expect(fit.unmatchedTarget).toEqual(['4'])
    near(fit.targetPositions[4].position, [8, -4, -4])
    const reflection = molecule(sites.map(([x, y, z]) => [-x, y, z]))
    expect(value(compareResultStructures(before, reflection, { fit: true })).rmsd).toBeGreaterThan(
      0.1
    )
  })

  it('unfolds a boundary crossing in the current frame cell and rejects changed identities', async () => {
    const frame = (step: number, x: number): ResultFrame => ({
      id: String(step),
      step,
      structure: periodic(
        [
          [step, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ],
        [x, 0, 0]
      )
    })
    const frames = [frame(1, 0.95), frame(2, 0.05), frame(3, 0.12)]
    const unfolded = value(await unfoldResultFrames(frames))
    const source = frames[1].structure as PeriodicStructureSnapshot
    const second = unfolded[1].structure as PeriodicStructureSnapshot
    const third = unfolded[2].structure as PeriodicStructureSnapshot
    near(source.atoms[0].fractional, [0.05, 0, 0])
    near(second.atoms[0].fractional, [1.05, 0, 0])
    near(third.atoms[0].fractional, [1.12, 0, 0])
    expect(second.cell.basis[0][0]).toBe(2)
    const wrapped = value(deriveStructure(second))
    near(wrapped.atoms[0].cartesian, [0.1, 0, 0])
    const continuous = value(deriveStructure(second, { wrapFractional: false }))
    near(continuous.atoms[0].cartesian, [2.1, 0, 0])
    expect(continuous.atoms[0].integerCellOffset).toEqual([0, 0, 0])
    expect(
      deriveStructure(second, { wrapFractional: false, cutoff: { kind: 'bond' } }).diagnostics[0]
        .code
    ).toBe('CONTINUOUS_CUTOFF')
    const incompatible: ResultFrame = {
      id: 'incompatible',
      structure: { ...source, atoms: [{ ...source.atoms[0], id: 'other' }] }
    }
    expect((await unfoldResultFrames([frames[0], incompatible])).diagnostics[0].code).toBe(
      'RESULT_TRAJECTORY_MAPPING'
    )
  })

  it('transforms axial and polar vectors with distinct reflection parity', () => {
    const mirror: Matrix3 = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, -1]
    ]
    const skew: Cell = {
      basis: [
        [1, 0, 0],
        [0.9, 0.3, 0],
        [0, 0, 1]
      ]
    }
    near(value(transformResultVector([1, 2, 3], mirror, skew, 'polar')), [1, 2, -3])
    near(value(transformResultVector([1, 2, 3], mirror, skew, 'axial')), [-1, -2, 3])
  })

  it('uses complex phase and mass for a non-Gamma mode in a commensurate supercell', () => {
    const mode: VibrationMode = {
      id: 'mode',
      q: [0.5, 0, 0],
      frequencyThz: 3,
      imaginary: false,
      real: [[2, 0, 0]],
      imag: [[0, 4, 0]],
      masses: [4]
    }
    expect(validateResultModeSupercell(mode, identity).diagnostics[0].code).toBe(
      'RESULT_MODE_COMMENSURATE'
    )
    expect(
      validateResultModeSupercell(mode, [
        [2, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]).ok
    ).toBe(true)
    near(value(resultModeDisplacement(mode, 0, [0, 0, 0], 0)), [1, 0, 0])
    near(value(resultModeDisplacement(mode, 0, [1, 0, 0], Math.PI / 2, 2)), [0, 4, 0])
  })
})
