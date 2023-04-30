import { IRenderer } from '@alchemion/core/editor'
import { Structure } from '@alchemion/core/structure'
import { MeshBuilder, Scene, TransformNode, Vector3 } from '@babylonjs/core'

export class BallAndStickRenderer implements IRenderer {
  private _scene: Scene
  constructor(scene: Scene) {
    this._scene = scene
  }
  render(structure: Structure): void {
    const scene = this._scene
    const { atoms, bonds } = structure
    const structureTrans = new TransformNode(structure.id, scene)
    for (const atom of atoms) {
      const sphere = MeshBuilder.CreateSphere(atom.id, { diameter: atom.element.radius }, scene)
      sphere.metadata = atom
      sphere.position = new Vector3(atom.x, atom.y, atom.z)
      sphere.parent = structureTrans
    }
    for (const bond of bonds) {
      const { source, target, type } = bond
      const { x: x1, y: y1, z: z1 } = source
      const { x: x2, y: y2, z: z2 } = target
      const trans = new TransformNode(bond.id, scene)
      trans.metadata = bond
      trans.position = Vector3.Center(new Vector3(x1, y1, z1), new Vector3(x2, y2, z2))
      trans.lookAt(new Vector3(x2, y2, z2), 0, Math.PI / 2)
      trans.parent = structureTrans
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
  dispose(): void {
    this._scene.dispose()
  }
}
