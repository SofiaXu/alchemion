import { Color3, MeshBuilder, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { IRenderer } from '../contracts'
import { IStructure } from '../../internal/legacy/structure'

export class ReciprocalLatticeRenderer implements IRenderer {
  private _scene: Scene
  private _transformNode: TransformNode
  id: string
  constructor(scene: Scene) {
    this._scene = scene
    this.id = 'reciprocal-lattice-top'
    this._transformNode = new TransformNode(this.id, scene)
  }
  async render(structure: IStructure) {
    const scene = this._scene
    const { lattice } = structure
    if (lattice) {
      this.clear()
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
      const crossProductBC = b1.cross(c1)
      const crossProductCA = c1.cross(a1)
      const crossProductAB = a1.cross(b1)
      const volume = a1.dot(crossProductBC)
      const factor = (2 * Math.PI) / volume
      const aStar = crossProductBC.scale(factor)
      const bStar = crossProductCA.scale(factor)
      const cStar = crossProductAB.scale(factor)
      const lines = [
        [Vector3.Zero(), aStar],
        [Vector3.Zero(), bStar],
        [Vector3.Zero(), cStar],
        [aStar, aStar.add(bStar)],
        [aStar, aStar.add(cStar)],
        [bStar, bStar.add(aStar)],
        [bStar, bStar.add(cStar)],
        [cStar, cStar.add(aStar)],
        [cStar, cStar.add(bStar)],
        [aStar.add(bStar), aStar.add(bStar).add(cStar)],
        [aStar.add(cStar), aStar.add(cStar).add(bStar)],
        [bStar.add(cStar), bStar.add(cStar).add(aStar)]
      ]
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
      const reciprocalLattice = MeshBuilder.CreateLineSystem(
        'reciprocal-lattice',
        {
          lines,
          colors
        },
        scene
      )
      reciprocalLattice.parent = this._transformNode
    }
  }
  clear(): void {
    this._transformNode.getChildMeshes().forEach((mesh) => mesh.dispose())
  }
  dispose(): void {
    this._scene.removeTransformNode(this._transformNode)
    this._transformNode.dispose()
  }
}
