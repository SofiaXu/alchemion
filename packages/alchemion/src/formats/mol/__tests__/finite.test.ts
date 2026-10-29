import { describe, expect, test } from 'vitest'
import { createCell, parseSymmetryOperation } from '../../../core'
import type { BondEndpoint, PeriodicStructureSnapshot, ScientificResult } from '../../../core/types'
import { parseMolStructure } from '../reader'
import { writeMolStructure } from '../writer'

const value = <T>(result: ScientificResult<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const endpoint = (sourceAtomId: string, shift = 0): BondEndpoint => ({
  sourceAtomId,
  symmetryOperationId: 'id',
  integerCellOffset: [shift, 0, 0]
})
const source = (): PeriodicStructureSnapshot => ({
  kind: 'periodic',
  cell: value(createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 })),
  symmetry: { operations: [value(parseSymmetryOperation('x,y,z', 'id'))] },
  atoms: [
    { id: 'a', element: 'C', fractional: [1.25, 0, 0] },
    { id: 'b', element: 'O', fractional: [0.75, 0, 0] }
  ],
  bonds: [{ id: 'boundary', order: 'double', endpoints: [endpoint('a'), endpoint('b', 1)] }]
})

describe('T-FMT-03 finite MOL range and stable provenance', () => {
  test('periodic export requires both an explicit selection and accepted periodic losses', () => {
    expect(writeMolStructure(source(), { format: 'mol', allowLoss: true }).text).toBeUndefined()
    const result = writeMolStructure(source(), {
      format: 'mol',
      finite: { kind: 'source', atomIds: ['a', 'b'] }
    })
    expect(result.text).toBeUndefined()
    expect(
      result.diagnostics.some((d) => d.code === 'MOL_PERIODICITY_LOSS' && d.severity === 'error')
    ).toBe(true)
  })
  test('source selection keeps out-of-cell source fractions and reports explicit boundary bonds', () => {
    const input = source(),
      before = JSON.stringify(input)
    const result = writeMolStructure(input, {
      format: 'mol',
      allowLoss: true,
      finite: { kind: 'source', atomIds: ['b', 'a'] }
    })
    const parsed = parseMolStructure(result.text!)
    expect(
      parsed.structure?.atoms.map((a) => ('cartesian' in a ? a.cartesian : undefined))
    ).toEqual([
      [1.5, 0, 0],
      [2.5, 0, 0]
    ])
    expect(parsed.structure?.bonds).toHaveLength(0)
    expect(result.diagnostics.some((d) => d.code === 'MOL_BOUNDARY_BOND_LOSS')).toBe(true)
    expect(result.atomMapping?.map((m) => [m.fileAtomNumber, m.source.sourceAtomId])).toEqual([
      [1, 'b'],
      [2, 'a']
    ])
    expect(JSON.stringify(input)).toBe(before)
  })
  test('explicit instances reconstruct positions and selected bond images from source transforms', () => {
    const result = writeMolStructure(source(), {
      format: 'mol',
      allowLoss: true,
      finite: { kind: 'instances', endpoints: [endpoint('a'), endpoint('b', 1)] }
    })
    const parsed = parseMolStructure(result.text!)
    expect(
      parsed.structure?.atoms.map((a) => ('cartesian' in a ? a.cartesian : undefined))
    ).toEqual([
      [2.5, 0, 0],
      [3.5, 0, 0]
    ])
    expect(parsed.structure?.bonds[0].order).toBe('double')
    expect(result.atomMapping?.[1].source.integerCellOffset).toEqual([1, 0, 0])
  })
  test('different images of one source get distinct stable exported IDs and finite periodic self-bonds', () => {
    const input: PeriodicStructureSnapshot = {
      ...source(),
      atoms: source().atoms.slice(0, 1),
      bonds: [{ id: 'chain', order: 'single', endpoints: [endpoint('a'), endpoint('a', 1)] }]
    }
    const options = {
      format: 'mol',
      allowLoss: true,
      finite: { kind: 'instances', endpoints: [endpoint('a'), endpoint('a', 1)] }
    } as const
    const result = writeMolStructure(input, options),
      reordered = writeMolStructure(input, {
        ...options,
        finite: { kind: 'instances', endpoints: [...options.finite.endpoints].reverse() }
      })
    expect(parseMolStructure(result.text!).structure?.atoms).toHaveLength(2)
    expect(parseMolStructure(result.text!).structure?.bonds).toHaveLength(1)
    expect(new Set(result.atomMapping?.map((m) => m.exportAtomId)).size).toBe(2)
    expect(result.atomMapping?.map((m) => m.exportAtomId).sort()).toEqual(
      reordered.atomMapping?.map((m) => m.exportAtomId).sort()
    )
    expect(result.diagnostics.some((d) => d.code === 'MOL_BOUNDARY_BOND_LOSS')).toBe(true)
  })
  test('unresolved, invalid, empty and duplicate physical selections are refused', () => {
    for (const endpoints of [
      [],
      [endpoint('missing')],
      [{ ...endpoint('a'), symmetryOperationId: 'bad' }],
      [{ ...endpoint('a'), integerCellOffset: [0.1, 0, 0] as const }],
      [endpoint('a'), endpoint('a')]
    ]) {
      const result = writeMolStructure(source(), {
        format: 'mol',
        allowLoss: true,
        finite: { kind: 'instances', endpoints }
      })
      expect(result.text).toBeUndefined()
      expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true)
    }
  })
})
