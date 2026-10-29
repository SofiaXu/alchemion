import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { ELEMENTS, getElement, getSpaceGroupSetting, SPACE_GROUP_SETTINGS } from '../data'
import manifest from '../data/manifest.json'
import type { SymmetryOperation } from '../types'

// This independently checks finite affine-group closure using integer arithmetic
// on a shared denominator. It does not call the production symmetry parser/math.
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}
const mod = (a: number, divisor: number) => ((a % divisor) + divisor) % divisor
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1].join(',') + ':0,0,0'
const key = (rotation: readonly number[], translation: readonly number[], denominator: number) =>
  rotation.join(',') + ':' + translation.map((n) => mod(n, denominator)).join(',')

function encode(operation: SymmetryOperation, denominator: number) {
  return {
    rotation: operation.rotation.flat(),
    translation: operation.translation.map(
      (rational) => (rational.numerator * denominator) / rational.denominator
    )
  }
}

describe('T-DATA-01 verified M3 scientific tables', () => {
  test('118 current elements, sourced masses and explicitly missing radii', () => {
    expect(ELEMENTS).toHaveLength(118)
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118)
    expect(ELEMENTS.map((e) => e.atomicNumber)).toEqual(
      Array.from({ length: 118 }, (_, index) => index + 1)
    )
    expect(ELEMENTS.filter((e) => e.covalentRadius).map((e) => e.atomicNumber)).toEqual(
      Array.from({ length: 96 }, (_, index) => index + 1)
    )
    for (const element of ELEMENTS) {
      expect(element.mass.value).toBeGreaterThan(0)
      expect(Number.isFinite(element.mass.value)).toBe(true)
      expect(element.mass.provenance.version).toContain('2.0.2')
      if (element.mass.kind === 'representative-isotope') {
        expect(Number.isSafeInteger(element.mass.isotopeMassNumber)).toBe(true)
      } else {
        expect(element.mass.isotopeMassNumber).toBeUndefined()
      }
      if (element.covalentRadius) {
        expect(element.covalentRadius.value).toBeGreaterThan(0)
        expect(element.covalentRadius.standardUncertainty).toBeGreaterThanOrEqual(0)
        expect(element.covalentRadius.provenance.reference).toBe('10.1039/B801115J')
      }
      expect(Object.isFrozen(element)).toBe(true)
    }
    // Values are independently transcribed from the fixed upstream Cordero table.
    for (const [symbol, radius] of [
      ['H', 0.31],
      ['C', 0.76],
      ['O', 0.66],
      ['Fe', 1.32],
      ['Cm', 1.69]
    ] as const) {
      expect(getElement(symbol)?.covalentRadius?.value).toBe(radius)
    }
    expect(getElement('Ra')?.covalentRadius?.value).toBe(2.21)
    expect(getElement('Og')?.covalentRadius).toBeUndefined()
    expect(getElement('Og')?.mass.kind).toBe('representative-isotope')
    expect(getElement('C')?.mass.kind).toBe('standard-atomic-weight')
    expect(getElement('Unkonwn')).toBeUndefined()
    expect(ELEMENTS.slice(112).map((e) => e.symbol)).toEqual(['Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og'])
  })

  test('all 530 Hall settings form exact finite affine groups modulo cell translations', () => {
    expect(SPACE_GROUP_SETTINGS).toHaveLength(530)
    expect(new Set(SPACE_GROUP_SETTINGS.map((s) => s.itNumber)).size).toBe(230)
    let checkedCompositions = 0
    for (const setting of SPACE_GROUP_SETTINGS) {
      expect(getSpaceGroupSetting(setting.hallNumber)).toBe(setting)
      expect(setting.hallSymbol.length).toBeGreaterThan(0)
      const denominator = setting.operations
        .flatMap((operation) => operation.translation)
        .reduce(
          (common, rational) => (common * rational.denominator) / gcd(common, rational.denominator),
          1
        )
      const operations = setting.operations.map((op) => encode(op, denominator))
      const keys = new Set(operations.map((op) => key(op.rotation, op.translation, denominator)))
      expect(keys.size).toBe(operations.length)
      expect(keys.has(identity)).toBe(true)
      expect(new Set(setting.operations.map((op) => op.id)).size).toBe(operations.length)
      for (const operation of setting.operations) {
        const [a, b, c] = operation.rotation
        const det =
          a[0] * (b[1] * c[2] - c[1] * b[2]) -
          b[0] * (a[1] * c[2] - c[1] * a[2]) +
          c[0] * (a[1] * b[2] - b[1] * a[2])
        expect(Math.abs(det)).toBe(1)
        expect(operation.rotation.flat().every(Number.isSafeInteger)).toBe(true)
        expect(operation.provenance?.version).toBe('spglib 2.6.0')
        for (const rational of operation.translation) {
          expect(Number.isSafeInteger(rational.numerator)).toBe(true)
          expect(Number.isSafeInteger(rational.denominator)).toBe(true)
          expect(rational.denominator).toBeGreaterThan(0)
          expect(gcd(Math.abs(rational.numerator), rational.denominator)).toBe(1)
        }
      }
      for (const a of operations) {
        let hasInverse = false
        for (const b of operations) {
          const rotation: number[] = []
          for (let column = 0; column < 3; column++) {
            for (let row = 0; row < 3; row++) {
              rotation.push(
                a.rotation[row] * b.rotation[column * 3] +
                  a.rotation[row + 3] * b.rotation[column * 3 + 1] +
                  a.rotation[row + 6] * b.rotation[column * 3 + 2]
              )
            }
          }
          const translation = [0, 1, 2].map(
            (row) =>
              a.translation[row] +
              a.rotation[row] * b.translation[0] +
              a.rotation[row + 3] * b.translation[1] +
              a.rotation[row + 6] * b.translation[2]
          )
          const composition = key(rotation, translation, denominator)
          if (!keys.has(composition)) throw new Error(`Hall ${setting.hallNumber} is not closed.`)
          hasInverse ||= composition === identity
          checkedCompositions++
        }
        if (!hasInverse)
          throw new Error(`Hall ${setting.hallNumber} contains an operation without inverse.`)
      }
    }
    expect(checkedCompositions).toBeGreaterThan(100_000)
    expect(SPACE_GROUP_SETTINGS.filter((s) => s.itNumber === 166).map((s) => s.choice)).toEqual([
      'H',
      'R'
    ])
    expect(getSpaceGroupSetting(0)).toBeUndefined()
    expect(getSpaceGroupSetting(531)).toBeUndefined()
    expect(getSpaceGroupSetting(1.1)).toBeUndefined()
  }, 20_000)

  test('generated bytes and package manifest match their provenance ledger', () => {
    const root = fileURLToPath(new URL('../../../../../', import.meta.url))
    for (const [path, expected] of Object.entries(manifest.outputs)) {
      // Canonical UTF-8/LF digests also hold in Windows checkouts with Git autocrlf.
      expect(
        createHash('sha256')
          .update(readFileSync(`${root}/${path}`, 'utf8').replace(/\r\n/g, '\n'))
          .digest('hex')
      ).toBe(expected)
    }
    expect(manifest.counts).toEqual({
      elements: 118,
      covalentRadii: 96,
      hallSettings: 530,
      internationalNumbers: 230,
      operations: 7388
    })
    expect(manifest.maximumTranslationRationalizationError).toBe(0)
    expect(manifest.tools).toEqual({
      numpy: '2.2.6',
      scipy: '1.15.3',
      spglib: '2.6.0',
      periodictable: '2.0.2'
    })
    expect(
      JSON.parse(readFileSync(`${root}/packages/alchemion/SCIENTIFIC_DATA_MANIFEST.json`, 'utf8'))
    ).toEqual(manifest)
    const notices = readFileSync(`${root}/packages/alchemion/THIRD_PARTY_NOTICES.md`, 'utf8')
    expect(notices).toContain('Copyright (c) 2024, Spglib team')
    expect(notices).toContain('10.1039/B801115J')
  })
})
