import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import '@babylonjs/core/Culling/ray'
import type {
  AdapterFactory,
  CameraPose,
  DisplayMode,
  MeshData,
  RenderSnapshot,
  SnapshotUpdate
} from './contracts'

const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 instanceTint;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
uniform mat4 viewProjection;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  mat4 instanceWorld = mat4(world0, world1, world2, world3);
  vec3 scaleSquared = vec3(dot(world0.xyz, world0.xyz),
    dot(world1.xyz, world1.xyz), dot(world2.xyz, world2.xyz));
  vNormal = normalize(mat3(instanceWorld) * (normal / scaleSquared));
  vColor = instanceTint;
  gl_Position = viewProjection * instanceWorld * vec4(position, 1.0);
}
`

interface Batch {
  mesh: Mesh
  matrices: Float32Array
  colors: Float32Array
  count: number
}

function copySnapshot(snapshot: RenderSnapshot): RenderSnapshot {
  return {
    positions: snapshot.positions.slice(),
    colors: snapshot.colors.slice(),
    atomIds: [...snapshot.atomIds],
    sourceAtomIds: [...snapshot.sourceAtomIds],
    bondEndpoints: snapshot.bondEndpoints.slice(),
    bondIds: [...snapshot.bondIds],
    sourceBondIds: [...snapshot.sourceBondIds],
    hash: snapshot.hash
  }
}

function atomTransform(data: Float32Array, index: number, positions: Float32Array, radius: number) {
  const offset = index * 16
  data.fill(0, offset, offset + 16)
  data[offset] = radius
  data[offset + 5] = radius
  data[offset + 10] = radius
  data[offset + 12] = positions[index * 3]
  data[offset + 13] = positions[index * 3 + 1]
  data[offset + 14] = positions[index * 3 + 2]
  data[offset + 15] = 1
}

function bondTransform(
  data: Float32Array,
  index: number,
  snapshot: RenderSnapshot,
  radius: number
) {
  const a = snapshot.bondEndpoints[index * 2] * 3
  const b = snapshot.bondEndpoints[index * 2 + 1] * 3
  const dx = snapshot.positions[b] - snapshot.positions[a]
  const dy = snapshot.positions[b + 1] - snapshot.positions[a + 1]
  const dz = snapshot.positions[b + 2] - snapshot.positions[a + 2]
  const length = Math.hypot(dx, dy, dz)
  if (!(length > 0)) throw new Error('M2_BABYLON_DEGENERATE_BOND')
  const yx = dx / length
  const yy = dy / length
  const yz = dz / length
  // x = normalize(cross(y, reference)); z = cross(x, y), so det remains positive.
  let xx = Math.abs(yz) < 0.9 ? yy : -yz
  let xy = Math.abs(yz) < 0.9 ? -yx : 0
  let xz = Math.abs(yz) < 0.9 ? 0 : yx
  const xLength = Math.hypot(xx, xy, xz)
  xx /= xLength
  xy /= xLength
  xz /= xLength
  const zx = xy * yz - xz * yy
  const zy = xz * yx - xx * yz
  const zz = xx * yy - xy * yx
  const offset = index * 16
  data.set(
    [
      xx * radius,
      xy * radius,
      xz * radius,
      0,
      dx,
      dy,
      dz,
      0,
      zx * radius,
      zy * radius,
      zz * radius,
      0,
      (snapshot.positions[a] + snapshot.positions[b]) / 2,
      (snapshot.positions[a + 1] + snapshot.positions[b + 1]) / 2,
      (snapshot.positions[a + 2] + snapshot.positions[b + 2]) / 2,
      1
    ],
    offset
  )
}

function bondColor(colors: Float32Array, index: number, snapshot: RenderSnapshot) {
  const a = snapshot.bondEndpoints[index * 2] * 3
  const b = snapshot.bondEndpoints[index * 2 + 1] * 3
  for (let axis = 0; axis < 3; axis++) {
    colors[index * 3 + axis] = (snapshot.colors[a + axis] + snapshot.colors[b + axis]) / 2
  }
}

function uploadRanges(batch: Batch, indices: Uint32Array) {
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  for (let cursor = 0; cursor < sorted.length; ) {
    const first = sorted[cursor]
    let last = first
    while (cursor + 1 < sorted.length && sorted[cursor + 1] === last + 1) {
      last = sorted[++cursor]
    }
    // Array overload uses float offsets, not instance or byte offsets.
    batch.mesh.thinInstancePartialBufferUpdate(
      'matrix',
      batch.matrices.subarray(first * 16, (last + 1) * 16),
      first * 16
    )
    batch.mesh.thinInstancePartialBufferUpdate(
      'instanceTint',
      batch.colors.subarray(first * 3, (last + 1) * 3),
      first * 3
    )
    cursor++
  }
  batch.mesh.thinInstanceRefreshBoundingInfo()
}

export const createAdapter: AdapterFactory = (options) => {
  const engine = new Engine(
    options.gl,
    true,
    { audioEngine: false, doNotHandleContextLost: true, stencil: true, premultipliedAlpha: false },
    false
  )
  engine.setHardwareScalingLevel(1)
  const scene = new Scene(engine)
  scene.useRightHandedSystem = true
  scene.detachControl()
  scene.clearColor = new Color4(...options.scene.background, 1)
  const camera = new FreeCamera('m2-camera', Vector3.Zero(), scene)
  camera.inputs.clear()
  scene.activeCamera = camera
  let snapshot: RenderSnapshot | undefined
  let mode: DisplayMode = 'space-filling'
  let atoms: Batch | undefined
  let bonds: Batch | undefined
  let material: ShaderMaterial | undefined
  let shaderError: string | undefined
  let disposed = false

  function assertLive() {
    if (disposed) throw new Error('M2_BABYLON_DISPOSED')
  }

  function setCamera(pose: CameraPose) {
    assertLive()
    camera.position.set(...pose.position)
    camera.upVector.set(...pose.up)
    camera.fov = (pose.fovYDegrees * Math.PI) / 180
    camera.minZ = pose.near
    camera.maxZ = pose.far
    camera.setTarget(Vector3.FromArray(pose.target))
    camera.getViewMatrix(true)
    camera.getProjectionMatrix(true)
  }

  function clear() {
    if (disposed) return
    atoms?.mesh.dispose(false, false)
    bonds?.mesh.dispose(false, false)
    atoms = undefined
    bonds = undefined
    material?.dispose(true, true)
    material = undefined
    snapshot = undefined
    shaderError = undefined
  }

  function createBatch(name: string, geometry: MeshData, count: number): Batch {
    const mesh = new Mesh(name, scene)
    // Shared arrays have CCW outward winding, matching Three.FrontSide.
    mesh.sideOrientation = 1
    const vertexData = new VertexData()
    vertexData.positions = geometry.positions.slice()
    vertexData.normals = geometry.normals.slice()
    vertexData.indices = geometry.indices.slice()
    vertexData.applyToMesh(mesh)
    mesh.material = material!
    mesh.isPickable = true
    mesh.thinInstanceEnablePicking = true
    return {
      mesh,
      count,
      matrices: new Float32Array(count * 16),
      colors: new Float32Array(count * 3)
    }
  }

  function initializeBatch(batch: Batch) {
    batch.mesh.thinInstanceSetBuffer('matrix', batch.matrices, 16, false)
    batch.mesh.thinInstanceSetBuffer('instanceTint', batch.colors, 3, false)
    batch.mesh.computeWorldMatrix(true)
  }

  setCamera(options.camera)
  engine.setSize(options.canvas.width, options.canvas.height)

  return {
    candidate: 'babylon',
    setSnapshot(input, nextMode) {
      assertLive()
      clear()
      snapshot = copySnapshot(input)
      mode = nextMode
      if (!snapshot.atomIds.length) return
      material = new ShaderMaterial(
        'm2-lambert',
        scene,
        { vertexSource, fragmentSource: options.scene.fragmentShader },
        { attributes: ['position', 'normal', 'instanceTint'], uniforms: ['viewProjection'] }
      )
      material.backFaceCulling = true
      material.onError = (_effect, errors) => {
        shaderError = errors
      }
      atoms = createBatch('m2-atoms', options.scene.sphere, snapshot.atomIds.length)
      const radius =
        mode === 'space-filling' ? options.scene.spaceFillingRadius : options.scene.ballRadius
      for (let index = 0; index < atoms.count; index++) {
        atomTransform(atoms.matrices, index, snapshot.positions, radius)
      }
      atoms.colors.set(snapshot.colors)
      initializeBatch(atoms)
      if (mode === 'ball-and-stick' && snapshot.bondIds.length) {
        bonds = createBatch('m2-bonds', options.scene.cylinder, snapshot.bondIds.length)
        for (let index = 0; index < bonds.count; index++) {
          bondTransform(bonds.matrices, index, snapshot, options.scene.bondRadius)
          bondColor(bonds.colors, index, snapshot)
        }
        initializeBatch(bonds)
      }
    },
    update(update: SnapshotUpdate) {
      assertLive()
      if (!snapshot || !atoms) throw new Error('M2_BABYLON_NO_SNAPSHOT')
      if (
        update.snapshot.atomIds.length !== snapshot.atomIds.length ||
        update.snapshot.bondIds.length !== snapshot.bondIds.length
      ) {
        throw new Error('M2_BABYLON_UPDATE_TOPOLOGY_CHANGED')
      }
      const radius =
        mode === 'space-filling' ? options.scene.spaceFillingRadius : options.scene.ballRadius
      for (const index of update.atomIndices) {
        if (index >= atoms.count) throw new Error('M2_BABYLON_ATOM_INDEX')
        const offset = index * 3
        snapshot.positions.set(update.snapshot.positions.subarray(offset, offset + 3), offset)
        snapshot.colors.set(update.snapshot.colors.subarray(offset, offset + 3), offset)
        atoms.colors.set(snapshot.colors.subarray(offset, offset + 3), offset)
        atomTransform(atoms.matrices, index, snapshot.positions, radius)
        // Public setter updates both CPU matrixData and any cached picking matrices.
        atoms.mesh.thinInstanceSetMatrixAt(
          index,
          Matrix.FromArray(atoms.matrices, index * 16),
          false
        )
      }
      uploadRanges(atoms, update.atomIndices)
      if (bonds) {
        for (const index of update.bondIndices) {
          if (index >= bonds.count) throw new Error('M2_BABYLON_BOND_INDEX')
          bondTransform(bonds.matrices, index, snapshot, options.scene.bondRadius)
          bondColor(bonds.colors, index, snapshot)
          bonds.mesh.thinInstanceSetMatrixAt(
            index,
            Matrix.FromArray(bonds.matrices, index * 16),
            false
          )
        }
        uploadRanges(bonds, update.bondIndices)
      }
    },
    setCamera,
    render() {
      assertLive()
      if (shaderError) throw new Error(`M2_BABYLON_SHADER: ${shaderError}`)
      // Compile only inside the measured render path. A skipped first draw is not a complete frame.
      const ready =
        (!atoms || material!.isReady(atoms.mesh, true)) &&
        (!bonds || material!.isReady(bonds.mesh, true))
      engine.beginFrame()
      scene.render(false, true)
      engine.endFrame()
      return ready
    },
    pick(x, y) {
      assertLive()
      if (!snapshot) return
      const hit = scene.pick(
        x,
        y,
        (mesh) => mesh === atoms?.mesh || mesh === bonds?.mesh,
        false,
        camera
      )
      if (!hit.hit || hit.thinInstanceIndex < 0) return
      const index = hit.thinInstanceIndex
      if (hit.pickedMesh === atoms?.mesh && index < snapshot.atomIds.length) {
        return {
          kind: 'atom',
          instanceId: snapshot.atomIds[index],
          sourceId: snapshot.sourceAtomIds[index],
          index
        }
      }
      if (hit.pickedMesh === bonds?.mesh && index < snapshot.bondIds.length) {
        return {
          kind: 'bond',
          instanceId: snapshot.bondIds[index],
          sourceId: snapshot.sourceBondIds[index],
          index
        }
      }
    },
    resize(width, height) {
      assertLive()
      engine.setSize(width, height)
      camera.getProjectionMatrix(true)
    },
    clear,
    dispose() {
      if (disposed) return
      clear()
      camera.dispose()
      scene.dispose()
      engine.dispose()
      disposed = true
    },
    stats() {
      return {
        atoms: atoms?.count ?? 0,
        bonds: bonds?.count ?? 0,
        geometries: Number(!!atoms) + Number(!!bonds),
        materials: Number(!!material)
      }
    }
  }
}
