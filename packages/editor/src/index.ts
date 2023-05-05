import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Camera } from '@babylonjs/core/Cameras/camera'
import { BallAndStickRenderer } from './renders/index'
import { IEditor, IEditorOptions, IRenderer } from '@alchemion/core/editor'
import { Structure } from '@alchemion/core/structure'
import { IParser } from '@alchemion/core/utils/io'
import { MolParser } from '@alchemion/parsers/mol-parser'
import { AxesViewer, Color4 } from '@babylonjs/core'
export class AlchemionEditor implements IEditor {
  private _engine: Engine
  private _canvas: HTMLCanvasElement
  private _renderer: IRenderer
  private _scene: Scene
  private _mainCamera: ArcRotateCamera
  private _showAxes = false
  private _axesViewer?: AxesViewer
  private _structures: Map<string, Structure> = new Map()
  constructor(canvas: HTMLCanvasElement, options?: Partial<IEditorOptions>) {
    if (!canvas) throw Error("Unable to create editor. Container element doesn't exist.")
    this._canvas = canvas
    this._engine = new Engine(this._canvas)
    this._scene = new Scene(this._engine)
    this._scene.clearColor = Color4.FromHexString('#ffffff')
    this._mainCamera = new ArcRotateCamera('Camera', 0, 0, 1, new Vector3(0, 0, 0), this._scene)
    this._mainCamera.setPosition(new Vector3(0, 10, 10))
    this._mainCamera.attachControl(this._canvas, true)
    this._renderer = new BallAndStickRenderer(this._scene)
    this.showAxes = options?.showAxes ?? false
    this._engine.runRenderLoop(() => {
      this._scene.render()
    })
  }
  set showAxes(show: boolean) {
    if (this._showAxes != show) {
      this._showAxes = show
      if (this._showAxes) {
        this._axesViewer = new AxesViewer(this._scene)
      } else {
        this._axesViewer?.dispose()
        this._axesViewer = undefined
      }
    }
  }
  get showAxes(): boolean {
    return this._showAxes
  }
  get renderer(): Readonly<IRenderer> {
    return this._renderer
  }
  set renderer(renderer: IRenderer) {
    this._renderer = renderer
  }
  get structures(): ReadonlyMap<string, Structure> {
    return this._structures
  }
  get camera(): Readonly<Camera> {
    return this._mainCamera
  }
  loadStructure(structure: Structure): void {
    this._structures.set(structure.id, structure)
    this.renderer.render(structure)
    structure.structureUpdated.addListener((e) => {
      this.renderer.update(e.type, structure, e.atom, e.bonds)
    })
  }
  removeStructure(id: string): void {
    const structure = this._structures.get(id)
    if (!structure) return
    this._structures.delete(id)
    this.renderer.update('remove', structure)
  }
  clearStructures(): void {
    this._structures.forEach((structure) => {
      this.removeStructure(structure.id)
    })
  }
  centerStructure(id: string): void {
    const node = this._scene.getNodeById(id)
    if (node) {
      const boundingInfo = node.getHierarchyBoundingVectors()
      const center = boundingInfo.max.add(boundingInfo.min).scale(0.5)
      this._mainCamera.setTarget(center)
      const cameraDistance =
        boundingInfo.max.subtract(boundingInfo.min).length() / Math.tan(this._mainCamera.fov / 2)
      this._mainCamera.radius = cameraDistance
    }
  }
  dispose(): void {
    this.clearStructures()
    this._engine.dispose()
  }
}

export const ParserRegistry: Map<string, IParser> = new Map()
ParserRegistry.set('mol', new MolParser())
