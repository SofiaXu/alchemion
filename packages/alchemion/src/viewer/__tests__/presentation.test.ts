import { describe, expect, it } from 'vitest'
import { deriveStructure } from '../../core/bonds'
import type { ScientificResult, StructureSnapshot } from '../../core/types'
import { createRenderFrame } from '../frame'
import { DEFAULT_OPTIONS, derivationOptions, mergeOptions, validateCamera } from '../options'
const value = <T>(result: ScientificResult<T>): T => {
  if (!result.ok) throw new Error(result.diagnostics[0].message)
  return result.value
}
describe('M5 presentation logic', () => {
  it('isolates validated options and rejects invalid numeric/color/camera input before display mutation', () => {
    const patch = { elementStyles: { C: { color: '#ff0000', spaceFillingRadius: 2 } } }
    const options = mergeOptions(DEFAULT_OPTIONS, patch)
    patch.elementStyles.C.color = '#000000'
    expect(options.elementStyles.C.color).toBe('#ff0000')
    for (const invalid of [
      { atomScale: NaN },
      { cutoff: { kind: 'fraction', width: [-1, 0, 0] } },
      { elementStyles: { C: { color: 'red' } } },
      { neighborCells: [[0.5, 0, 0]] },
      { unknown: true }
    ])
      expect(() => mergeOptions(options, invalid as never)).toThrow()
    expect(() =>
      validateCamera({
        position: [0, 0, 0],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fovYDegrees: 45,
        near: 0.1,
        far: 100
      })
    ).toThrow()
  })
  it('uses vdW display radii with explicit visual fallbacks and real source/bond mappings', () => {
    const source: StructureSnapshot = {
      kind: 'molecular',
      atoms: [
        { id: 'a', element: 'C', cartesian: [0, 0, 0] },
        { id: 'b', element: 'Og', cartesian: [2, 0, 0] }
      ],
      bonds: [
        {
          id: 'ab',
          order: 'single',
          endpoints: [
            { sourceAtomId: 'a', symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] },
            { sourceAtomId: 'b', symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] }
          ]
        }
      ]
    }
    const derived = value(deriveStructure(source, { inferBonds: false }))
    const filled = createRenderFrame(source, derived, DEFAULT_OPTIONS)
    expect(filled.frame.atoms.map((atom) => atom.radius)).toEqual([1.77, 1.5])
    expect(filled.diagnostics[0].code).toBe('VDW_RADIUS_MISSING')
    const options = mergeOptions(DEFAULT_OPTIONS, {
      renderMode: 'ball-and-stick',
      elementStyles: { C: { color: '#ff0000', ballRadius: 0.7 } }
    })
    const sticks = createRenderFrame(source, derived, options)
    expect(sticks.frame.atoms[0]).toMatchObject({ radius: 0.7, color: [1, 0, 0] })
    expect(sticks.frame.bonds[0]).toMatchObject({
      a: [0, 0, 0],
      b: [2, 0, 0],
      bond: { sourceBondId: 'ab' }
    })
    expect(
      derivationOptions(source, mergeOptions(options, { neighborCells: [[1, 0, 0]] }))
    ).toEqual({ inferBonds: true })
  })
})
