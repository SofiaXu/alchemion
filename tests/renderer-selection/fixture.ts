import type {
  CameraPose,
  ComparisonScene,
  MeshData,
  RenderSnapshot,
  SnapshotUpdate
} from './contracts'

export const WIDTH = 1920
export const HEIGHT = 1080
export const CENTER = [36, 28.5, 28.5] as const
export const CAMERA: CameraPose = {
  position: [36, 28.5, 188.5],
  target: CENTER,
  up: [0, 1, 0],
  fovYDegrees: 45,
  near: 0.1,
  far: 1000
}

function mesh(positions: number[], normals: number[], indices: number[]): MeshData {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices)
  }
}

function sphere(): MeshData {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let y = 0; y <= 16; y++) {
    const phi = (Math.PI * y) / 16
    for (let x = 0; x <= 24; x++) {
      const theta = (2 * Math.PI * x) / 24
      const normal = [
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ]
      positions.push(...normal)
      normals.push(...normal)
    }
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 24; x++) {
      const a = y * 25 + x
      const b = a + 25
      if (y > 0) indices.push(a, a + 1, b)
      if (y < 15) indices.push(a + 1, b + 1, b)
    }
  }
  return mesh(positions, normals, indices)
}

function cylinder(): MeshData {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let segment = 0; segment <= 16; segment++) {
    const angle = (2 * Math.PI * segment) / 16
    const x = Math.cos(angle)
    const z = Math.sin(angle)
    positions.push(x, -0.5, z, x, 0.5, z)
    normals.push(x, 0, z, x, 0, z)
    if (segment < 16) {
      const a = segment * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  for (const y of [-0.5, 0.5]) {
    const center = positions.length / 3
    positions.push(0, y, 0)
    normals.push(0, Math.sign(y), 0)
    for (let segment = 0; segment <= 16; segment++) {
      const angle = (2 * Math.PI * segment) / 16
      positions.push(Math.cos(angle), y, Math.sin(angle))
      normals.push(0, Math.sign(y), 0)
      if (segment < 16) {
        const a = center + 1 + segment
        if (y < 0) indices.push(center, a, a + 1)
        else indices.push(center, a + 1, a)
      }
    }
  }
  return mesh(positions, normals, indices)
}

export const SCENE: ComparisonScene = {
  sphere: sphere(),
  cylinder: cylinder(),
  fragmentShader: `precision highp float;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vec3 light = normalize(vec3(-0.4, 0.8, 1.0));
  float intensity = 0.25 + 0.75 * max(dot(normalize(vNormal), light), 0.0);
  gl_FragColor = vec4(vColor * intensity, 1.0);
}`,
  background: [1, 1, 1],
  spaceFillingRadius: 1,
  ballRadius: 0.45,
  bondRadius: 0.12
}

// Project-authored deterministic data; no scientific table or imported molecule is used.
export function createSnapshot(): RenderSnapshot {
  const positions = new Float32Array(30000)
  const colors = new Float32Array(30000)
  const palette = [
    [0.2, 0.2, 0.2],
    [0.85, 0.12, 0.12],
    [0.12, 0.25, 0.85],
    [0.85, 0.7, 0.12]
  ]
  const atomIds: string[] = []
  const sourceAtomIds: string[] = []
  const endpoints: number[] = []
  for (let i = 0; i < 10000; i++) {
    positions.set([(i % 25) * 3, (Math.floor(i / 25) % 20) * 3, Math.floor(i / 500) * 3], i * 3)
    colors.set(palette[i % 4], i * 3)
    atomIds.push(`instance:atom:${i}`)
    sourceAtomIds.push(`source:atom:${i % 500}`)
  }
  for (let i = 0; i < 10000; i++) if (i % 25 < 24) endpoints.push(i, i + 1)
  for (let i = 0; i < 10000; i++) if (Math.floor(i / 25) % 20 < 19) endpoints.push(i, i + 25)
  for (let i = 0; i < 900; i++) endpoints.push(i, i + 500)
  const bondEndpoints = new Uint32Array(endpoints)
  const bondIds = Array.from({ length: 20000 }, (_, i) => `instance:bond:${i}`)
  const sourceBondIds = Array.from({ length: 20000 }, (_, i) => `source:bond:${i % 1000}`)
  const unique = new Set<string>()
  for (let i = 0; i < endpoints.length; i += 2) unique.add(`${endpoints[i]}:${endpoints[i + 1]}`)
  if (positions.length !== 30000 || unique.size !== 20000 || endpoints.length !== 40000) {
    throw new Error('M2 fixture topology is inconsistent.')
  }
  return {
    positions,
    colors,
    atomIds,
    sourceAtomIds,
    bondEndpoints,
    bondIds,
    sourceBondIds,
    hash: ''
  }
}

export async function hashBuffers(buffers: ArrayBufferView[]): Promise<string> {
  const bytes = new Uint8Array(buffers.reduce((total, buffer) => total + buffer.byteLength, 0))
  let offset = 0
  for (const buffer of buffers) {
    bytes.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), offset)
    offset += buffer.byteLength
  }
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function prepareFixture() {
  const snapshot = createSnapshot()
  snapshot.hash = await hashBuffers([snapshot.positions, snapshot.colors, snapshot.bondEndpoints])
  const geometryHash = await hashBuffers([
    SCENE.sphere.positions,
    SCENE.sphere.normals,
    SCENE.sphere.indices,
    SCENE.cylinder.positions,
    SCENE.cylinder.normals,
    SCENE.cylinder.indices
  ])
  return {
    snapshot,
    description: {
      atoms: 10000,
      bonds: 20000,
      hash: snapshot.hash,
      geometryHash,
      buffers: {
        positions: snapshot.positions.length,
        colors: snapshot.colors.length,
        bondEndpoints: snapshot.bondEndpoints.length
      },
      geometry: {
        sphere: {
          longitude: 24,
          latitude: 16,
          vertices: SCENE.sphere.positions.length / 3,
          triangles: SCENE.sphere.indices.length / 3
        },
        cylinder: {
          segments: 16,
          capped: true,
          vertices: SCENE.cylinder.positions.length / 3,
          triangles: SCENE.cylinder.indices.length / 3
        }
      },
      radii: { spaceFilling: 1, ball: 0.45, bond: 0.12 },
      background: [1, 1, 1],
      antialias: true,
      alpha: false,
      colorSpace: 'linear RGB shared shader; no tone mapping',
      canvas: { width: WIDTH, height: HEIGHT, dpr: 1 },
      camera: CAMERA
    }
  }
}

