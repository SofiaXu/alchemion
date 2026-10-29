import { Color3, MeshBuilder, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { IRenderer } from '../contracts'
import { IStructure } from '../../core/structure'

export class LatticeRenderer implements IRenderer {
  private _scene: Scene
  private _transformNode: TransformNode
  id
  constructor(scene: Scene) {
    this._scene = scene
    this.id = 'lattice-top'
    this._transformNode = new TransformNode(this.id, scene)
  }
  async render(structure: IStructure) {
    const scene = this._scene
    const { lattice } = structure
    if (lattice) {
      this.clear()
      const pointZero = MeshBuilder.CreateSphere('point-zero', { diameter: 0.1 }, scene)
      pointZero.parent = this._transformNode
      const { a, b, c, alpha, beta, gamma } = lattice
      const alpha1 = alpha * (Math.PI / 180)
      const beta1 = beta * (Math.PI / 180)
      const gamma1 = gamma * (Math.PI / 180)
      const cosAlpha = alpha === 0 ? 1 : alpha === 90 ? 0 : alpha === 180 ? -1 : Math.cos(alpha1)
      const cosBeta = beta === 0 ? 1 : beta === 90 ? 0 : beta === 180 ? -1 : Math.cos(beta1)
      const cosGamma = gamma === 0 ? 1 : gamma === 90 ? 0 : gamma === 180 ? -1 : Math.cos(gamma1)
      const sinGamma = gamma === 0 ? 0 : gamma === 90 ? 1 : gamma === 180 ? 0 : Math.sin(gamma1)
      const a1 = new Vector3(a, 0, 0)
      const b1 = new Vector3(b * cosGamma, b * sinGamma, 0)
      const c1 = new Vector3(
        c * cosBeta,
        (c * (cosAlpha - cosBeta * cosGamma)) / sinGamma,
        (c *
          Math.sqrt(
            1 -
              Math.pow(cosAlpha, 2) -
              Math.pow(cosBeta, 2) -
              Math.pow(cosGamma, 2) +
              2 * cosAlpha * cosBeta * cosGamma
          )) /
          sinGamma
      )
      const lines = [
        [Vector3.Zero(), a1],
        [Vector3.Zero(), b1],
        [Vector3.Zero(), c1],
        [a1, a1.add(b1)],
        [a1, a1.add(c1)],
        [b1, b1.add(a1)],
        [b1, b1.add(c1)],
        [c1, c1.add(a1)],
        [c1, c1.add(b1)],
        [a1.add(b1), a1.add(b1).add(c1)],
        [a1.add(c1), a1.add(c1).add(b1)],
        [b1.add(c1), b1.add(c1).add(a1)]
      ]
      console.log(lines)
      const colors = [
        [Color3.Red().toColor4(), Color3.Red().toColor4()],
        [Color3.Green().toColor4(), Color3.Green().toColor4()],
        [Color3.Blue().toColor4(), Color3.Blue().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()],
        [Color3.Black().toColor4(), Color3.Black().toColor4()]
      ]
      const latticeBox = MeshBuilder.CreateLineSystem(
        'lattice',
        {
          lines,
          colors
        },
        scene
      )
      latticeBox.parent = this._transformNode
      latticeBox.isPickable = false
    }
  }
  dispose(): void {
    this._scene.removeTransformNode(this._transformNode)
    this._transformNode.dispose()
    return
  }
  clear(): void {
    this._transformNode.getChildren().forEach((child) => child.dispose())
  }
}
