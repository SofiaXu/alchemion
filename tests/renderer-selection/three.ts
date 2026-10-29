import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearSRGBColorSpace,
  Matrix4,
  NoToneMapping,
  PerspectiveCamera,
  Quaternion,
  RawShaderMaterial,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three'
import type {
  AdapterFactory,
  AdapterOptions,
  AdapterStats,
  CameraPose,
  DisplayMode,
  MeshData,
  PickResult,
  RendererAdapter,
  RenderSnapshot,
  SnapshotUpdate
} from './contracts'

const vertexShader = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute mat4 instanceMatrix;
attribute vec3 instanceColor;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  mat3 basis = mat3(instanceMatrix);
  vec3 scaleSquared = vec3(dot(basis[0], basis[0]), dot(basis[1], basis[1]), dot(basis[2], basis[2]));
  vNormal = normalize(mat3(modelMatrix) * basis * (normal / scaleSquared));
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`

function isolate(snapshot: RenderSnapshot): RenderSnapshot {
  return {
    positions: snapshot.positions.slice(),
    colors: snapshot.colors.slice(),
    atomIds: snapshot.atomIds.slice(),
    sourceAtomIds: snapshot.sourceAtomIds.slice(),
    bondEndpoints: snapshot.bondEndpoints.slice(),
    bondIds: snapshot.bondIds.slice(),
    sourceBondIds: snapshot.sourceBondIds.slice(),
    hash: snapshot.hash
  }
}

function geometry(data: MeshData): BufferGeometry {
  const result = new BufferGeometry()
  result.setAttribute('position', new BufferAttribute(data.positions.slice(), 3))
  result.setAttribute('normal', new BufferAttribute(data.normals.slice(), 3))
  result.setIndex(new BufferAttribute(data.indices.slice(), 1))
  result.computeBoundingBox()
  result.computeBoundingSphere()
  return result
}

class ThreeAdapter implements RendererAdapter {
  readonly candidate = 'three'
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera()
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly matrix = new Matrix4()
  private readonly position = new Vector3()
  private readonly direction = new Vector3()
  private readonly scale = new Vector3()
  private readonly rotation = new Quaternion()
  private readonly up = new Vector3(0, 1, 0)
  private readonly color = new Color()
  private atoms?: InstancedMesh
  private bonds?: InstancedMesh
  private material?: RawShaderMaterial
  private snapshot?: RenderSnapshot
  private mode: DisplayMode = 'space-filling'
  private width: number
  private height: number
  private disposed = false
  private shaderError?: Error

  constructor(private readonly options: AdapterOptions) {
    this.renderer = new WebGLRenderer({
      canvas: options.canvas,
      context: options.gl,
      antialias: true,
      alpha: false
    })
    this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      const diagnostics = [
        // @types/three names its wrapper here; r186 passes the native GL handle.
        gl.getProgramInfoLog(program as unknown as WebGLProgram),
        gl.getShaderInfoLog(vertex),
        gl.getShaderInfoLog(fragment)
      ]
        .filter(Boolean)
        .join('\n')
      this.shaderError = new Error(`Three.js shader compilation failed:\n${diagnostics}`)
    }
    this.renderer.setPixelRatio(1)
    this.renderer.outputColorSpace = LinearSRGBColorSpace
    this.renderer.toneMapping = NoToneMapping
    this.renderer.setClearColor(new Color().setRGB(...options.scene.background), 1)
    this.width = options.canvas.width
    this.height = options.canvas.height
    this.resize(this.width, this.height)
    this.setCamera(options.camera)
  }

  setSnapshot(snapshot: RenderSnapshot, mode: DisplayMode): void {
    this.assertActive()
    this.clear()
    this.snapshot = isolate(snapshot)
    this.mode = mode
    this.material = new RawShaderMaterial({
      vertexShader,
      fragmentShader: this.options.scene.fragmentShader,
      depthTest: true,
      depthWrite: true,
      transparent: false,
      toneMapped: false
    })
    this.atoms = this.createMesh(this.options.scene.sphere, snapshot.atomIds.length)
    for (let index = 0; index < snapshot.atomIds.length; index++) this.writeAtom(index)
    this.finishMesh(this.atoms)
    if (mode === 'ball-and-stick') {
      this.bonds = this.createMesh(this.options.scene.cylinder, snapshot.bondIds.length)
      for (let index = 0; index < snapshot.bondIds.length; index++) this.writeBond(index)
      this.finishMesh(this.bonds)
    }
  }

  update(update: SnapshotUpdate): void {
    this.assertActive()
    if (!this.snapshot || !this.atoms) throw new Error('No render snapshot is loaded.')
    if (
      update.snapshot.atomIds.length !== this.snapshot.atomIds.length ||
      update.snapshot.bondIds.length !== this.snapshot.bondIds.length
    ) {
      throw new Error('Local updates cannot change comparison topology.')
    }
    this.snapshot = isolate(update.snapshot)
    for (const index of update.atomIndices) {
      this.writeAtom(index)
      this.markRange(this.atoms, index)
    }
    this.finishMesh(this.atoms)
    if (this.bonds) {
      for (const index of update.bondIndices) {
        this.writeBond(index)
        this.markRange(this.bonds, index)
      }
      this.finishMesh(this.bonds)
    }
  }

  setCamera(camera: CameraPose): void {
    this.assertActive()
    this.camera.position.set(...camera.position)
    this.camera.up.set(...camera.up)
    this.camera.fov = camera.fovYDegrees
    this.camera.near = camera.near
    this.camera.far = camera.far
    this.camera.lookAt(...camera.target)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
  }

  render(): boolean {
    this.assertActive()
    this.renderer.render(this.scene, this.camera)
    if (this.shaderError) throw this.shaderError
    return true
  }

  pick(x: number, y: number): PickResult | undefined {
    if (this.disposed || !this.snapshot) return undefined
    this.pointer.set((x / this.width) * 2 - 1, 1 - (y / this.height) * 2)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshes = [this.atoms, this.bonds].filter((mesh): mesh is InstancedMesh => !!mesh)
    const intersection = this.raycaster.intersectObjects(meshes, false)[0]
    if (intersection?.instanceId === undefined) return undefined
    const index = intersection.instanceId
    const kind = intersection.object === this.atoms ? 'atom' : 'bond'
    return {
      kind,
      index,
      instanceId: kind === 'atom' ? this.snapshot.atomIds[index] : this.snapshot.bondIds[index],
      sourceId:
        kind === 'atom' ? this.snapshot.sourceAtomIds[index] : this.snapshot.sourceBondIds[index]
    }
  }

  resize(width: number, height: number): void {
    this.assertActive()
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  clear(): void {
    for (const mesh of [this.atoms, this.bonds]) {
      if (!mesh) continue
      this.scene.remove(mesh)
      mesh.dispose()
      mesh.geometry.dispose()
    }
    this.atoms = undefined
    this.bonds = undefined
    this.material?.dispose()
    this.material = undefined
    this.snapshot = undefined
  }

  dispose(): void {
    if (this.disposed) return
    this.clear()
    this.renderer.dispose()
    this.disposed = true
  }

  stats(): AdapterStats {
    return {
      atoms: this.atoms?.count ?? 0,
      bonds: this.bonds?.count ?? 0,
      geometries: Number(!!this.atoms) + Number(!!this.bonds),
      materials: Number(!!this.material)
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('The comparison adapter is disposed.')
  }

  private createMesh(data: MeshData, count: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry(data), this.material!, count)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
    mesh.instanceColor.setUsage(DynamicDrawUsage)
    this.scene.add(mesh)
    return mesh
  }

  private writeAtom(index: number): void {
    const snapshot = this.snapshot!
    const radius =
      this.mode === 'space-filling'
        ? this.options.scene.spaceFillingRadius
        : this.options.scene.ballRadius
    this.position.fromArray(snapshot.positions, index * 3)
    this.scale.setScalar(radius)
    this.rotation.identity()
    this.matrix.compose(this.position, this.rotation, this.scale)
    this.atoms!.setMatrixAt(index, this.matrix)
    this.color.fromArray(snapshot.colors, index * 3)
    this.atoms!.setColorAt(index, this.color)
  }

  private writeBond(index: number): void {
    const snapshot = this.snapshot!
    const first = snapshot.bondEndpoints[index * 2] * 3
    const second = snapshot.bondEndpoints[index * 2 + 1] * 3
    this.position.fromArray(snapshot.positions, first)
    this.direction.fromArray(snapshot.positions, second).sub(this.position)
    const length = this.direction.length()
    this.position.addScaledVector(this.direction, 0.5)
    this.rotation.setFromUnitVectors(this.up, this.direction.multiplyScalar(1 / length))
    this.scale.set(this.options.scene.bondRadius, length, this.options.scene.bondRadius)
    this.matrix.compose(this.position, this.rotation, this.scale)
    this.bonds!.setMatrixAt(index, this.matrix)
    this.color.setRGB(
      (snapshot.colors[first] + snapshot.colors[second]) / 2,
      (snapshot.colors[first + 1] + snapshot.colors[second + 1]) / 2,
      (snapshot.colors[first + 2] + snapshot.colors[second + 2]) / 2
    )
    this.bonds!.setColorAt(index, this.color)
  }

  private markRange(mesh: InstancedMesh, index: number): void {
    mesh.instanceMatrix.addUpdateRange(index * 16, 16)
    mesh.instanceColor!.addUpdateRange(index * 3, 3)
  }

  private finishMesh(mesh: InstancedMesh): void {
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    mesh.updateMatrixWorld(true)
  }
}

export const createAdapter: AdapterFactory = (options) => new ThreeAdapter(options)
