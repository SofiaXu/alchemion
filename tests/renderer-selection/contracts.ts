// M2 comparison-only contracts. These are not SDK public APIs.
export type Candidate = 'three' | 'babylon'
export type DisplayMode = 'space-filling' | 'ball-and-stick'
export type Vec3 = readonly [number, number, number]

export interface RenderSnapshot {
  positions: Float32Array
  colors: Float32Array
  atomIds: string[]
  sourceAtomIds: string[]
  bondEndpoints: Uint32Array
  bondIds: string[]
  sourceBondIds: string[]
  hash: string
}

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array
}

export interface CameraPose {
  position: Vec3
  target: Vec3
  up: Vec3
  fovYDegrees: number
  near: number
  far: number
}

export interface ComparisonScene {
  sphere: MeshData
  cylinder: MeshData
  // GLSL ES 1.00 fragment source; adapters supply vColor and vNormal.
  fragmentShader: string
  background: Vec3
  spaceFillingRadius: number
  ballRadius: number
  bondRadius: number
}

export interface SnapshotUpdate {
  // Full prepared snapshot plus the precise dirty instance ranges.
  snapshot: RenderSnapshot
  atomIndices: Uint32Array
  bondIndices: Uint32Array
}

export interface PickResult {
  kind: 'atom' | 'bond'
  instanceId: string
  sourceId: string
  index: number
}

export interface AdapterStats {
  atoms: number
  bonds: number
  geometries: number
  materials: number
}

export interface RendererAdapter {
  readonly candidate: Candidate
  setSnapshot(snapshot: RenderSnapshot, mode: DisplayMode): void
  update(update: SnapshotUpdate): void
  setCamera(camera: CameraPose): void
  // False means the engine is still preparing a material and skipped a mesh.
  render(): boolean
  pick(x: number, y: number): PickResult | undefined
  resize(width: number, height: number): void
  clear(): void
  dispose(): void
  stats(): AdapterStats
}

export interface AdapterOptions {
  canvas: HTMLCanvasElement
  // Created/instrumented by the shared harness before engine initialization.
  gl: WebGL2RenderingContext
  scene: ComparisonScene
  camera: CameraPose
}

export type AdapterFactory = (options: AdapterOptions) => RendererAdapter