export function prepareUpdates(snapshot: RenderSnapshot, count = 100): SnapshotUpdate[] {
  const updates: SnapshotUpdate[] = []
  let previous = snapshot
  for (let iteration = 0; iteration < count; iteration++) {
    const positions = previous.positions.slice()
    const atomIndices = new Uint32Array(100)
    // All updates include visible front-layer atoms as well as linked interior atoms.
    for (let j = 0; j < 100; j++) {
      const index = j < 50 ? 9500 + ((iteration * 37 + j) % 500) : (iteration * 97 + j * 101) % 9500
      atomIndices[j] = index
      positions[index * 3] += iteration % 2 === 0 ? 0.08 : -0.08
      positions[index * 3 + 1] += iteration % 2 === 0 ? 0.04 : -0.04
    }
    if (new Set(atomIndices).size !== 100)
      throw new Error('M2 update must touch exactly 100 atoms.')
    const dirty = new Set(atomIndices)
    const bonds: number[] = []
    for (let i = 0; i < snapshot.bondIds.length; i++) {
      if (dirty.has(snapshot.bondEndpoints[i * 2]) || dirty.has(snapshot.bondEndpoints[i * 2 + 1]))
        bonds.push(i)
    }
    previous = { ...previous, positions }
    updates.push({ snapshot: previous, atomIndices, bondIndices: new Uint32Array(bonds) })
  }
  return updates
}

export function orbitCamera(elapsedMs: number): CameraPose {
  const theta = (elapsedMs / 60000) * Math.PI * 2
  const elevation = 0.18 * Math.sin(theta * 2)
  const horizontal = 160 * Math.cos(elevation)
  return {
    ...CAMERA,
    position: [
      CENTER[0] + horizontal * Math.sin(theta),
      CENTER[1] + 160 * Math.sin(elevation),
      CENTER[2] + horizontal * Math.cos(theta)
    ]
  }
}
