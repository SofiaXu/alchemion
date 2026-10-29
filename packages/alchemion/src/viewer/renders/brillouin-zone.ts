import {
  Color3,
  CSG,
  MeshBuilder,
  Plane,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core'
import { IStructure } from '../../internal/legacy'
import { IRenderer } from '../contracts'

export class BrillouinZoneRenderer implements IRenderer {
  private _scene: Scene
  private _transformNode: TransformNode
  id: string
  constructor(scene: Scene) {
    this._scene = scene
    this.id = 'brillouin-zone-top'
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
      const points: Array<Vector3> = []
      for (let i = -1; i < 2; i++) {
        for (let j = -1; j < 2; j++) {
          for (let k = -1; k < 2; k++) {
            points.push(
              aStar.clone().scale(i).add(bStar.clone().scale(j)).add(cStar.clone().scale(k))
            )
          }
        }
      }
      const planes: Array<Plane> = []
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const point1 = points[i]
          const point2 = points[j]
          const midpoint = point1.add(point2).scale(0.5)
          const normal = point2.subtract(point1).normalize()
          const plane = new Plane(normal.x, normal.y, normal.z, -Vector3.Dot(normal, midpoint))
          planes.push(plane)
        }
      }
      const farPoint = bStar.add(cStar).add(aStar)
      const size = Math.max(farPoint.x, farPoint.y, farPoint.z)
      const material = new StandardMaterial('brillouinZoneMaterial', scene)
      material.alpha = 0.5
      material.diffuseColor = Color3.Green()
      const box = MeshBuilder.CreateBox('brillouinZone', { size: size * 4 }, scene)
      box.material = material
      let brillouinZone = CSG.FromMesh(box)
      planes.forEach((plane) => {
        const planeNormal = new Vector3(plane.normal.x, plane.normal.y, plane.normal.z)
        const planePoint = planeNormal.scale(-plane.d)
        const planeMesh = MeshBuilder.CreatePlane('plane', { size: size * 4 }, scene)
        planeMesh.position = planePoint
        planeMesh.lookAt(planePoint.add(planeNormal))
        planeMesh.position = planePoint.subtract(planeNormal.scale(size))
        const cuttingPlane = CSG.FromMesh(planeMesh)
        brillouinZone = brillouinZone.intersect(cuttingPlane)
        planeMesh.dispose()
      })
      const brillouinZoneMesh = brillouinZone.toMesh('brillouinZone', material, scene)
      brillouinZoneMesh.parent = this._transformNode
      brillouinZoneMesh.enableEdgesRendering()
      brillouinZoneMesh.edgesWidth = 2
      brillouinZoneMesh.edgesColor = Color3.Black().toColor4()
    }
  }
  clear(): void {
    this._transformNode.getChildMeshes().forEach((mesh) => mesh.dispose())
  }
  dispose(): void {
    throw new Error('Method not implemented.')
  }
}
