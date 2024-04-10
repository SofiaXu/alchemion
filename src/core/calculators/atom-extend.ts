import { IElement } from '../elements'
import { IAtom } from '../structure'

export interface IAtomExtend extends IAtom {
  mass: number
  valence: number
  x: number
  y: number
  z: number
  fractionalX: number
  fractionalY: number
  fractionalZ: number
  occupancy?: number | false
  temperatureFactor?: number | false
  element: IElement
  name: string
  shadowFrom?: IAtom
  shadowBySymOp?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
}
