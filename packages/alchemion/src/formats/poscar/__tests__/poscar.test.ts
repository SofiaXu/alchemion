import { describe, expect, test } from 'vitest'
import type { PeriodicStructureSnapshot, StructureSnapshot } from '../../../core/types'
import { writePoscarStructure } from '..'
import { parseStructure, writeStructure } from '../..'

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

const poscarInput = (scale = '1', mode = 'Direct', position = '0.25 0.5 0.75') =>
  [
    'Authored POSCAR import',
    scale,
    '2 0 0',
    '1 3 0',
    '0.4 0.7 4',
    'C',
    '1',
    mode,
    position,
    ''
  ].join('\n')

describe('T-FMT-03 POSCAR import', () => {
  test('validates the physical cell after Cartesian component scaling', () => {
    const text = poscarInput('1e-12 1 1').replace(
      '2 0 0\n1 3 0\n0.4 0.7 4',
      '1 0 0\n1 1e-12 0\n0 0 1'
    )
    const result = parseStructure(text, { format: 'poscar' })
    expect(result.structure?.kind).toBe('periodic')
    if (result.structure?.kind !== 'periodic') throw new Error(JSON.stringify(result.diagnostics))
    expect(result.structure.cell.basis).toEqual([
      [1e-12, 0, 0],
      [1e-12, 1e-12, 0],
      [0, 0, 1]
    ])
  })
  test.each([
    [
      '1',
      'Direct',
      '0.25 0.5 0.75',
      [
        [2, 0, 0],
        [1, 3, 0],
        [0.4, 0.7, 4]
      ]
    ],
    [
      '2',
      'Cartesian',
      '1.3 2.025 3',
      [
        [4, 0, 0],
        [2, 6, 0],
        [0.8, 1.4, 8]
      ]
    ],
    [
      '-192',
      'K',
      '1.3 2.025 3',
      [
        [4, 0, 0],
        [2, 6, 0],
        [0.8, 1.4, 8]
      ]
    ],
    [
      '2 3 4',
      'Cartesian',
      '1.3 2.025 3',
      [
        [4, 0, 0],
        [2, 9, 0],
        [0.8, 2.1, 16]
      ]
    ],
    [
      '2 3 4',
      'Direct',
      '0.25 0.5 0.75',
      [
        [4, 0, 0],
        [2, 9, 0],
        [0.8, 2.1, 16]
      ]
    ]
  ])('independent oblique arithmetic with scale %s and %s', (scale, mode, coordinates, basis) => {
    const parsed = parseStructure(poscarInput(scale, mode, coordinates), { format: 'poscar' })
    expect(parsed.structure?.kind).toBe('periodic')
    if (parsed.structure?.kind !== 'periodic') throw new Error(JSON.stringify(parsed.diagnostics))
    parsed.structure.cell.basis.forEach((column, i) =>
      column.forEach((value, j) => expect(value).toBeCloseTo(basis[i][j], 12))
    )
    const atom = parsed.structure.atoms[0]
    expect(atom.id).toBe('poscar:atom:1')
    expect(atom.element).toBe('C')
    atom.fractional.forEach((value, i) => expect(value).toBeCloseTo([0.25, 0.5, 0.75][i], 12))
    expect(parsed.structure.symmetry).toBeUndefined()
    expect(parsed.structure.bonds).toEqual([])
  })

  test('retains species order, zero groups, outside-cell positions and stable IDs through export/re-import', () => {
    const text = poscarInput().replace(
      'C\n1\nDirect\n0.25 0.5 0.75',
      'O C N\n2 1 0\nDirect\n1.25 -0.25 0.5 O\n0.1 0.2 0.3 O\n0.25 0.5 0.75 C'
    )
    const first = parseStructure(text, { format: 'poscar' })
    expect(first.structure?.atoms.map((atom) => atom.element)).toEqual(['O', 'O', 'C'])
    if (first.structure?.kind !== 'periodic') throw new Error(JSON.stringify(first.diagnostics))
    expect(first.structure.atoms[0].fractional).toEqual([1.25, -0.25, 0.5])
    const output = writePoscarStructure(first.structure, { format: 'poscar' })
    const second = parseStructure(output.text!, { format: 'poscar' })
    expect(second.structure?.atoms.map(({ id, element }) => ({ id, element }))).toEqual(
      first.structure.atoms.map(({ id, element }) => ({ id, element }))
    )
    expect(second.structure?.atoms).toEqual(first.structure.atoms)
  })

  test.each([
    [poscarInput('0'), 'POSCAR_SCALE', 2],
    [poscarInput('1 2'), 'POSCAR_SCALE', 2],
    [poscarInput('1 -2 3'), 'POSCAR_SCALE', 2],
    [poscarInput().replace('2 0 0', '0 0 0'), 'POSCAR_CELL', 3],
    [poscarInput().replace('C\n1\nDirect', 'C O\n1\nDirect'), 'POSCAR_COUNTS', 7],
    [poscarInput().replace('C\n1\nDirect', 'C\n1.2\nDirect'), 'POSCAR_COUNTS', 7],
    [poscarInput().replace('C\n1\nDirect', 'C\n0\nDirect'), 'POSCAR_COUNTS', 7],
    [poscarInput().replace('C\n1\nDirect', 'Fe_pv\n1\nDirect'), 'POSCAR_ELEMENT', 6],
    [poscarInput().replace('C\n1\nDirect', '1\nDirect\n0 0 0'), 'POSCAR_SPECIES_REQUIRED', 6],
    [poscarInput('1', 'Selective dynamics'), 'POSCAR_COORDINATE_MODE', 9],
    [poscarInput('1', 'Selective dynamics\nDirect', '0 0 0 T F X'), 'POSCAR_SELECTIVE_FLAGS', 10],
    [poscarInput('1', 'Direct', '0 0 0 T F T'), 'POSCAR_COORDINATE_FIELDS', 9],
    [poscarInput('1', 'Direct', 'NaN 0 0'), 'POSCAR_COORDINATE', 9],
    [poscarInput('1', 'Direct', '0 0'), 'POSCAR_COORDINATE', 9],
    [poscarInput('1', 'Direct', ''), 'POSCAR_TRUNCATED', 9],
    [poscarInput() + 'Cartesian\n0 0 0\n', 'POSCAR_TRAILING_DATA_UNSUPPORTED', 10],
    [
      poscarInput() + 'Lattice velocities and vectors\n',
      'POSCAR_LATTICE_VELOCITIES_UNSUPPORTED',
      10
    ]
  ])('rejects unsupported/malformed input with %s', (text, code, line) => {
    const result = parseStructure(text, { format: 'poscar' })
    expect(result.structure).toBeUndefined()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code, severity: 'error', sourceLocation: { line, column: 1 } })
    )
  })
})

