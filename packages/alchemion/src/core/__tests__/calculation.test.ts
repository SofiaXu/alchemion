import { describe, expect, it } from 'vitest'
import { registerResultFrame, validateCalculationResult } from '../calculation'
import type { PoscarExportReceipt } from '../calculation'
import type { PeriodicStructureSnapshot } from '../types'

const cell = {
  basis: [
    [4, 0, 0],
    [2, 5, 0],
    [0, 0, 6]
  ] as const
}
const source: PeriodicStructureSnapshot = {
  kind: 'periodic',
  cell,
  bonds: [],
  atoms: [
    { id: 'c1', element: 'C', fractional: [-1e-20, 0, 0] },
    { id: 'si', element: 'Si', fractional: [0.2, 0.3, 0.4] },
    { id: 'c2', element: 'C', fractional: [0.5, 0, 0] }
  ]
}
const frame: PeriodicStructureSnapshot = {
  ...source,
  atoms: [
    { ...source.atoms[0], id: '1', fractional: [0.9999997, 0, 0] },
    { ...source.atoms[2], id: '2' },
    { ...source.atoms[1], id: '3' }
  ]
}
describe('calculation registration and ownership', () => {
  it('maps reordered export rows across the periodic seam and diagnoses a conflicting receipt row', () => {
    const receipt: PoscarExportReceipt = {
      version: 1,
      cell,
      atoms: [source.atoms[0], source.atoms[2], source.atoms[1]].map((atom, index) => ({
        fileAtomNumber: index + 1,
        atomId: atom.id,
        element: atom.element,
        fractional: atom.fractional
      }))
    }
    expect(registerResultFrame(frame, source, { receipt })).toMatchObject({
      ok: true,
      value: ['c1', 'c2', 'si']
    })
    expect(registerResultFrame(frame, source)).toMatchObject({
      ok: true,
      value: ['c1', 'c2', 'si']
    })
    const swapped = { ...receipt, atoms: [receipt.atoms[1], receipt.atoms[0], receipt.atoms[2]] }
    expect(registerResultFrame(frame, source, { receipt: swapped })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'RESULT_RECEIPT_ROW', context: { field: '1' } }]
    })
  })
  it('requires explicit identities for coincident same-element rows', () => {
    const coincident = {
      ...source,
      atoms: source.atoms.map((atom) =>
        atom.id === 'c2' ? { ...atom, fractional: source.atoms[0].fractional } : atom
      )
    }
    expect(registerResultFrame(coincident, coincident)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'RESULT_AMBIGUOUS' }]
    })
    expect(
      registerResultFrame(coincident, coincident, { atomIds: ['c1', 'si', 'c2'] })
    ).toMatchObject({
      ok: true,
      value: ['c1', 'si', 'c2']
    })
  })
  it('isolates typed grid buffers and rejects mismatched frame references', () => {
    const values = new Float64Array(8).fill(0.125)
    const data = {
      kind: 'grid' as const,
      id: 'rho',
      frameId: 'f',
      quantity: 'charge density',
      unit: 'Å⁻³',
      grid: {
        origin: [0, 0, 0],
        steps: cell.basis,
        dimensions: [2, 2, 2],
        periodic: [true, true, true],
        values
      }
    }
    const input = {
      version: 1,
      id: 'r',
      sources: [{ name: 'synthetic', format: 'fixture', sha256: 'a'.repeat(64) }],
      termination: 'unknown',
      convergence: 'unknown',
      frames: [{ id: 'f', structure: source }],
      data: [data]
    }
    const validated = validateCalculationResult(input)
    if (!validated.ok) throw new Error(validated.diagnostics[0].message)
    values[0] = 100
    expect(validated.value.data[0]).toMatchObject({
      grid: { values: new Float64Array(8).fill(0.125) }
    })
    expect(
      validateCalculationResult({ ...input, data: [{ ...data, frameId: 'different' }] })
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'RESULT_DATA' }]
    })
  })
})
