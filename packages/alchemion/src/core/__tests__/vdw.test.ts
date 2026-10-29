import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ELEMENTS, getElement } from '../data'

describe('M5 compiled Alvarez/Vogt display radii', () => {
  it('preserves compiled Å values, all missing elements, and immutable provenance without changing covalent radii', () => {
    // Independent transcription of the fixed reference convention, not generated SDK output.
    const reference = {
      H: 1.2,
      C: 1.77,
      O: 1.5,
      Fe: 2.44,
      U: 2.71,
      Ne: 1.58,
      Ar: 1.94,
      Kr: 2.07,
      Xe: 2.28
    }
    for (const [symbol, expected] of Object.entries(reference)) {
      const radius = getElement(symbol)!.vanDerWaalsRadius!
      expect(radius.value).toBe(expected)
      expect(radius.provenance.version).toBe('mendeleev-data 1.1.0 Alvarez/Vogt')
      expect(Object.isFrozen(radius)).toBe(true)
    }
    expect(ELEMENTS.filter((e) => e.vanDerWaalsRadius)).toHaveLength(94)
    expect(ELEMENTS.filter((e) => !e.vanDerWaalsRadius).map((e) => e.symbol)).toEqual([
      'Pm',
      'Po',
      'At',
      'Fr',
      'Ra',
      'Fm',
      'Md',
      'No',
      'Lr',
      'Rf',
      'Db',
      'Sg',
      'Bh',
      'Hs',
      'Mt',
      'Ds',
      'Rg',
      'Cn',
      'Nh',
      'Fl',
      'Mc',
      'Lv',
      'Ts',
      'Og'
    ])
    expect(getElement('C')!.covalentRadius!.value).toBe(0.76)
    expect(getElement('Og')!.covalentRadius).toBeUndefined()
  })
  it('ships a reproducible data/license ledger for only the new table', () => {
    const root = fileURLToPath(new URL('../../../../../', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(`${root}/packages/alchemion/VDW_DATA_MANIFEST.json`, 'utf8')
    )
    expect(manifest.revision).toBe('67e08702c5e9e8541d9944824b10edfb718d61e8')
    expect(manifest.counts).toEqual({ elements: 118, present: 94, missing: 24 })
    for (const [path, expected] of Object.entries(manifest.outputs))
      expect(
        createHash('sha256')
          .update(readFileSync(`${root}/${path}`, 'utf8').replace(/\r\n/g, '\n'))
          .digest('hex')
      ).toBe(expected)
    expect(
      createHash('sha256')
        .update(
          readFileSync(`${root}/packages/alchemion/src/core/data/VDW_LICENSE.txt`, 'utf8').replace(
            /\r\n/g,
            '\n'
          )
        )
        .digest('hex')
    ).toBe(manifest.sources.LICENSE.sha256)
  })
})
