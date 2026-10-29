import { describe, expect, it } from 'vitest'
import { deriveInstances, sourcePositionFromInstance } from '../derivation'
import {
  parseSymmetryOperation,
  resolveBondEndpoint,
  resolveSymmetry,
  validateSymmetryOperations
} from '../symmetry'
import type {
  AtomInstance,
  Cell,
  PeriodicStructureSnapshot,
  ScientificResult,
  SymmetryInformation,
  SymmetryOperation
} from '../types'

function value<T>(result: ScientificResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const cell: Cell = {
  basis: [
    [10, 0, 0],
    [0, 10, 0],
    [0, 0, 10]
  ]
}
const identity = value(parseSymmetryOperation('x,y,z', 'e'))
const inversion = value(parseSymmetryOperation('-x,-y,-z', 'i'))
function crystal(
  atoms: PeriodicStructureSnapshot['atoms'],
  operations: readonly SymmetryOperation[] = [identity, inversion]
): PeriodicStructureSnapshot {
  return { kind: 'periodic', cell, atoms, bonds: [], symmetry: { operations } }
}

describe('T-DOM-02/06 symmetry and display provenance', () => {
  it('can hide symmetry mates by numeric identity while preserving IDs, integer shifts and source symmetry', () => {
    const shiftedIdentity = value(parseSymmetryOperation('x+1,y,z', 'custom-e'))
    const snapshot = crystal(
      [{ id: 'a', element: 'C', fractional: [0, 0, 0] }],
      [shiftedIdentity, inversion]
    )
    const before = JSON.stringify(snapshot)
    const hidden = value(
      deriveInstances(snapshot, { applySymmetry: false, neighborCells: [[1, 0, 0]] })
    )
    expect(hidden).toHaveLength(2)
    expect(hidden.every((entry) => entry.symmetryOperationId === 'custom-e')).toBe(true)
    expect(
      hidden.map((entry) => value(sourcePositionFromInstance(snapshot, entry, entry.cartesian)))
    ).toEqual([
      [0, 0, 0],
      [0, 0, 0]
    ])
    expect(JSON.stringify(snapshot)).toBe(before)
    expect(
      deriveInstances(crystal(snapshot.atoms, [inversion]), { applySymmetry: false }).diagnostics[0]
        .code
    ).toBe('SYMMETRY_IDENTITY_REQUIRED')
    expect(deriveInstances(snapshot, { applySymmetry: 'false' as never }).ok).toBe(false)
    expect(
      value(deriveInstances(snapshot)).every((entry) => entry.equivalentSources.length === 2)
    ).toBe(true)
  })
  it('parses exact restricted affine expressions and refuses executable/nonlattice syntax', () => {
    const operation = value(parseSymmetryOperation('-y+1/2,x-y+2/3,z-0.25', 'affine'))
    expect(operation.rotation).toEqual([
      [0, 1, 0],
      [-1, -1, 0],
      [0, 0, 1]
    ])
    expect(operation.translation).toEqual([
      { numerator: 1, denominator: 2 },
      { numerator: 2, denominator: 3 },
      { numerator: -1, denominator: 4 }
    ])
    for (const text of [
      'Math.sin(x),y,z',
      'x;y,z,0',
      'x/2,y,z',
      'x+1/0,y,z',
      'x*x,y,z',
      'x,,z',
      'x+,y,z',
      '0,y,z'
    ])
      expect(parseSymmetryOperation(text, 'bad').ok).toBe(false)
    expect(
      validateSymmetryOperations([value(parseSymmetryOperation('y,x,z', 'swap'))], {
        basis: [
          [2, 0, 0],
          [0, 3, 0],
          [0, 0, 4]
        ]
      })[0].code
    ).toBe('SYMMETRY_METRIC')
  })

  it('resolves verified settings without guessing and diagnoses explicit identifier conflicts', () => {
    const unresolved = resolveSymmetry({ spaceGroup: { itNumber: 3 } }, cell)
    expect(unresolved.ok).toBe(false)
    expect(unresolved.diagnostics[0].code).toBe('SYMMETRY_AMBIGUOUS')
    const resolved = value(resolveSymmetry({ spaceGroup: { hermannMauguin: 'P 1 2 1' } }, cell))
    expect(resolved).toHaveLength(2)
    const explicit = resolveSymmetry(
      { operations: [identity, inversion], spaceGroup: { itNumber: 1 } },
      cell
    )
    expect(explicit.ok).toBe(true)
    expect(explicit.diagnostics[0].code).toBe('SYMMETRY_IDENTIFIER_CONFLICT')
    expect(resolveSymmetry(undefined, cell).diagnostics[0].code).toBe('SYMMETRY_IDENTITY_ASSUMED')
    expect(
      resolveSymmetry({ spaceGroup: { hallSymbol: 'not-a-setting' } }, cell).diagnostics[0].code
    ).toBe('SYMMETRY_UNRESOLVED')
    for (const invalid of [
      1,
      null,
      { spaceGroup: { hallSymbol: 7 } },
      { spaceGroup: [] },
      { spaceGroup: { itNumber: 0 } }
    ])
      expect(resolveSymmetry(invalid as unknown as SymmetryInformation, cell).ok).toBe(false)
  })

  it('normalizes only derived representatives and preserves reversible original integer shifts', () => {
    const snapshot = crystal([{ id: 'a', element: 'C', fractional: [1.25, -0.25, 0.5] }])
    const before = JSON.stringify(snapshot)
    const instances = value(
      deriveInstances(snapshot, {
        neighborCells: [
          [1, 0, 0],
          [1, 0, 0],
          [0, 0, 0]
        ]
      })
    )
    expect(instances).toHaveLength(4)
    const e = instances.find(
      (instance) => instance.symmetryOperationId === 'e' && instance.fractional![0] < 1
    )!
    expect(e.fractional).toEqual([0.25, 0.75, 0.5])
    expect(e.integerCellOffset).toEqual([-1, 1, 0])
    expect(value(sourcePositionFromInstance(snapshot, e, e.cartesian))).toEqual([1.25, -0.25, 0.5])
    expect(JSON.stringify(snapshot)).toBe(before)
    const reordered = crystal([...snapshot.atoms].reverse(), [inversion, identity])
    expect(
      value(
        deriveInstances(reordered, {
          neighborCells: [
            [0, 0, 0],
            [1, 0, 0]
          ]
        })
      )
    ).toEqual(instances)
  })

  it('merges special positions only within the same source and physical cell', () => {
    const snapshot = crystal([
      { id: 'a', label: 'same', element: 'C', fractional: [0, 0, 0] },
      { id: 'b', label: 'same', element: 'O', fractional: [0, 0, 0] }
    ])
    const instances = value(deriveInstances(snapshot, { neighborCells: [[1, 0, 0]] }))
    expect(instances).toHaveLength(4)
    expect(instances.every((instance) => instance.equivalentSources.length === 2)).toBe(true)
    expect(new Set(instances.map((instance) => instance.id)).size).toBe(4)
    expect(
      instances
        .filter((instance) => instance.sourceAtomId === 'a')
        .map((instance) => instance.cartesian[0])
        .sort((a, b) => a - b)
    ).toEqual([0, 10])
  })

  it('applies closed fraction cutoff boundaries and validates malformed widths and cells', () => {
    const snapshot = crystal([{ id: 'a', element: 'C', fractional: [0, 0, 0] }], [identity])
    const instances = value(
      deriveInstances(snapshot, {
        neighborCells: [
          [-1, 0, 0],
          [1, 0, 0],
          [2, 0, 0]
        ],
        cutoff: { kind: 'fraction', width: [0, 0, 0] }
      })
    )
    expect(instances.map((instance) => instance.fractional![0]).sort((a, b) => a - b)).toEqual([
      0, 1
    ])
    expect(deriveInstances(snapshot, { cutoff: { kind: 'fraction', width: [-1, 0, 0] } }).ok).toBe(
      false
    )
    expect(deriveInstances(snapshot, { cutoff: { kind: 'fraction' } as never }).ok).toBe(false)
    expect(deriveInstances(snapshot, { cutoff: null as never }).ok).toBe(false)
    expect(deriveInstances(snapshot, { neighborCells: [[0.5, 0, 0]] }).ok).toBe(false)
  })

  it('inverts a nonidentity display edit without replacing the source identity', () => {
    const swap = value(parseSymmetryOperation('y,x,z', 'swap'))
    const snapshot = crystal(
      [{ id: 'a', element: 'C', fractional: [1.25, 0.125, 0.5] }],
      [identity, swap]
    )
    const instance = value(deriveInstances(snapshot)).find(
      (entry) => entry.symmetryOperationId === 'swap'
    )!
    const source = value(sourcePositionFromInstance(snapshot, instance, [2, 4, 5]))
    expect(source[0]).toBeCloseTo(1.4, 12)
    expect(source[1]).toBeCloseTo(0.2, 12)
    expect(source[2]).toBeCloseTo(0.5, 12)
    expect(value(resolveBondEndpoint(snapshot, instance))).toEqual({
      fractional: instance.fractional,
      cartesian: instance.cartesian
    })
    expect(sourcePositionFromInstance(null as never, instance, [0, 0, 0]).ok).toBe(false)
    expect(
      sourcePositionFromInstance(snapshot, { ...instance, sourceAtomId: 'missing' }, [0, 0, 0]).ok
    ).toBe(false)
  })

  it('keeps nonperiodic coordinates explicit and rejects periodic options', () => {
    const snapshot = {
      kind: 'molecular' as const,
      atoms: [{ id: 'm', element: 'C', cartesian: [-2, 4, 7] as const }],
      bonds: []
    }
    const instance: AtomInstance = value(deriveInstances(snapshot))[0]
    expect(instance.fractional).toBeUndefined()
    expect(instance.integerCellOffset).toEqual([0, 0, 0])
    expect(value(sourcePositionFromInstance(snapshot, instance, [1, 2, 3]))).toEqual([1, 2, 3])
    expect(deriveInstances(snapshot, { neighborCells: [[1, 0, 0]] }).ok).toBe(false)
  })
})
