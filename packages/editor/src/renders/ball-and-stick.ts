import { AtomColorMap, IColorMap } from '@alchemion/core/colors'
import { IRenderer } from '@alchemion/core/editor'
import { Atom, Bond, Structure } from '@alchemion/core/structure'
import {
  Color3,
  MeshBuilder,
  Node,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core'

export class BallAndStickRenderer implements IRenderer {
  private _scene: Scene
  private _atomColorMap: IColorMap = new AtomColorMap()
  constructor(scene: Scene) {
    this._scene = scene
  }
  update(
    type: 'add' | 'update' | 'remove',
    structure: Structure,
    atom?: Readonly<Atom> | undefined,
    bond?: readonly Readonly<Bond>[] | undefined
  ): void {
    const parent = this._scene.getNodeById(structure.id)
    if (!parent) {
      throw Error(`Unable to find structure ${structure.id}`)
    }
    switch (type) {
      case 'add': {
        if (atom) {
          this.renderAtom(atom, parent)
        }
        if (bond) {
          bond.forEach((b) => {
            this.renderBond(b, parent)
          })
        }
        break
      }
      case 'update': {
        if (atom) {
          const sphere = this._scene.getMeshById(atom.id)
          if (sphere) {
            sphere.dispose()
            this.renderAtom(atom, parent)
          }
        }
        if (bond) {
          bond.forEach((b) => {
            const trans = this._scene.getNodeById(b.id)
            if (trans) {
              trans.dispose()
              this.renderBond(b, parent)
            }
          })
        }
        break
      }
      case 'remove': {
        if (atom) {
          this._scene.getMeshById(atom.id)?.dispose()
        }
        if (bond) {
          bond.forEach((b) => {
            this._scene.getNodeById(b.id)?.dispose()
          })
        }
        if (!atom && !bond) {
          parent.dispose()
        }
        break
      }
    }
  }
  render(structure: Structure): void {
    const scene = this._scene
    const { atoms, bonds } = structure
    const structureTrans = new TransformNode(structure.id, scene)
    for (const atom of atoms) {
      this.renderAtom(atom, structureTrans)
    }
    for (const bond of bonds) {
      this.renderBond(bond, structureTrans)
    }
  }
  dispose(): void {
    return
  }
  private renderAtom(atom: Readonly<Atom>, parent: Node): void {
    let material = this._scene.getMaterialById('atom-color-' + atom.element.id) as StandardMaterial
    if (!material) {
      material = new StandardMaterial('atom-color-' + atom.element.id, this._scene)
      const color = this._atomColorMap.get(atom.element.id)
      material.emissiveColor = new Color3(color.red, color.green, color.blue)
    }
    const sphere = MeshBuilder.CreateSphere(atom.id, { diameter: atom.element.radius }, this._scene)
    sphere.material = material
    sphere.metadata = atom
    sphere.position = new Vector3(atom.x, atom.y, atom.z)
    sphere.parent = parent
  }
  private renderBond(bond: Readonly<Bond>, parent: Node): void {
    const scene = this._scene
    const { source, target, type } = bond
    const { x: x1, y: y1, z: z1 } = source
    const { x: x2, y: y2, z: z2 } = target
    const trans = new TransformNode(bond.id, scene)
    trans.metadata = bond
    trans.position = Vector3.Center(new Vector3(x1, y1, z1), new Vector3(x2, y2, z2))
    trans.lookAt(new Vector3(x2, y2, z2), 0, Math.PI / 2)
    trans.parent = parent
    const height = Vector3.Distance(new Vector3(x1, y1, z1), new Vector3(x2, y2, z2))
    const cylinder = MeshBuilder.CreateCylinder(
      bond.id + '1',
      {
        diameter: 0.1,
        height
      },
      scene
    )
    cylinder.parent = trans
    switch (type) {
      case 'double': {
        cylinder.position = new Vector3(0, 0, 0.2)
        const cylinder2 = MeshBuilder.CreateCylinder(
          bond.id + '2',
          {
            diameter: 0.1,
            height
          },
          scene
        )
        cylinder2.position = new Vector3(0, 0, -0.2)
        cylinder2.parent = trans
        break
      }
      case 'triple': {
        const cylinder2 = MeshBuilder.CreateCylinder(
          bond.id + '2',
          {
            diameter: 0.1,
            height
          },
          scene
        )
        cylinder2.position = new Vector3(0, 0, 0.2)
        cylinder2.parent = trans
        const cylinder3 = MeshBuilder.CreateCylinder(
          bond.id + '2',
          {
            diameter: 0.1,
            height
          },
          scene
        )
        cylinder3.position = new Vector3(0, 0, -0.2)
        cylinder3.parent = trans
        break
      }
    }
  }
}
