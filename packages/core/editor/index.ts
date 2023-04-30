import { Structure } from '../structure'
import { IDisposable } from '../utils/disposable'
export interface IEditorOptions {
  rendererType?: 'ball-and-stick' | 'space-filling'
  showAxes?: boolean
  showBounding?: boolean
}

export interface IRenderer extends IDisposable {
  render(structure: Structure): void
}

export interface IEditor extends IDisposable {
  set renderer(renderer: IRenderer)
  get renderer(): Readonly<IRenderer>
  set showAxes(show: boolean)
  get showAxes(): boolean
  get structures(): ReadonlyMap<string, Structure>
  loadStructure(structure: Structure): void
  removeStructure(id: string): void
  clearStructures(): void
  centerStructure(id: string): void
}
