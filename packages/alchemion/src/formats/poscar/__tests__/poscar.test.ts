import { describe, expect, test } from 'vitest'
import type { PeriodicStructureSnapshot, StructureSnapshot } from '../../../core/types'
import { writePoscarStructure } from '..'

const source = (): PeriodicStructureSnapshot => ({
  kind: 'periodic',
  title: 'Authored oblique cell',
  cell: {
    basis: [
      [2, 0, 0],
      [1, 3, 0],
      [0.4, 0.7, 4]
    ]
  },
  atoms: [
    { id: 'o-1', element: 'O', fractional: [1.25, -0.25, 0.5] },
    { id: 'c', element: 'C', fractional: [0.25, 0.5, 0.75] },
    { id: 'o-2', element: 'O', fractional: [0.1, 0.2, 0.3] }
  ],
  bonds: []
})

describe('T-FMT-03 periodic POSCAR and scientific losses', () => {
  test('basis columns become lines and interleaved species are grouped in first-occurrence order', () => {
    const input = source(),
      before = JSON.stringify(input)
    const result = writePoscarStructure(input, { format: 'poscar' })
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false)
    expect(result.text!.trim().split('\n')).toEqual([
      'Authored oblique cell',
      '1.0',
      '2 0 0',
      '1 3 0',
      '0.4 0.7 4',
      'O C',
      '2 1',
      'Direct',
      '1.25 -0.25 0.5',
      '0.1 0.2 0.3',
      '0.25 0.5 0.75'
    ])
    expect(JSON.stringify(input)).toBe(before)
  })
  test('molecules, invalid cells, empty and non-full occupancies are hard failures', () => {
    const cases: StructureSnapshot[] = [
      { kind: 'molecular', atoms: [{ id: 'x', element: 'C', cartesian: [0, 0, 0] }], bonds: [] },
      {
        ...source(),
        cell: {
          basis: [
            [0, 0, 0],
            [0, 3, 0],
            [0, 0, 4]
          ]
        }
      },
      { ...source(), atoms: [] },
      ...[{ kind: 'known', value: 0.5 }, { kind: 'unknown' }, { kind: 'not-applicable' }].map(
        (occupancy) =>
          ({
            ...source(),
            atoms: [{ ...source().atoms[0], occupancy }]
          }) as PeriodicStructureSnapshot
      )
    ]
    for (const input of cases) {
      expect(
        writePoscarStructure(input, { format: 'poscar', allowLoss: true }).text
      ).toBeUndefined()
    }
  })
  test('all unrepresentable explicit fields have individual blocking diagnostics and accepted warnings', () => {
    const original = source()
    const input: PeriodicStructureSnapshot = {
      ...original,
      cell: { ...original.cell, parameterUncertainties: { a: { standardUncertainty: 0.01 } } },
      symmetry: { spaceGroup: { itNumber: 14 } },
      atoms: original.atoms.map((atom, i) =>
        i
          ? atom
          : {
              ...atom,
              label: 'O1',
              isotope: 18,
              formalCharge: -2,
              oxidationState: { kind: 'known', value: -2 },
              radical: 'doublet',
              atomMap: 7,
              displacementU: { kind: 'known', value: 0.01 },
              coordinateUncertainties: {
                frame: 'fractional',
                standardUncertainties: [0.01, 0.01, 0.01]
              }
            }
      ),
      metadata: {
        alchemionFormats: {
          schemaVersion: 1,
          sourceFormat: 'cif',
          version: '2',
          losses: [{ severity: 'warning', code: 'UNMAPPED_SCIENCE', message: 'Unmapped science.' }]
        }
      }
    }
    const rejected = writePoscarStructure(input, { format: 'poscar' }),
      accepted = writePoscarStructure(input, { format: 'poscar', allowLoss: true })
    expect(rejected.text).toBeUndefined()
    for (const code of [
      'POSCAR_SYMMETRY_LOSS',
      'POSCAR_CELL_UNCERTAINTY_LOSS',
      'POSCAR_LABEL_LOSS',
      'POSCAR_ISOTOPE_LOSS',
      'POSCAR_CHARGE_LOSS',
      'POSCAR_OXIDATION_LOSS',
      'POSCAR_RADICAL_LOSS',
      'POSCAR_ATOM_MAP_LOSS',
      'POSCAR_DISPLACEMENT_LOSS',
      'POSCAR_COORDINATE_UNCERTAINTY_LOSS',
      'UNMAPPED_SCIENCE'
    ]) {
      expect(rejected.diagnostics.some((d) => d.code === code && d.severity === 'error')).toBe(true)
      expect(accepted.diagnostics.some((d) => d.code === code && d.severity === 'warning')).toBe(
        true
      )
    }
    expect(accepted.text).toBeDefined()
    // A partial CIF uncertainty has no three-component core coordinateUncertainties value.
    const partialOnly: PeriodicStructureSnapshot = {
      ...source(),
      metadata: {
        alchemionFormats: {
          schemaVersion: 1,
          sourceFormat: 'cif',
          version: '1',
          losses: [],
          sourceMeasurements: {
            atoms: [
              {
                id: 'o-1',
                fractional: [
                  { kind: 'known', value: 1.25, standardUncertainty: 0.01 },
                  { kind: 'known', value: -0.25 },
                  { kind: 'known', value: 0.5 }
                ]
              }
            ]
          }
        }
      }
    }
    const partialRejected = writePoscarStructure(partialOnly, { format: 'poscar' })
    expect(partialRejected.text).toBeUndefined()
    expect(partialRejected.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'FORMAT_SOURCE_MEASUREMENT_LOSS', severity: 'error' })
    )
    expect(
      writePoscarStructure(partialOnly, { format: 'poscar', allowLoss: true }).text
    ).toBeDefined()
  })
  test('ordinary annotation truncation warns without blocking valid scientific output', () => {
    const result = writePoscarStructure(
      { ...source(), title: 'A'.repeat(60) },
      { format: 'poscar' }
    )
    expect(result.text!.split('\n')[0]).toHaveLength(40)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'POSCAR_TITLE_TRUNCATED', severity: 'warning' })
    )
  })
})
