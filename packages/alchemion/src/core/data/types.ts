import type { Provenance, SymmetryOperation } from '../types'

export interface ElementRecord {
  readonly atomicNumber: number
  readonly symbol: string
  readonly name: string
  readonly mass: {
    readonly value: number
    readonly kind: 'standard-atomic-weight' | 'representative-isotope'
    readonly isotopeMassNumber?: number
    readonly provenance: Provenance
  }
  readonly covalentRadius?: {
    readonly value: number
    readonly standardUncertainty?: number
    readonly provenance: Provenance
  }
  readonly vanDerWaalsRadius?: {
    readonly value: number
    readonly provenance: Provenance
  }
}

export interface SpaceGroupSetting {
  readonly hallNumber: number
  readonly itNumber: number
  readonly hermannMauguin: string
  readonly hermannMauguinFull: string
  readonly hallSymbol: string
  readonly choice: string
  readonly operations: readonly SymmetryOperation[]
}

/** Internal compact representation: nine column-major integers, then three n/d pairs. */
export interface RawSpaceGroupSetting extends Omit<SpaceGroupSetting, 'operations'> {
  readonly operations: readonly (readonly number[])[]
}
