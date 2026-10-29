import { describe, expect, it } from 'vitest'
import { fractionalToCartesian } from '../../../core'
import { parseCifStructure, writeCifStructure } from '../structure'
import { cartesianCif, inversionCif, skewCif } from './fixtures'

const withinDomainTolerance = (actual: readonly number[], expected: readonly number[]) => {
  actual.forEach((value, index) => {
    expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(
      1e-9 + 1e-10 * Math.max(Math.abs(value), Math.abs(expected[index]))
    )
  })
}

describe('CIF crystal mapping', () => {
  it.each(['1', '2'] as const)('maps supported scientific values and writes CIF%s', (version) => {
    const parsed = parseCifStructure((version === '2' ? '#\\#CIF_2.0\n' : '') + skewCif, {
      format: 'cif'
    })
    expect(parsed.diagnostics.some((entry) => entry.severity === 'error')).toBe(false)
    const structure = parsed.structure!
    expect(structure.kind).toBe('periodic')
    if (structure.kind !== 'periodic') throw new Error('Expected crystal')
    expect(structure.cell.parameterUncertainties?.a).toEqual({
      standardUncertainty: 0.002,
      literal: '2.000(2)'
    })
    expect(structure.atoms[0]).toMatchObject({
      label: 'same',
      element: 'C',
      fractional: [0.25, 0.5, 0.75],
      occupancy: { kind: 'known', value: 1 },
      displacementU: { kind: 'known', value: 0.01, standardUncertainty: 0.0002 },
      coordinateUncertainties: {
        frame: 'fractional'
      }
    })
    withinDomainTolerance(
      structure.atoms[0].coordinateUncertainties!.standardUncertainties,
      [0.0005, 0.0006, 0.0007]
    )
    expect(structure.atoms[1]).toMatchObject({
      label: 'same',
      occupancy: { kind: 'unknown' },
      displacementU: { kind: 'not-applicable' }
    })
    expect(structure.atoms[0].id).not.toBe(structure.atoms[1].id)
    expect(fractionalToCartesian(structure.cell, structure.atoms[0].fractional)).toMatchObject({
      ok: true,
      value: [expect.closeTo(1, 12), expect.closeTo(Math.sqrt(3) / 2, 12), expect.closeTo(3, 12)]
    })
    const output = writeCifStructure(structure, { format: 'cif', version })
    expect(output.diagnostics.some((entry) => entry.severity === 'error')).toBe(false)
    expect(output.text).toContain('.2500(5)')
    const reread = parseCifStructure(output.text!, { format: 'cif' })
    expect(reread.structure?.atoms[0]).toMatchObject({
      element: 'C'
    })
    withinDomainTolerance(
      reread.structure!.atoms[0].coordinateUncertainties!.standardUncertainties,
      [0.0005, 0.0006, 0.0007]
    )
  })

  it('converts Cartesian coordinates and B through the core while retaining partial source uncertainties', () => {
    const result = parseCifStructure(cartesianCif, { format: 'cif' })
    const structure = result.structure!
    expect(structure.atoms[0]).toMatchObject({
      fractional: [expect.closeTo(0.25, 12), expect.closeTo(0.5, 12), expect.closeTo(0.75, 12)],
      displacementU: {
        value: expect.closeTo(0.8 / (8 * Math.PI ** 2), 12),
        standardUncertainty: expect.closeTo(0.02 / (8 * Math.PI ** 2), 12)
      }
    })
    expect(structure.atoms[0].coordinateUncertainties).toBeUndefined()
    const output = writeCifStructure(structure, { format: 'cif', version: '2' })
    expect(output.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
    expect(output.text).toContain('_atom_site_Cartn_x')
    expect(output.text).toContain('0.500(2) 1.500 3.000(5)')
    expect(output.text).toContain('0.80(2)')
  })

  it('retains explicit operations, identifiers and oxidation-state suffixes without inventing formal charge', () => {
    const result = parseCifStructure(inversionCif, { format: 'cif' })
    expect(result.structure).toMatchObject({
      symmetry: {
        operations: [{}, {}],
        spaceGroup: { itNumber: 2, hermannMauguin: 'P -1', hallSymbol: '-P 1' }
      }
    })
    expect(result.structure?.atoms[0]).toMatchObject({
      element: 'Fe',
      oxidationState: { kind: 'known', value: 3 }
    })
    expect(result.structure?.atoms[0].formalCharge).toBeUndefined()
    expect(writeCifStructure(result.structure!, { format: 'cif', version: '1' }).text).toContain(
      'Fe3+'
    )
  })

  it('returns candidates and requires explicit selection for multiple data blocks', () => {
    const text = skewCif + cartesianCif
    expect(parseCifStructure(text, { format: 'cif' })).toMatchObject({
      candidates: [
        { name: 'skew', index: 0 },
        { name: 'cartesian', index: 1 }
      ],
      diagnostics: [{ code: 'CIF_BLOCK_REQUIRED' }]
    })
    expect(
      parseCifStructure(text, { format: 'cif', block: { name: 'CARTESIAN' } }).structure?.atoms
    ).toHaveLength(1)
    expect(
      parseCifStructure(text, { format: 'cif', block: { index: 0 } }).structure?.atoms
    ).toHaveLength(2)
    expect(
      parseCifStructure(text, { format: 'cif', block: { index: -1 } }).structure
    ).toBeUndefined()
    expect(parseCifStructure('# comment', { format: 'cif' }).diagnostics[0].code).toBe(
      'CIF_NO_BLOCKS'
    )
  })

  it('supports case-insensitive aliases and reports conflicts with source context', () => {
    const identical = skewCif.replace('_cell_length_b 2', '_CELL_LENGTH_B 2\n_cell.length_b 2.0')
    expect(parseCifStructure(identical, { format: 'cif' }).structure).toBeDefined()
    const result = parseCifStructure(identical.replace('_cell.length_b 2.0', '_cell.length_b 3'), {
      format: 'cif'
    })
    expect(result.structure).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({
      code: 'CIF_ALIAS_CONFLICT',
      sourceLocation: { line: 4 },
      context: { tag: '_cell.length_b' }
    })
  })

  it('allows a missing type column only for an unambiguous element label', () => {
    const input = cartesianCif.replace('_atom_site.type_symbol\n', '').replace('C1 C ', 'C1 ')
    const result = parseCifStructure(input, { format: 'cif' })
    expect(result.structure?.atoms[0].element).toBe('C')
    expect(result.diagnostics.some((entry) => entry.code === 'CIF_ELEMENT_FROM_LABEL')).toBe(true)
    expect(
      parseCifStructure(input.replace('C1 ', 'SITE1 '), { format: 'cif' }).structure
    ).toBeUndefined()
  })

  it('keeps an ambiguous symmetry identifier without selecting its first setting', () => {
    const result = parseCifStructure(
      cartesianCif.replace('loop_', '_space_group_IT_number 3\nloop_'),
      { format: 'cif' }
    )
    expect(result.structure).toBeDefined()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'SYMMETRY_AMBIGUOUS', severity: 'warning' })
    )
    expect(result.structure).not.toHaveProperty('symmetry.operations')
  })

  it('preserves explicit unknown/not-applicable symmetry and volume markers', () => {
    const result = parseCifStructure(
      cartesianCif.replace(
        'loop_',
        '_space_group_IT_number ?\n_space_group_name_Hall .\n_cell_volume ?\nloop_'
      ),
      { format: 'cif' }
    )
    const written = writeCifStructure(result.structure!, { format: 'cif', version: '1' })
    expect(written.text).toContain('_space_group_it_number ?')
    expect(written.text).toContain('_space_group_name_hall .')
    expect(written.text).toContain('_cell_volume ?')
  })

  it.each([
    ['unknown element', cartesianCif.replace('C1 C ', 'C1 Xx '), 'CIF_ELEMENT'],
    ['invalid number', cartesianCif.replace('0.500(2)', 'NaN'), 'CIF_NUMBER'],
    ['missing coordinate', cartesianCif.replace('0.500(2)', '?'), 'CIF_NUMBER'],
    [
      'partial coordinate triplet',
      cartesianCif.replace('_atom_site.Cartn_z\n', '').replace('3.000(5) ', ''),
      'CIF_REQUIRED_FIELD'
    ],
    [
      'degenerate cell',
      cartesianCif.replace('_cell.angle_gamma 90', '_cell.angle_gamma 180'),
      'CELL_PARAMETERS'
    ]
  ])('rejects %s without a partial structure', (_case, input, code) => {
    const result = parseCifStructure(input, { format: 'cif' })
    expect(result.structure).toBeUndefined()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code, severity: 'error', sourceLocation: expect.any(Object) })
    )
  })
})
