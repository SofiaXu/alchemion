import { elementData } from './elements'
import { vanDerWaalsRadii } from './vdw-radii'
import { spaceGroupData } from './space-groups'
import type { ElementRecord, SpaceGroupSetting } from './types'
import type { SymmetryOperation } from '../types'

/** Scientific defaults cannot be changed through references returned to callers. */
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item)
    Object.freeze(value)
  }
  return value
}

export const ELEMENTS: readonly ElementRecord[] = freeze(
  elementData.map((element) => ({
    ...element,
    ...(vanDerWaalsRadii[element.symbol] === undefined
      ? {}
      : {
          vanDerWaalsRadius: {
            value: vanDerWaalsRadii[element.symbol],
            provenance: {
              source:
                'https://github.com/lmmentel/mendeleev-data/tree/67e08702c5e9e8541d9944824b10edfb718d61e8',
              version: 'mendeleev-data 1.1.0 Alvarez/Vogt',
              reference: '10.1039/C3DT50599E; 10.1021/ic501364h; see VDW_DATA_MANIFEST.json'
            }
          }
        })
  }))
)
const elementsBySymbol = new Map(ELEMENTS.map((element) => [element.symbol, element]))
export function getElement(symbol: string): ElementRecord | undefined {
  return elementsBySymbol.get(symbol)
}

const provenance = freeze({
  source: 'https://github.com/spglib/spglib/tree/v2.6.0',
  version: 'spglib 2.6.0',
  reference: 'Hall 1–530; BSD-3-Clause; see THIRD_PARTY_NOTICES.md'
})

export const SPACE_GROUP_SETTINGS: readonly SpaceGroupSetting[] = freeze(
  spaceGroupData.map((setting) => ({
    ...setting,
    operations: setting.operations.map(
      (encoded, index): SymmetryOperation => ({
        id: `hall:${setting.hallNumber}:${index}`,
        rotation: [
          [encoded[0], encoded[1], encoded[2]],
          [encoded[3], encoded[4], encoded[5]],
          [encoded[6], encoded[7], encoded[8]]
        ],
        translation: [
          { numerator: encoded[9], denominator: encoded[10] },
          { numerator: encoded[11], denominator: encoded[12] },
          { numerator: encoded[13], denominator: encoded[14] }
        ],
        provenance
      })
    )
  }))
)

export function getSpaceGroupSetting(hallNumber: number): SpaceGroupSetting | undefined {
  return Number.isInteger(hallNumber) ? SPACE_GROUP_SETTINGS[hallNumber - 1] : undefined
}

export type { ElementRecord, SpaceGroupSetting } from './types'
