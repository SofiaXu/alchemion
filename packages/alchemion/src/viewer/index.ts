import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { SpaceFillingRenderer } from './renders/index'
import { IDifferentRenderer, IEditor, IEditorOptions, IRenderer } from './contracts'
import { IAtom, IBond, IStructure } from '../internal/legacy/structure'
import {
  Color3,
  Color4,
  HighlightLayer,
  Mesh,
  MeshBuilder,
  Tools,
  TransformNode
} from '@babylonjs/core'
import { LatticeRenderer } from './renders/lattice'
import { ReciprocalLatticeRenderer } from './renders/reciprocal-lattice'
import { Observable, Subject } from 'rxjs'
import { elements, elementsMap, IElement } from '../internal/legacy/elements'

export class AlchemionEditor implements IEditor {
  private _engine: Engine
  private _canvas: HTMLCanvasElement
  private _renderer: IRenderer
  private _scene: Scene
  private _mainCamera: ArcRotateCamera
  private _structure?: IStructure
  private _shadowStructure?: IStructure
  private _latticeRenderer?: IRenderer
  private _reciprocalLatticeRenderer?: IRenderer
  private _highlightLayer: HighlightLayer
  private _lastPicks: Mesh[] = []
  private _measureTransformNode: TransformNode
  private _distance: Subject<number>
  private _angle: Subject<number>
  private _point: Subject<[number, number, number]>
  private _pickedAtom: Subject<IAtom | undefined>
  private _fps: Subject<number>
  private _status: Subject<'computing' | 'completed' | 'empty'>
  private _calculator: Worker
  private _disposed = false
  private _options: IEditorOptions = {
    rendererType: 'space-filling',
    showLattice: false,
    showReciprocalLattice: false,
    showNeighborCells: false,
    showSymmetryMates: false,
    neighborCells: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
      [-1, -1, 0],
      [-1, 0, -1],
      [0, -1, -1],
      [-1, -1, -1],
      [1, -1, 0],
      [1, 0, -1],
      [0, 1, -1],
      [1, -1, -1],
      [-1, 1, 0],
      [-1, 0, 1],
      [0, -1, 1],
      [-1, 1, 1],
      [1, -1, 1],
      [1, 1, -1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1]
    ],
    unitCellCutoffMethod: 'bond',
    unitCellCutoffFraction: [0.2, 0.2, 0.2],
    autoComputeBonds: false,
    showFps: false,
    clickMode: 'none'
  }
  rotateStep = 0.1
  zoomStep = 0.1
  constructor(canvas: HTMLDivElement | string, options?: Partial<IEditorOptions>) {
    const container = typeof canvas === 'string' ? document.querySelector(canvas) : canvas
    if (!container) throw Error("Unable to create editor. Container element doesn't exist.")
    if (options) {
      this._options = { ...this._options, ...options }
    }
    this._canvas = document.createElement('canvas')
    this._canvas.style.width = '100%'
    this._canvas.style.height = '100%'
    if (!this._canvas.getContext('webgl2', { stencil: true, antialias: true })) {
      throw new Error('WEBGL2_UNAVAILABLE: Alchemion requires WebGL2.')
    }
    let engine: Engine | undefined
    try {
      container.appendChild(this._canvas)
      this._engine = engine = new Engine(this._canvas, true, { stencil: true })
      this._calculator = new Worker(new URL('./calculators/index.ts', import.meta.url), {
        type: 'module'
      })
    } catch (error) {
      engine?.dispose()
      this._canvas.remove()
      throw error
    }
    this._scene = new Scene(this._engine)
    this._scene.clearColor = Color4.FromHexString('#ffffff')
    this._scene.useRightHandedSystem = true
    this._mainCamera = new ArcRotateCamera('Camera', 0, 0, 1, new Vector3(0, 0, 0), this._scene)
    this._mainCamera.setPosition(new Vector3(0, 10, 10))
    this._mainCamera.attachControl(this._canvas, true)
    this._renderer = new SpaceFillingRenderer(this._scene)
    this._highlightLayer = new HighlightLayer('highlight', this._scene)
    this._measureTransformNode = new TransformNode('measure-transform', this._scene)
    this._distance = new Subject<number>()
    this._angle = new Subject<number>()
    this._point = new Subject<[number, number, number]>()
    this._pickedAtom = new Subject<IAtom | undefined>()
    this._fps = new Subject<number>()
    this._status = new Subject<'computing' | 'completed' | 'empty'>()
    this._calculator.onmessage = async (
      e: MessageEvent<{
        method: 'load' | 'loadOptions' | 'addAtom' | 'removeAtom'
        shadowStructure?: IStructure
        atoms?: IAtom[]
        bonds?: IBond[]
      }>
    ) => {
      switch (e.data.method) {
        case 'load': {
          this.renderer.clear()
          if (!e.data.shadowStructure) break
          this._shadowStructure = e.data.shadowStructure
          if (this._options.showLattice) {
            if (!this._latticeRenderer) this._latticeRenderer = new LatticeRenderer(this._scene)
            if (this._shadowStructure) {
              this._latticeRenderer.render(this._shadowStructure)
            }
          } else {
            this._latticeRenderer?.clear()
          }
          if (this._options.showReciprocalLattice) {
            if (!this._reciprocalLatticeRenderer)
              this._reciprocalLatticeRenderer = new ReciprocalLatticeRenderer(this._scene)
            if (this._shadowStructure) {
              this._reciprocalLatticeRenderer.render(this._shadowStructure)
            }
          }
          await this.renderer.render(this._shadowStructure)
          break
        }
        case 'loadOptions': {
          if (!e.data.atoms || !e.data.bonds || !e.data.shadowStructure) break
          this._shadowStructure = e.data.shadowStructure
          const renderer = this.renderer as IDifferentRenderer
          if (renderer.renderRemove) {
            renderer.renderRemove(e.data.atoms, e.data.bonds)
          } else {
            this._renderer.clear()
            this._renderer.render(e.data.shadowStructure)
          }
          break
        }
        case 'addAtom': {
          if (!e.data.atoms || !e.data.bonds || !e.data.shadowStructure) break
          this._shadowStructure = e.data.shadowStructure
          const renderer = this.renderer as IDifferentRenderer
          if (renderer.renderAdd) {
            renderer.renderAdd(e.data.atoms, e.data.bonds)
          } else {
            this._renderer.clear()
            this._renderer.render(e.data.shadowStructure)
          }
          break
        }
        case 'removeAtom': {
          if (!e.data.atoms || !e.data.bonds || !e.data.shadowStructure) break
          this._shadowStructure = e.data.shadowStructure
          const renderer = this.renderer as IDifferentRenderer
          if (renderer.renderRemove) {
            renderer.renderRemove(e.data.atoms, e.data.bonds)
          } else {
            this._renderer.clear()
            this._renderer.render(e.data.shadowStructure)
          }
          break
        }
      }
      this._status.next('completed')
    }
    this._status.next('empty')
    this._engine.runRenderLoop(() => {
      this._scene.render()
      if (this._options.showFps) {
        this._fps.next(this._engine.getFps())
      }
    })
    this._scene.onPointerObservable.add((pointerInfo) => {
      switch (this._options.clickMode) {
        case 'select': {
          if (pointerInfo.type !== 1) {
            break
          }
          if (pointerInfo.pickInfo) {
            if (pointerInfo.pickInfo.hit && pointerInfo.pickInfo.pickedMesh) {
              const mesh = pointerInfo.pickInfo.pickedMesh as Mesh
              if (this._highlightLayer.hasMesh(mesh)) {
                this._pickedAtom.next(undefined)
                this._highlightLayer.removeMesh(mesh)
              } else {
                this._highlightLayer.removeAllMeshes()
                this._highlightLayer.addMesh(mesh, Color3.Green())
                const atom = this._structure?.atoms.find((atom) => atom.name === mesh.name)
                if (atom) {
                  this._pickedAtom.next(atom)
                }
              }
            }
          }
          break
        }
        case 'measure-distance': {
          if (pointerInfo.type !== 1) {
            break
          }
          if (pointerInfo.pickInfo) {
            if (pointerInfo.pickInfo.hit && pointerInfo.pickInfo.pickedMesh) {
              const mesh = pointerInfo.pickInfo.pickedMesh as Mesh
              if (this._highlightLayer.hasMesh(mesh)) {
                this._highlightLayer.removeMesh(mesh)
                this._lastPicks = []
                break
              } else {
                this._highlightLayer.removeAllMeshes()
                this._highlightLayer.addMesh(mesh, Color3.Green())
              }
              if (this._lastPicks.length > 0) {
                if (this._measureTransformNode.getChildren().length > 0) {
                  this._measureTransformNode.getChildren().forEach((child) => child.dispose())
                }
                const lastMesh = this._lastPicks[0]
                const distanceLine = MeshBuilder.CreateLines(
                  'distance-line',
                  {
                    points: [lastMesh.position, mesh.position],
                    updatable: true
                  },
                  this._scene
                )
                distanceLine.color = Color3.Red()
                distanceLine.isPickable = false
                this._distance.next(Vector3.Distance(lastMesh.position, mesh.position))
                distanceLine.parent = this._measureTransformNode
                this._lastPicks = []
              } else {
                this._lastPicks.push(mesh)
              }
            }
          }
          break
        }
        case 'measure-angle': {
          if (pointerInfo.type !== 1) {
            break
          }
          if (pointerInfo.pickInfo) {
            if (pointerInfo.pickInfo.hit && pointerInfo.pickInfo.pickedMesh) {
              const mesh = pointerInfo.pickInfo.pickedMesh as Mesh
              if (this._highlightLayer.hasMesh(mesh)) {
                this._highlightLayer.removeMesh(mesh)
                this._lastPicks = []
                break
              } else {
                this._highlightLayer.removeAllMeshes()
                this._highlightLayer.addMesh(mesh, Color3.Green())
              }
              this._lastPicks.push(mesh)
              if (this._lastPicks.length === 2) {
                if (this._measureTransformNode.getChildren().length > 0) {
                  this._measureTransformNode.getChildren().forEach((child) => child.dispose())
                }
                const [a, b] = this._lastPicks
                const line = MeshBuilder.CreateLines(
                  'angle-line-1',
                  {
                    points: [a.position, b.position],
                    updatable: true
                  },
                  this._scene
                )
                line.color = Color3.Red()
                line.isPickable = false
                line.parent = this._measureTransformNode
              }
              if (this._lastPicks.length === 3) {
                if (this._measureTransformNode.getChildren().length > 0) {
                  this._measureTransformNode.getChildren().forEach((child) => child.dispose())
                }
                const [a, b, c] = this._lastPicks
                const line1 = MeshBuilder.CreateLines(
                  'angle-line-1',
                  {
                    points: [a.position, b.position],
                    updatable: true
                  },
                  this._scene
                )
                line1.color = Color3.Red()
                line1.isPickable = false
                line1.parent = this._measureTransformNode
                const line2 = MeshBuilder.CreateLines(
                  'angle-line-2',
                  {
                    points: [b.position, c.position],
                    updatable: true
                  },
                  this._scene
                )
                line2.color = Color3.Red()
                line2.isPickable = false
                line2.parent = this._measureTransformNode
                const u = a.position.subtract(b.position)
                const v = c.position.subtract(b.position)
                const normal = Vector3.Cross(u, v).normalize()
                const angle = Vector3.GetAngleBetweenVectors(u, v, normal)
                this._angle.next(Tools.ToDegrees(angle))
                this._lastPicks = []
              }
            }
          }
          break
        }
        case 'pick-point': {
          if (pointerInfo.type !== 1) {
            break
          }
          if (pointerInfo.pickInfo) {
            if (pointerInfo.pickInfo.hit && pointerInfo.pickInfo.pickedMesh) {
              return
            }
            const ray = pointerInfo.pickInfo.ray
            if (!ray) {
              return
            }
            const point = ray.origin.add(ray.direction.scale(this.camera.radius))
            const { x, y, z } = point
            if (this._structure?.lattice) {
              const { a, b, c } = this._structure.lattice
              const { alpha, beta, gamma } = this._structure.lattice
              const u = new Vector3(a, 0, 0)
              const v = new Vector3(b * Math.cos(gamma), b * Math.sin(gamma), 0)
              const w = new Vector3(
                c * Math.cos(beta),
                (c * (Math.cos(alpha) - Math.cos(beta) * Math.cos(gamma))) / Math.sin(gamma),
                (c *
                  Math.sqrt(
                    1 -
                      Math.cos(alpha) ** 2 -
                      Math.cos(beta) ** 2 -
                      Math.cos(gamma) ** 2 +
                      2 * Math.cos(alpha) * Math.cos(beta) * Math.cos(gamma)
                  )) /
                  Math.sin(gamma)
              )
              const xFraction = Vector3.Dot(point, u) / a
              const yFraction = Vector3.Dot(point, v) / b
              const zFraction = Vector3.Dot(point, w) / c
              this._point.next([xFraction, yFraction, zFraction])
            } else {
              this._point.next([x, y, z])
            }
          }
          break
        }
        default: {
          break
        }
      }
    })
    window.addEventListener('resize', this.resize)
  }
  get renderer(): Readonly<IRenderer> {
    return this._renderer
  }
  set renderer(renderer: IRenderer) {
    this._renderer.clear()
    this._renderer = renderer
  }
  get structure(): Readonly<IStructure> | undefined {
    return this._structure ? structuredClone(this._structure) : undefined
  }
  private get camera(): ArcRotateCamera {
    return this._mainCamera
  }
  get center(): [number, number, number] {
    return [this._mainCamera.target.x, this._mainCamera.target.y, this._mainCamera.target.z]
  }
  set center(center: [number, number, number]) {
    this._mainCamera.setTarget(new Vector3(center[0], center[1], center[2]))
  }
  get options(): Readonly<IEditorOptions> {
    return this._options
  }
  set options(options: Partial<IEditorOptions>) {
    const newOptions = { ...this._options, ...options }
    const map = new Map(Object.entries(newOptions))
    let reload = false
    Object.entries(this._options).forEach(([key, value]) => {
      if (map.get(key) !== value) {
        if (key === 'showLattice') {
          if (newOptions.showLattice) {
            if (!this._latticeRenderer) this._latticeRenderer = new LatticeRenderer(this._scene)
            if (this._shadowStructure) {
              this._latticeRenderer.render(this._shadowStructure)
            }
          } else {
            this._latticeRenderer?.clear()
          }
          return
        }
        if (key === 'showReciprocalLattice') {
          if (newOptions.showReciprocalLattice) {
            if (!this._reciprocalLatticeRenderer)
              this._reciprocalLatticeRenderer = new ReciprocalLatticeRenderer(this._scene)
            if (this._shadowStructure) {
              this._reciprocalLatticeRenderer.render(this._shadowStructure)
            }
          } else {
            this._reciprocalLatticeRenderer?.clear()
          }
          return
        }
        if (key === 'clickMode') {
          this._highlightLayer.removeAllMeshes()
          this._lastPicks = []
          this._measureTransformNode.getChildren().forEach((child) => child.dispose())
          return
        }
        reload = true
      }
    })
    this._options = newOptions
    if (reload && this._structure) {
      this._status.next('computing')
      this.sendLoadOptions()
    }
  }
  get distance(): Observable<number> {
    return this._distance
  }
  get angle(): Observable<number> {
    return this._angle
  }
  get point(): Observable<[number, number, number]> {
    return this._point
  }
  get pickedAtom(): Observable<IAtom | undefined> {
    return this._pickedAtom
  }
  get fps(): Observable<number> {
    return this._fps
  }
  get status(): Observable<'computing' | 'completed' | 'empty'> {
    return this._status
  }
  left(): void {
    this._mainCamera.alpha += this.rotateStep
  }
  right(): void {
    this._mainCamera.alpha -= this.rotateStep
  }
  up(): void {
    this._mainCamera.beta -= this.rotateStep
  }
  down(): void {
    this._mainCamera.beta += this.rotateStep
  }
  zoomIn(): void {
    this._mainCamera.radius -= this.zoomStep
  }
  zoomOut(): void {
    this._mainCamera.radius += this.zoomStep
  }
  private resize = () => {
    this._engine.resize()
  }
  addAtom(
    point: [number, number, number],
    element: IElement | string | number,
    temperatureFactor?: number,
    occupancy?: number
  ): void {
    if (!this._structure) {
      return
    }
    const [x, y, z] = point
    let elem: IElement
    if (typeof element === 'string') {
      elem = elementsMap.get(element) ?? elements[0]
    } else if (typeof element === 'number') {
      elem = elements[element] ?? elements[0]
    } else {
      elem = element
    }
    const atom: IAtom = {
      x,
      y,
      z,
      element: elem,
      mass: elem.mass,
      valence: elem.valence,
      name:
        elem.symbol + (this._structure.atoms.filter((atom) => atom.element === elem).length + 1),
      temperatureFactor: temperatureFactor,
      occupancy: occupancy,
      metadata: {}
    }
    this._structure.atoms.push(atom)
    this.sendAddAtom(atom)
  }
  removeAtom(atom: IAtom): void {
    if (!this._structure) {
      return
    }
    this._structure.atoms = this._structure.atoms.filter(
      (a) => a.x !== atom.x && a.y !== atom.y && a.z !== atom.z
    )
    this.sendRemoveAtom(atom)
  }
  loadStructure(structure: IStructure): void {
    this.clearStructures()
    this._structure = structuredClone(structure)
    this.sendLoad()
  }
  clearStructures(): void {
    this._structure = undefined
    this._shadowStructure = undefined
    this._lastPicks = []
    this._measureTransformNode.getChildren().forEach((child) => child.dispose())
    this._highlightLayer.removeAllMeshes()
    this._renderer.clear()
    this._latticeRenderer?.clear()
    this._reciprocalLatticeRenderer?.clear()
    this._status.next('empty')
  }
  centerStructure(): void {
    const node = this._scene.getNodeById(this.renderer.id)
    if (node) {
      const boundingInfo = node.getHierarchyBoundingVectors()
      const center = boundingInfo.max.add(boundingInfo.min).scale(0.5)
      this._mainCamera.setTarget(center)
      const cameraDistance =
        boundingInfo.max.subtract(boundingInfo.min).length() / Math.tan(this._mainCamera.fov / 2)
      this._mainCamera.radius = cameraDistance
      this._mainCamera.alpha = Math.PI / 4
      this._mainCamera.beta = Math.PI / 4
    }
  }
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._calculator.onmessage = null
    this.clearStructures()
    window.removeEventListener('resize', this.resize)
    this._engine.dispose()
    this._calculator.terminate()
    this._canvas.remove()
    for (const subject of [
      this._distance,
      this._angle,
      this._point,
      this._pickedAtom,
      this._fps,
      this._status
    ])
      subject.complete()
  }
  private sendLoad(): void {
    if (!this._structure) return
    this._status.next('computing')
    this._calculator.postMessage({
      method: 'load',
      args: {
        structure: JSON.parse(JSON.stringify(this._structure)),
        options: JSON.parse(JSON.stringify(this._options))
      }
    })
  }

  private sendLoadOptions(): void {
    if (!this._structure) return
    this._status.next('computing')
    this._calculator.postMessage({
      method: 'loadOptions',
      args: JSON.parse(JSON.stringify(this._options))
    })
  }

  private sendAddAtom(atom: IAtom): void {
    if (!this._structure) return
    this._status.next('computing')
    this._calculator.postMessage({
      method: 'addAtom',
      args: [atom]
    })
  }

  private sendRemoveAtom(atom: IAtom): void {
    if (!this._structure) return
    this._status.next('computing')
    this._calculator.postMessage({
      method: 'removeAtom',
      args: [atom]
    })
  }
}

export type { IEditorOptions } from './contracts'
