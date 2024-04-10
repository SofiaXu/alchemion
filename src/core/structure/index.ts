import { IElement } from '../elements'
import { CrystalSystem } from './space-group-settings'
export { spaceGroupSettings, CrystalSystem } from './space-group-settings'

export interface IAtom {
  mass: number
  valence: number
  x: number
  y: number
  z: number
  occupancy?: number | false
  temperatureFactor?: number | false
  element: IElement
  name: string
  shadowFrom?: IAtom
  shadowBySymOp?: string
  shadowByCell?: [number, number, number]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
}

export interface IBond {
  source: IAtom
  target: IAtom
  type: 'single' | 'double' | 'triple' | 'aromatic'
  stereo?: 'up' | 'down' | 'either' | 'cis' | 'trans'
  topology?: 'either' | 'ring' | 'chain'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
}

export interface IStructure {
  title?: string
  lattice?: ILattice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
  atoms: IAtom[]
  bonds: IBond[]
}

export interface ISpaceGroup {
  name: string
  id: number
  settingName: string
  operations: string[]
}

export interface ILattice {
  a: number
  b: number
  c: number

  alpha: number
  beta: number
  gamma: number

  volume: number
  spaceGroup: ISpaceGroup
  crystalSystem: CrystalSystem
}