describe('T-FMT-03 periodic POSCAR and scientific losses', () => {
  test('keeps Direct mobility under Cartesian input and element regrouping', () => {
    const direct = parseStructure(
      poscarInput('1', 'Selective dynamics\nDirect', '0.25 0.5 0.75 T F T C'),
      { format: 'poscar' }
    ).structure
    const cartesian = parseStructure(
      poscarInput('1', 'Selective dynamics\nCartesian', '1.3 2.025 3 T F T'),
      { format: 'poscar' }
    ).structure
    expect(direct?.kind).toBe('periodic')
    expect(cartesian?.kind).toBe('periodic')
    if (direct?.kind !== 'periodic' || cartesian?.kind !== 'periodic')
      throw new Error('Missing crystal')
    expect(cartesian.atoms[0].movable).toEqual([true, false, true])
    expect(cartesian.atoms[0].fractional).toEqual(
      direct.atoms[0].fractional.map((x) => expect.closeTo(x))
    )
    const input = source()
    const output = writePoscarStructure(
      {
        ...input,
        atoms: [
          { ...input.atoms[0], movable: [false, true, false] },
          { ...input.atoms[1], movable: [false, false, false] },
          input.atoms[2]
        ]
      },
      { format: 'poscar' }
    )
    expect(output.text).toContain('Selective dynamics\nDirect\n')
    const roundtrip = parseStructure(output.text!, { format: 'poscar' }).structure
    if (roundtrip?.kind !== 'periodic') throw new Error('Missing round-trip crystal')
    expect(roundtrip.atoms.map((atom) => [atom.element, atom.movable])).toEqual([
      ['O', [false, true, false]],
      ['O', [true, true, true]],
      ['C', [false, false, false]]
    ])
    for (const [options, code] of [
      [{ format: 'cif', version: '1' }, 'CIF_MOBILITY_LOSS'],
      [
        {
          format: 'mol',
          finite: { kind: 'source', atomIds: roundtrip.atoms.map((atom) => atom.id) }
        },
        'MOL_MOBILITY_LOSS'
      ]
    ] as const) {
      const blocked = writeStructure(roundtrip, options)
      expect(blocked.text).toBeUndefined()
      expect(blocked.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code, severity: 'error' })])
      )
      const accepted = writeStructure(roundtrip, { ...options, allowLoss: true })
      expect(accepted.text).toBeDefined()
      expect(accepted.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code, severity: 'warning' })])
      )
    }
  })

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
