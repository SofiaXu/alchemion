import { bvparmJson } from './bvparm'
import { elementsJson } from './elements'

/**
 * 化学元素
 */
export interface IElement {
  /**
   * 原子序数
   */
  id: number
  /**
   * 原子符号
   */
  symbol: string
  /**
   * 原子区块
   */
  block: 's' | 'p' | 'd' | 'f'
  /**
   * 金属元素
   */
  isMetal: boolean
  /**
   * 化合价
   */
  valence: number
  /**
   * 原子量
   */
  mass: number
  /**
   * 原子半径
   */
  radius: number
  /**
   * 原子电负性
   */
  electronegativity: number
  /**
   * 可化合元素
   */
  bondElements: number[]
}
export const elements = elementsJson as ReadonlyArray<Readonly<IElement>>
const _elementsMap = new Map<string, Readonly<IElement>>()
elements.forEach((element) => {
  _elementsMap.set(element.symbol, element)
})
export const elementsMap: ReadonlyMap<string, Readonly<IElement>> = _elementsMap
export interface IBvParameter {
  source: string
  target: string
  sourceValence: number
  targetValence: number
  ro: number
  b: number
}
export const bvParameters = bvparmJson as ReadonlyArray<Readonly<IBvParameter>>
const _bvParametersMap = new Map<string, Readonly<IBvParameter>>()
bvParameters.forEach((bvParameter) => {
  _bvParametersMap.set(`${bvParameter.source}-${bvParameter.target}`, bvParameter)
})
export const bvParametersMap = _bvParametersMap
