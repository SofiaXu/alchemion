import { describe, expect, it } from 'vitest'
import type { StructureSnapshot } from '../../../core'
import { parseCifStructure, writeCifStructure } from '../structure'
import { cartesianCif, skewCif } from './fixtures'

describe('CIF losses and source measurement anchors', () => {
  it('retains unmodeled scientific categories across parse/write even when the AST is discarded', () => {
    const parsed = parseCifStructure(
      `${skewCif}\n_atom_site_aniso_U_11 0.01\n_custom_science.value [1 2]\n`.replace(
        /^/,
        '#\\#CIF_2.0\n'
      ),
      { format: 'cif' }
    )
    expect(parsed.structure).toBeDefined()
    expect(
      parsed.diagnostics.filter((entry) => entry.code === 'CIF_UNMAPPED_SCIENCE')
    ).toHaveLength(2)
    const denied = writeCifStructure(parsed.structure!, { format: 'cif', version: '2' })
    expect(denied.text).toBeUndefined()
    expect(denied.diagnostics.filter((entry) => entry.severity === 'error')).toHaveLength(2)
    const accepted = writeCifStructure(parsed.structure!, {
      format: 'cif',
      version: '2',
      allowLoss: true
    })
    expect(accepted.text).toBeDefined()
    expect(accepted.diagnostics.filter((entry) => entry.code === 'CIF_UNMAPPED_SCIENCE')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          context: expect.objectContaining({ tag: '_atom_site_aniso_U_11' })
        })
      ])
    )
  })

  it('requires explicit acceptance for unsupported atom properties and explicit bonds', () => {
    const original = parseCifStructure(skewCif, { format: 'cif' }).structure!
    if (original.kind !== 'periodic') throw new Error('Expected crystal')
    const identity = original.symmetry!.operations![0].id
    const snapshot: StructureSnapshot = {
      ...original,
      atoms: original.atoms.map((atom, index) =>
        index === 0 ? { ...atom, formalCharge: 1, isotope: 13 } : atom
      ),
      bonds: [
        {
          id: 'explicit-bond',
          order: 'double',
          endpoints: [
            {
              sourceAtomId: original.atoms[0].id,
              symmetryOperationId: identity,
              integerCellOffset: [0, 0, 0]
            },
            {
              sourceAtomId: original.atoms[1].id,
              symmetryOperationId: identity,
              integerCellOffset: [0, 0, 0]
            }
          ]
        }
      ]
    }
    expect(writeCifStructure(snapshot, { format: 'cif', version: '1' }).text).toBeUndefined()
    const accepted = writeCifStructure(snapshot, { format: 'cif', version: '1', allowLoss: true })
    expect(accepted.text).toBeDefined()
    expect(
      accepted.diagnostics.filter((entry) => entry.code === 'CIF_ATOM_PROPERTY_LOSS')
    ).toHaveLength(2)
    expect(accepted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CIF_BOND_LOSS', context: { bondId: 'explicit-bond' } })
    )
  })

  it('does not reuse partial Cartesian measurements after a coordinate edit', () => {
    const original = parseCifStructure(cartesianCif, { format: 'cif' }).structure!
    if (original.kind !== 'periodic') throw new Error('Expected crystal')
    const edited: StructureSnapshot = {
      ...original,
      atoms: [{ ...original.atoms[0], fractional: [0.5, 0.5, 0.5] }]
    }
    const written = writeCifStructure(edited, { format: 'cif', version: '2' })
    expect(written.text).toBeDefined()
    expect(written.text).not.toContain('0.500(2)')
    expect(written.text).not.toContain('_atom_site_Cartn_x')
  })

  it('detects stale formal uncertainty literals instead of copying them to new coordinates', () => {
    const original = parseCifStructure(skewCif, { format: 'cif' }).structure!
    if (original.kind !== 'periodic') throw new Error('Expected crystal')
    const edited: StructureSnapshot = {
      ...original,
      atoms: original.atoms.map((atom, index) =>
        index === 0 ? { ...atom, fractional: [0.5, 0.5, 0.75] } : atom
      )
    }
    expect(writeCifStructure(edited, { format: 'cif', version: '1' }).text).toBeUndefined()
    const accepted = writeCifStructure(edited, { format: 'cif', version: '1', allowLoss: true })
    expect(accepted.text).not.toContain('.2500(5)')
    expect(accepted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CIF_UNCERTAINTY_STALE', severity: 'warning' })
    )
  })

  it('rejects nonperiodic input instead of creating a default box', () => {
    const result = writeCifStructure(
      { kind: 'molecular', atoms: [{ id: 'C', element: 'C', cartesian: [0, 0, 0] }], bonds: [] },
      { format: 'cif', version: '1', allowLoss: true }
    )
    expect(result.text).toBeUndefined()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CIF_PERIODIC_REQUIRED' })
    )
  })
})
