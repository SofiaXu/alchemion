import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseMolStructure } from '../reader'
import { writeMolStructure } from '../writer'
import { molecularEndpoint } from '../common'
import type { MolecularStructureSnapshot, SourceBond } from '../../../core/types'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.mol`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n')
const parsed = (text: string): MolecularStructureSnapshot => {
  const result = parseMolStructure(text)
  if (!result.structure || result.structure.kind !== 'molecular')
    throw new Error(JSON.stringify(result.diagnostics))
  return result.structure
}
const source = (): MolecularStructureSnapshot => ({
  kind: 'molecular',
  title: 'Authored molecule',
  atoms: [
    {
      id: 'center',
      element: 'C',
      cartesian: [0, 0, 0],
      isotope: 13,
      formalCharge: 1,
      atomMap: 71,
      stereoParity: { parity: 'odd', referenceAtoms: ['f', 'cl', 'br', 'h'] }
    },
    { id: 'f', element: 'F', cartesian: [1, 0, 0] },
    { id: 'cl', element: 'Cl', cartesian: [0, 1, 0] },
    { id: 'br', element: 'Br', cartesian: [-1, 0, 0] },
    { id: 'h', element: 'H', cartesian: [0, -1, 0] },
    { id: 'singlet', element: 'C', cartesian: [3, 0, 0], radical: 'singlet' },
    { id: 'doublet', element: 'C', cartesian: [5, 0, 0], radical: 'doublet' },
    { id: 'triplet', element: 'C', cartesian: [7, 0, 0], radical: 'triplet' }
  ],
  bonds: ['f', 'cl', 'br', 'h'].map(
    (id, i): SourceBond => ({
      id: `bond-${id}`,
      order: 'single',
      endpoints: [molecularEndpoint('center'), molecularEndpoint(id)],
      ...(i === 0 ? { stereo: 'up' } : {})
    })
  ),
  stereoAbsolute: true
})
const write = (input: MolecularStructureSnapshot, version?: 'V2000' | 'V3000', allowLoss = false) =>
  writeMolStructure(input, { format: 'mol', version, allowLoss })

describe('T-FMT-02 MOL declared molecular subset', () => {
  test('both authored versions retain chemical properties, directed stereo and noncontinuous references', () => {
    for (const version of ['v2000', 'v3000']) {
      const text = fixture(`properties-${version}`)
      const molecule = parsed(text)
      // Explicitly exercise Windows line endings, including the V3000 continuation boundary.
      expect(parsed(text.replace(/\n/g, '\r\n'))).toEqual(molecule)
      expect(molecule.atoms).toHaveLength(12)
      expect(molecule.bonds).toHaveLength(6)
      expect(molecule.stereoAbsolute).toBe(true)
      expect(molecule.atoms[0]).toMatchObject({ isotope: 13, formalCharge: 1, atomMap: 71 })
      expect(molecule.atoms.slice(5, 8).map((a) => a.radical)).toEqual([
        'singlet',
        'doublet',
        'triplet'
      ])
      expect(molecule.bonds.map((b) => b.order)).toEqual([
        'single',
        'single',
        'single',
        'single',
        'double',
        'triple'
      ])
      expect(molecule.bonds[0]).toMatchObject({
        stereo: 'up',
        endpoints: [{ sourceAtomId: molecule.atoms[0].id }, { sourceAtomId: molecule.atoms[1].id }]
      })
      expect(molecule.bonds[4].stereo).toBe('either')
      expect(molecule.atoms[0].stereoParity).toMatchObject({
        parity: version === 'v2000' ? 'odd' : 'even'
      })
      expect(Object.isFrozen(molecule.atoms[0])).toBe(true)
    }
  })
  test('default output is V3000, explicit V2000 uses ISO records and both preserve source semantics', () => {
    for (const version of [undefined, 'V2000', 'V3000'] as const) {
      const input = source(),
        before = JSON.stringify(input),
        result = write(input, version)
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
      expect(result.text).toContain(version ?? 'V3000')
      if (version === 'V2000') expect(result.text).toContain('M  ISO  1   1  13')
      const molecule = parsed(result.text!)
      expect(
        molecule.atoms.map((a) => [
          a.element,
          a.cartesian,
          a.isotope,
          a.formalCharge,
          a.radical,
          a.atomMap
        ])
      ).toEqual(
        input.atoms.map((a) => [
          a.element,
          a.cartesian,
          a.isotope,
          a.formalCharge,
          a.radical,
          a.atomMap
        ])
      )
      expect(molecule.atoms[0].stereoParity?.parity).toBe('odd')
      expect(molecule.bonds[0].stereo).toBe('up')
      expect(result.atomMapping?.map((a) => a.source.sourceAtomId)).toEqual(
        input.atoms.map((a) => a.id)
      )
      expect(JSON.stringify(input)).toBe(before)
    }
  })
  test('parity follows stable neighbors when atom records are reordered', () => {
    const input = source()
    const reordered: MolecularStructureSnapshot = {
      ...input,
      atoms: [input.atoms[0], input.atoms[2], input.atoms[1], ...input.atoms.slice(3)]
    }
    for (const version of ['V2000', 'V3000'] as const) {
      const output = write(reordered, version)
      expect(parsed(output.text!).atoms[0].stereoParity?.parity).toBe('even')
      expect(input.atoms[0].stereoParity?.parity).toBe('odd')
    }
  })
  test('V2000 isotope mass differences use the reference isotope rather than average mass rounding', () => {
    const make = (symbol: string) =>
      `Mass difference\n\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 ${symbol.padEnd(3)} 1  0  0  0  0  0  0  0  0  0  0  0\nM  END\n`
    for (const [symbol, isotope] of [
      ['Br', 80],
      ['Ni', 59],
      ['Cu', 64],
      ['Zn', 65],
      ['Ge', 75],
      ['Mo', 99]
    ] as const)
      expect(parsed(make(symbol)).atoms[0].isotope).toBe(isotope)
    expect(parsed(make('Br').replace('M  END', 'M  ISO  1   1  81\nM  END')).atoms[0].isotope).toBe(
      81
    )
  })
  test('property records override the entire legacy charge/radical/isotope columns', () => {
    const text = fixture('properties-v2000')
    const lines = text.split('\n')
    lines[5] = `${lines[5].slice(0, 34)} 1  3${lines[5].slice(39)}`
    const molecule = parsed(lines.join('\n'))
    expect(molecule.atoms[1].formalCharge).toBeUndefined()
    expect(molecule.atoms[1].isotope).toBeUndefined()
  })
  test('aromatic and each basic directed stereo marker are retained without chemical inference', () => {
    for (const [order, stereo] of [
      ['single', 'up'],
      ['single', 'down'],
      ['single', 'either'],
      ['double', 'either'],
      ['aromatic', undefined]
    ] as const) {
      const input: MolecularStructureSnapshot = {
        kind: 'molecular',
        atoms: source().atoms.slice(1, 3),
        bonds: [
          {
            id: 'x',
            endpoints: [molecularEndpoint('f'), molecularEndpoint('cl')],
            order,
            ...(stereo ? { stereo } : {})
          }
        ]
      }
      for (const version of ['V2000', 'V3000'] as const)
        expect(parsed(write(input, version).text!).bonds[0]).toMatchObject({
          order,
          ...(stereo ? { stereo } : {})
        })
    }
  })
  test('V3000 writer emits bounded continuation lines without changing long finite numbers', () => {
    const input: MolecularStructureSnapshot = {
      kind: 'molecular',
      atoms: [
        {
          id: 'large',
          element: 'C',
          cartesian: [1.23456789012345e100, -1.23456789012345e100, 1.23456789012345e100],
          isotope: 13,
          formalCharge: 15,
          radical: 'triplet',
          atomMap: 123456789
        }
      ],
      bonds: []
    }
    const result = write(input)
    expect(
      result
        .text!.split('\n')
        .filter((l) => l.startsWith('M  V30 '))
        .every((l) => l.length <= 80)
    ).toBe(true)
    expect(result.text).toContain('-\nM  V30 ')
    expect(parsed(result.text!).atoms[0].cartesian).toEqual(input.atoms[0].cartesian)
  })
})

describe('T-FMT-04 MOL failures and explicit losses', () => {
  test('malformed versions, counts, properties, endpoints and unsupported constructs fail with locations', () => {
    const v2 = fixture('properties-v2000'),
      v3 = fixture('properties-v3000')
    const mutate = (text: string, before: string, after: string): string => {
      const changed = text.replace(before, after)
      expect(changed, `Malformed fixture mutation must match ${JSON.stringify(before)}.`).not.toBe(
        text
      )
      return changed
    }
    const bad = [
      mutate(v2, 'V2000', 'V4000'),
      mutate(v2, ' 12  6', ' 13  6'),
      mutate(v2, '    0.0000', '       NaN'),
      mutate(v2, ' C  ', ' Xx '),
      mutate(v2, 'M  ISO  1   1  13', 'M  ISO  2   1  13'),
      mutate(v2, 'M  END', 'M  STY  1   1 SUP\nM  END'),
      mutate(v2, '  1  2  1  1', '  1 99  1  1'),
      mutate(v2, 'M  END', ''),
      v2 + '$$$$\n',
      mutate(v3, '3 F', '41 F'),
      mutate(v3, '9 1 41 9', '9 1 41 999'),
      mutate(v3, 'COUNTS 12 6 0', 'COUNTS 12 6 1'),
      mutate(v3, 'CHG=1 MA-', 'VAL=4 MA-'),
      mutate(v3, 'CFG=2', 'CFG=8'),
      mutate(v3, 'MA-\nM  V30 SS=13', 'MA-\nSS=13')
    ]
    for (const text of bad) {
      const result = parseMolStructure(text)
      expect(result.structure, text).toBeUndefined()
      expect(
        result.diagnostics.some(
          (d) => d.severity === 'error' && d.sourceLocation && d.context?.format === 'mol'
        ),
        text
      ).toBe(true)
    }
  })
  test('hard V2000 representation limits cannot be bypassed with allowLoss', () => {
    const simple: MolecularStructureSnapshot = {
      kind: 'molecular',
      atoms: [{ id: 'x', element: 'C', cartesian: [0, 0, 0] }],
      bonds: []
    }
    const cases: MolecularStructureSnapshot[] = [
      {
        ...simple,
        atoms: Array.from({ length: 1000 }, (_, i) => ({ ...simple.atoms[0], id: `x-${i}` }))
      },
      { ...simple, atoms: [{ ...simple.atoms[0], cartesian: [100000, 0, 0] }] },
      { ...simple, atoms: [{ ...simple.atoms[0], atomMap: 1000 }] },
      { ...simple, atoms: [{ ...simple.atoms[0], isotope: 1000 }] }
    ]
    for (const input of cases) expect(write(input, 'V2000', true).text).toBeUndefined()
  })
  test('unrepresentable scientific fields and precision block output until explicitly accepted', () => {
    const input: MolecularStructureSnapshot = {
      kind: 'molecular',
      atoms: [
        {
          id: 'x',
          element: 'C',
          label: 'same',
          cartesian: [0.123456, 0, 0],
          occupancy: { kind: 'unknown' },
          displacementU: { kind: 'known', value: 0.01 },
          oxidationState: { kind: 'known', value: 2 },
          coordinateUncertainties: { frame: 'cartesian', standardUncertainties: [0.01, 0.01, 0.01] }
        }
      ],
      bonds: []
    }
    const rejected = write(input, 'V2000'),
      accepted = write(input, 'V2000', true)
    expect(rejected.text).toBeUndefined()
    expect(rejected.diagnostics.some((d) => d.code === 'MOL_V2000_COORDINATE_PRECISION_LOSS')).toBe(
      true
    )
    expect(accepted.text).toBeDefined()
    expect(
      accepted.diagnostics
        .filter((d) => d.code.startsWith('MOL_'))
        .every((d) => d.severity === 'warning')
    ).toBe(true)
    expect(parsed(accepted.text!).atoms[0].cartesian[0]).toBe(0.1235)
  })
  test('inherited unmapped scientific losses survive parsing state and remain explicit', () => {
    const input: MolecularStructureSnapshot = {
      ...source(),
      metadata: {
        alchemionFormats: {
          schemaVersion: 1,
          sourceFormat: 'cif',
          version: '2',
          sourceMeasurements: {
            atoms: [
              {
                id: 'center',
                cartesian: [
                  { kind: 'known', value: 0, standardUncertainty: 0.01 },
                  { kind: 'known', value: 0 },
                  { kind: 'known', value: 0 }
                ]
              }
            ]
          },
          losses: [
            { severity: 'warning', code: 'UNMAPPED_SCIENCE', message: 'Unmapped scientific field.' }
          ]
        }
      }
    }
    expect(write(input).text).toBeUndefined()
    const result = write(input, undefined, true)
    expect(result.text).toBeDefined()
    expect(result.diagnostics.filter((d) => d.code === 'UNMAPPED_SCIENCE')).toHaveLength(1)
    expect(result.diagnostics.filter((d) => d.code === 'FORMAT_SOURCE_MEASUREMENT_LOSS')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        context: expect.objectContaining({ format: 'mol' })
      })
    ])
  })
})
