import { AtomColorMap, IColorMap } from '../../internal/legacy/colors'
import { IDifferentRenderer } from '../contracts'
import { IAtom, IStructure } from '../../internal/legacy/structure'
import {
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core'

export class SpaceFillingRenderer implements IDifferentRenderer {
  private _scene: Scene
  private _atomColorMap: IColorMap = new AtomColorMap()
  private _transformNode: TransformNode
  id
  constructor(scene: Scene) {
    this._scene = scene
    this.id = 'space-filling'
    this._transformNode = new TransformNode(this.id, scene)
  }
  async renderAdd(atoms: IAtom[]) {
    let index = 0
    await new Promise<void>((resolve) => {
      const renderLoop = () => {
        const max = Math.min(index + 50, atoms.length)
        for (index; index < max; index++) {
          this.renderAtom(atoms[index])
        }
        if (index < atoms.length) {
          requestAnimationFrame(renderLoop)
        } else {
          resolve()
        }
      }
      renderLoop()
    })
  }
  async renderRemove(atoms: IAtom[]) {
    atoms.forEach((atom) => {
      const mesh = this._transformNode.getChildMeshes().find((m) => m.name === atom.name)
      if (mesh) {
        mesh.dispose()
      }
    })
  }
  async render(structure: IStructure) {
    const { atoms } = structure
    await this.renderAdd(atoms)
  }
  dispose(): void {
    this._scene.removeTransformNode(this._transformNode)
    this._transformNode.dispose()
    return
  }
  private renderAtom(atom: Readonly<IAtom>): void {
    let material = this._scene.getMaterialById('atom-color-' + atom.element.id) as StandardMaterial
    if (!material) {
      material = new StandardMaterial('atom-color-' + atom.element.id, this._scene)
      const color = this._atomColorMap.get(atom.element.id)
      material.emissiveColor = new Color3(color.red, color.green, color.blue)
    }
    const sphere = MeshBuilder.CreateSphere(
      atom.name,
      { diameter: atom.element.radius * 2 },
      this._scene
    )
    sphere.material = material
    sphere.metadata = atom
    sphere.position = new Vector3(atom.x, atom.y, atom.z)
    sphere.parent = this._transformNode
  }
  clear(): void {
    this._transformNode.getChildMeshes().forEach((mesh) => mesh.dispose())
  }
}
