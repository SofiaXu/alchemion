import { IAtom, IBond, IStructure } from '../../internal/legacy/structure'
import { IDisposable } from '../../internal/legacy/utils'
export interface IEditorOptions {
  rendererType: 'ball-and-stick' | 'space-filling' | string
  showLattice: boolean
  showReciprocalLattice: boolean
  showNeighborCells: boolean
  neighborCells: [number, number, number][]
  unitCellCutoffMethod: 'bond' | 'fraction'
  unitCellCutoffFraction: [number, number, number]
  showSymmetryMates: boolean
  autoComputeBonds: boolean
  showFps: boolean
  clickMode:
    | 'select'
    | 'pick-point'
    | 'measure-distance'
    | 'measure-angle'
    | 'measure-torsion'
    | 'none'
}

export interface IRenderer extends IDisposable {
  render(structure: IStructure, options?: object): Promise<void>
  clear(): void
  id: string
}

export interface IDifferentRenderer extends IDisposable {
  render(structure: IStructure, options?: object): Promise<void>
  clear(): void
  id: string
  renderAdd(atoms: IAtom[], bonds: IBond[], options?: object): Promise<void>
  renderRemove(atoms: IAtom[], bonds: IBond[], options?: object): Promise<void>
}

export interface IEditor extends IDisposable {
  set renderer(renderer: IRenderer)
  get renderer(): Readonly<IRenderer>
  get structure(): Readonly<IStructure> | undefined
  loadStructure(structure: IStructure): void
  clearStructures(): void
  centerStructure(): void
}
