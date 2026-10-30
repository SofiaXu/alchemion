import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  LinearSRGBColorSpace,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Plane,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three'
import type { CoordinationResult } from '../../core/coordination'
import type { Matrix3, Vec3 } from '../../core/types'
import type {
  BackendCallbacks,
  BackendPick,
  BackendPngOptions,
  InteractionOverlay,
  RenderAtom,
  RenderBond,
  RenderContext,
  RenderFrame,
  ScreenRectangle,
  ViewerBackend
} from '../internal-contracts'
import type { CameraPose } from '../types'
import { attachPointerInteraction } from '../interaction/pointer'
import { cylinderGeometry, instanceMaterial, sphereGeometry } from './geometry'
import { encodePng, type CaptureText } from './capture'

interface InstanceLayer {
  readonly group: Group
  readonly atoms: InstancedMesh
  readonly bonds?: InstancedMesh
  readonly atomIds: readonly string[]
  readonly bondIds: readonly string[]
  readonly mode: RenderFrame['options']['renderMode']
  atomValues: Float64Array
  bondValues: Float64Array
}
interface Label {
  readonly node: HTMLElement
  readonly position: Vector3
  readonly text: string
  readonly color: string
}
interface Inset {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly title: HTMLElement
  readonly labels: readonly Label[]
  readonly radius: number
  readonly target: Vector3
  rect: { x: number; y: number; width: number; height: number }
}
interface AuxiliaryLayer {
  readonly group: Group
  readonly labels: readonly Label[]
  readonly insets: readonly Inset[]
  readonly signature: string
}
interface PendingCommit {
  readonly token: number
  readonly controller: AbortController
}

const ATOM_STRIDE = 7
const BOND_STRIDE = 10
const CHUNK_SIZE = 2048
const EMPTY_OVERLAY: InteractionOverlay = {
  selectedAtomIds: [],
  selectedBondIds: [],
  points: []
}
const AXIS_COLORS: readonly Vec3[] = [
  [0.8, 0.03, 0.03],
  [0.03, 0.55, 0.12],
  [0.05, 0.2, 0.85]
]
const AXIS_CSS = ['#bb2525', '#16833b', '#264ac6']

function failure(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code })
}
function aborted(): DOMException {
  return new DOMException('The render was cancelled, superseded or disposed.', 'AbortError')
}
function xyz(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z]
}
function finiteVector(value: Vec3): boolean {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}
function copyPose(pose: CameraPose): CameraPose {
  return {
    position: [...pose.position],
    target: [...pose.target],
    up: [...pose.up],
    fovYDegrees: pose.fovYDegrees,
    near: pose.near,
    far: pose.far
  }
}
function validatePose(pose: CameraPose): void {
  if (
    !pose ||
    !finiteVector(pose.position) ||
    !finiteVector(pose.target) ||
    !finiteVector(pose.up) ||
    !Number.isFinite(pose.fovYDegrees) ||
    pose.fovYDegrees <= 0 ||
    pose.fovYDegrees >= 179 ||
    !Number.isFinite(pose.near) ||
    !Number.isFinite(pose.far) ||
    pose.near <= 0 ||
    pose.far <= pose.near
  )
    throw failure(
      'CAMERA_PARAMETER',
      'Camera parameters must be finite and define a valid perspective.'
    )
  const forward = new Vector3(...pose.target).sub(new Vector3(...pose.position))
  const up = new Vector3(...pose.up)
  if (
    forward.lengthSq() <= 1e-18 ||
    up.lengthSq() <= 1e-18 ||
    forward.clone().cross(up).lengthSq() <= 1e-18
  )
    throw failure(
      'CAMERA_PARAMETER',
      'Camera position, target and up vector must define an orientation.'
    )
}

/** Release instance buffers as well as their geometries and deduplicated materials. */
function disposeTree(root: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  root.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose()
    if (object instanceof Mesh || object instanceof LineSegments || object instanceof Points) {
      geometries.add(object.geometry)
      const items = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of items) materials.add(material)
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  root.clear()
  root.removeFromParent()
}

function atomValues(atoms: readonly RenderAtom[]): Float64Array {
  const values = new Float64Array(atoms.length * ATOM_STRIDE)
  for (let i = 0; i < atoms.length; i++) {
    if (
      ![...atoms[i].instance.cartesian, ...atoms[i].color, atoms[i].radius].every((value) =>
        Number.isFinite(Math.fround(value))
      ) ||
      atoms[i].radius <= 0
    )
      throw failure(
        'RENDER_COORDINATE_RANGE',
        'An atom position, color or radius cannot be represented by WebGL instance buffers.'
      )
    values.set(atoms[i].instance.cartesian, i * ATOM_STRIDE)
    values.set(atoms[i].color, i * ATOM_STRIDE + 3)
    values[i * ATOM_STRIDE + 6] = atoms[i].radius
  }
  return values
}
function bondValues(bonds: readonly RenderBond[]): Float64Array {
  const values = new Float64Array(bonds.length * BOND_STRIDE)
  for (let i = 0; i < bonds.length; i++) {
    if (
      ![...bonds[i].a, ...bonds[i].b, ...bonds[i].color, bonds[i].radius].every((value) =>
        Number.isFinite(Math.fround(value))
      ) ||
      bonds[i].radius <= 0
    )
      throw failure(
        'RENDER_COORDINATE_RANGE',
        'A bond position, color or radius cannot be represented by WebGL instance buffers.'
      )
    values.set(bonds[i].a, i * BOND_STRIDE)
    values.set(bonds[i].b, i * BOND_STRIDE + 3)
    values.set(bonds[i].color, i * BOND_STRIDE + 6)
    values[i * BOND_STRIDE + 9] = bonds[i].radius
  }
  return values
}
function dirtyIndices(previous: Float64Array, next: Float64Array, stride: number): number[] {
  const result: number[] = []
  for (let offset = 0; offset < next.length; offset += stride) {
    for (let component = 0; component < stride; component++) {
      if (previous[offset + component] !== next[offset + component]) {
        result.push(offset / stride)
        break
      }
    }
  }
  return result
}
function sameIds(previous: readonly string[], next: readonly string[]): boolean {
  return previous.length === next.length && previous.every((id, index) => id === next[index])
}

/** A cancellable task boundary, including cleanup when clear/dispose interrupts it. */
function yieldTask(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      reject(aborted())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      if (signal.aborted) reject(aborted())
      else resolve()
    }, 0)
    if (signal.aborted) cancel()
    else signal.addEventListener('abort', cancel, { once: true })
  })
}

function lineSegments(
  segments: readonly (readonly [Vec3, Vec3])[],
  colors?: readonly Vec3[]
): LineSegments {
  const positions = new Float32Array(segments.length * 6)
  const colorValues = colors ? new Float32Array(segments.length * 6) : undefined
  segments.forEach((segment, index) => {
    positions.set(segment[0], index * 6)
    positions.set(segment[1], index * 6 + 3)
    if (colorValues && colors) {
      colorValues.set(colors[index], index * 6)
      colorValues.set(colors[index], index * 6 + 3)
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  if (colorValues) geometry.setAttribute('color', new BufferAttribute(colorValues, 3))
  return new LineSegments(
    geometry,
    new LineBasicMaterial({
      color: colorValues ? 0xffffff : 0xc32134,
      vertexColors: !!colorValues,
      toneMapped: false
    })
  )
}

/** All arithmetic here is graphics assembly from already computed scientific coordinates. */
function latticeEdges(basis: Matrix3): readonly (readonly [Vec3, Vec3])[] {
  const corners: Vec3[] = []
  for (let mask = 0; mask < 8; mask++) {
    const point = new Vector3()
    for (let axis = 0; axis < 3; axis++)
      if (mask & (1 << axis)) point.add(new Vector3(...basis[axis]))
    corners.push(xyz(point))
  }
  const edges: [Vec3, Vec3][] = []
  for (let mask = 0; mask < 8; mask++)
    for (let axis = 0; axis < 3; axis++)
      if (!(mask & (1 << axis))) edges.push([corners[mask], corners[mask | (1 << axis)]])
  return edges
}

class ThreeBackend implements ViewerBackend {
  private readonly gl: WebGL2RenderingContext
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
  private readonly cylinderUp = new Vector3(0, 1, 0)
  private readonly color = new Color()
  private readonly labelsRoot: HTMLDivElement
  private readonly performanceLabel: HTMLOutputElement
  private readonly pointerInteraction: ReturnType<typeof attachPointerInteraction>
  private layer?: InstanceLayer
  private auxiliary?: AuxiliaryLayer
  private interactionGroup?: Group
  private selectionGroup?: Group
  private interactionLabel?: Label
  private coordinationGroup?: Group
  private coordinationResult?: CoordinationResult
  private showPolyhedra = false
  private interaction: InteractionOverlay = EMPTY_OVERLAY
  private frame?: RenderFrame
  private pose: CameraPose = {
    position: [0, 0, 12],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovYDegrees: 45,
    near: 0.01,
    far: 10000
  }
  private width = 1
  private height = 1
  private disposed = false
  private lost = false
  private generation = 0
  private pending?: PendingCommit
  private raf?: number
  private shaderError?: Error
  private fpsStart = performance.now()
  private fpsFrames = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    overlay: HTMLElement,
    private readonly callbacks: BackendCallbacks
  ) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true })
    if (!gl) throw failure('WEBGL2_UNAVAILABLE', 'Alchemion requires a desktop WebGL2 context.')
    this.gl = gl
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, context: gl, antialias: true, alpha: false })
    } catch (error) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      throw error
    }
    this.renderer = renderer
    renderer.autoClear = false
    renderer.outputColorSpace = LinearSRGBColorSpace
    renderer.toneMapping = NoToneMapping
    renderer.setClearColor(new Color().setRGB(1, 1, 1), 1)
    renderer.debug.onShaderError = (context, program, vertex, fragment) => {
      this.shaderError = failure(
        'RENDER_SHADER',
        [
          context.getProgramInfoLog(program as unknown as WebGLProgram),
          context.getShaderInfoLog(vertex),
          context.getShaderInfoLog(fragment)
        ]
          .filter(Boolean)
          .join('\n') || 'A viewer shader could not be compiled.'
      )
    }
    this.labelsRoot = document.createElement('div')
    this.labelsRoot.dataset.alchemionLabels = ''
    Object.assign(this.labelsRoot.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      font: '12px system-ui, sans-serif',
      color: '#172033'
    })
    overlay.appendChild(this.labelsRoot)
    this.performanceLabel = document.createElement('output')
    this.performanceLabel.dataset.alchemionPerformance = ''
    Object.assign(this.performanceLabel.style, {
      position: 'absolute',
      left: '8px',
      top: '8px',
      padding: '4px 6px',
      background: '#ffffffdd',
      borderRadius: '3px',
      display: 'none'
    })
    this.labelsRoot.appendChild(this.performanceLabel)
    this.pointerInteraction = attachPointerInteraction(canvas, {
      active: () => !this.disposed && !this.lost && Boolean(this.frame),
      boxSelecting: () => this.frame?.options.interactionMode === 'box-select',
      rotate: (azimuth, elevation) => this.rotate(azimuth, elevation),
      zoom: (factor) => this.zoom(factor),
      click: (x, y, modifiers) => this.callbacks.click(x, y, modifiers),
      boxSelect: (rectangle, modifiers) => this.callbacks.boxSelect(rectangle, modifiers),
      error: (error) => this.callbacks.error(error)
    })
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    this.applyCamera()
  }

  async commit(frame: RenderFrame, context: RenderContext, signal: AbortSignal): Promise<void> {
    this.assertActive()
    if (this.lost)
      throw failure('WEBGL_CONTEXT_LOST', 'Restore the WebGL context before rendering.')
    this.pending?.controller.abort()
    const operation = { token: ++this.generation, controller: new AbortController() }
    this.pending = operation
    const cancel = () => operation.controller.abort()
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    const activeSignal = operation.controller.signal
    const start = performance.now()
    let preparedLayer: InstanceLayer | undefined
    let preparedAuxiliary: AuxiliaryLayer | undefined
    try {
      this.assertCommit(operation)
      const nextAtoms = atomValues(frame.atoms)
      const displayedBonds = frame.options.renderMode === 'ball-and-stick' ? frame.bonds : []
      const nextBonds = bondValues(displayedBonds)
      const atomIds = frame.atoms.map((atom) => atom.instance.id)
      const bondIds = displayedBonds.map((bond) => bond.bond.id)
      const reusable =
        this.layer &&
        this.layer.mode === frame.options.renderMode &&
        sameIds(this.layer.atomIds, atomIds) &&
        sameIds(this.layer.bondIds, bondIds)
      const dirtyAtoms = reusable
        ? dirtyIndices(this.layer!.atomValues, nextAtoms, ATOM_STRIDE)
        : atomIds.map((_, index) => index)
      const dirtyBonds = reusable
        ? dirtyIndices(this.layer!.bondValues, nextBonds, BOND_STRIDE)
        : bondIds.map((_, index) => index)
      if (!reusable) {
        preparedLayer = await this.prepareInstances(
          frame,
          atomIds,
          bondIds,
          nextAtoms,
          nextBonds,
          operation
        )
      }
      this.assertCommit(operation)
      const auxiliarySignature = JSON.stringify([
        frame.options.showLattice,
        frame.cell,
        frame.options.showReciprocalLattice,
        frame.reciprocal,
        frame.reciprocalPoints,
        frame.options.showBrillouinZone,
        frame.zone
      ])
      if (this.auxiliary?.signature !== auxiliarySignature)
        preparedAuxiliary = this.prepareAuxiliary(frame, auxiliarySignature)
      this.assertCommit(operation)
      // No await may separate mutation of active instance buffers from frame installation.
      if (preparedLayer) {
        if (this.layer) disposeTree(this.layer.group)
        this.layer = preparedLayer
        preparedLayer = undefined
        this.scene.add(this.layer.group)
      } else {
        const layer = this.layer!
        for (const index of dirtyAtoms) this.writeAtom(layer.atoms, nextAtoms, index, true)
        for (const index of dirtyBonds) this.writeBond(layer.bonds!, nextBonds, index, true)
        if (dirtyAtoms.length) this.finishInstances(layer.atoms)
        if (dirtyBonds.length) this.finishInstances(layer.bonds!)
        layer.atomValues = nextAtoms
        layer.bondValues = nextBonds
      }
      if (preparedAuxiliary) {
        this.releaseAuxiliary()
        this.auxiliary = preparedAuxiliary
        preparedAuxiliary = undefined
        this.scene.add(this.auxiliary.group)
        for (const label of this.auxiliary.labels) this.labelsRoot.appendChild(label.node)
        for (const inset of this.auxiliary.insets) {
          this.labelsRoot.appendChild(inset.title)
          for (const label of inset.labels) this.labelsRoot.appendChild(label.node)
        }
      }
      this.frame = frame
      this.updateInteraction()
      if (frame.fitToView) this.center()
      this.assertCommit(operation)
      this.draw()
      this.assertCommit(operation)
      await this.gpuComplete(activeSignal)
      this.assertCommit(operation)
      const end = performance.now()
      performance.measure('alchemion:render', {
        start,
        end,
        detail: {
          ...context,
          atoms: atomIds.length,
          bonds: bondIds.length,
          updatedAtoms: dirtyAtoms.length,
          updatedBonds: dirtyBonds.length,
          dirtyAtoms: dirtyAtoms.length,
          dirtyBonds: dirtyBonds.length
        }
      })
      this.schedule()
    } finally {
      signal.removeEventListener('abort', cancel)
      if (preparedLayer) disposeTree(preparedLayer.group)
      if (preparedAuxiliary) this.disposeAuxiliary(preparedAuxiliary)
      if (this.pending === operation) this.pending = undefined
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.assertActive()
    if (![width, height, dpr].every(Number.isFinite) || width < 0 || height < 0 || dpr <= 0)
      throw failure(
        'VIEWER_SIZE',
        'Viewer dimensions must be nonnegative and pixel ratio positive.'
      )
    const nextWidth = Math.max(1, width)
    const nextHeight = Math.max(1, height)
    if (
      nextWidth === this.width &&
      nextHeight === this.height &&
      dpr === this.renderer.getPixelRatio() &&
      this.canvas.width === Math.floor(nextWidth * dpr) &&
      this.canvas.height === Math.floor(nextHeight * dpr)
    )
      return
    this.width = nextWidth
    this.height = nextHeight
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(this.width, this.height, false)
    this.applyCamera()
    this.callbacks.changed()
    this.schedule()
  }

  pick(x: number, y: number): BackendPick | undefined {
    const hit = this.intersection(x, y)
    if (!hit || hit.instanceId === undefined || !this.layer) return undefined
    const atom = hit.object === this.layer.atoms
    return {
      kind: atom ? 'atom' : 'bond',
      instanceId: (atom ? this.layer.atomIds : this.layer.bondIds)[hit.instanceId],
      cartesian: xyz(hit.point)
    }
  }

  selectBox(rectangle: ScreenRectangle): readonly string[] {
    this.assertActive()
    const { x, y, width, height } = rectangle
    if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0)
      throw failure('SELECTION_RECTANGLE', 'Selection requires a finite, nonnegative rectangle.')
    if (!this.frame || this.lost) return []
    const result: string[] = []
    for (const { instance } of this.frame.atoms) {
      const point = new Vector3(...instance.cartesian).project(this.camera)
      if (point.z < -1 || point.z > 1) continue
      const px = ((point.x + 1) / 2) * this.width
      const py = ((1 - point.y) / 2) * this.height
      if (px >= x && px <= x + width && py >= y && py <= y + height && this.mainPoint(px, py))
        result.push(instance.id)
    }
    return result
  }

  async exportPng(options: BackendPngOptions, signal: AbortSignal): Promise<Blob> {
    this.assertActive()
    if (signal.aborted) throw aborted()
    if (!this.frame || this.lost)
      throw failure(
        'PNG_FRAME_UNAVAILABLE',
        'A complete displayed frame is required for PNG export.'
      )
    const { width, height, transparent } = options
    const limit = Math.min(
      this.renderer.capabilities.maxTextureSize,
      this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE) as number
    )
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width > limit ||
      height > limit
    )
      throw failure('PNG_SIZE', 'PNG dimensions exceed the supported positive pixel dimensions.')
    const renderer = this.renderer
    const previousTarget = renderer.getRenderTarget()
    const previousViewport = renderer.getViewport(new Vector4())
    const previousScissor = renderer.getScissor(new Vector4())
    const previousScissorTest = renderer.getScissorTest()
    const previousColor = renderer.getClearColor(new Color())
    const previousAlpha = renderer.getClearAlpha()
    const selection = this.selectionGroup
    const previousSelectionVisibility = selection?.visible
    const target = new WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
      samples: Math.min(4, renderer.capabilities.maxSamples)
    })
    const pixels = new Uint8Array(width * height * 4)
    const texts: CaptureText[] = []
    try {
      if (selection) selection.visible = false
      const camera = this.camera.clone()
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      const scale = Math.min(width / this.width, height / this.height)
      const fullRect = { x: 0, y: 0, width, height }
      target.viewport.set(0, 0, width, height)
      target.scissorTest = false
      renderer.setRenderTarget(target)
      if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE)
        throw failure('PNG_ALLOCATION_FAILED', 'The GPU could not allocate the PNG render target.')
      renderer.setClearColor(transparent ? 0x000000 : 0xffffff, transparent ? 0 : 1)
      renderer.clear(true, true, true)
      renderer.render(this.scene, camera)
      for (const label of this.auxiliary?.labels ?? [])
        this.captureLabel(texts, label, camera, fullRect, scale)
      if (this.interactionLabel)
        this.captureLabel(texts, this.interactionLabel, camera, fullRect, scale)
      const insets = this.auxiliary?.insets ?? []
      for (let index = 0; index < insets.length; index++) {
        const inset = insets[index]
        const rect = this.insetRectangle(width, height, index, insets.length, scale)
        const insetCamera = inset.camera.clone()
        this.configureInsetCamera(inset, insetCamera)
        target.viewport.set(rect.x, height - rect.y - rect.height, rect.width, rect.height)
        target.scissor.copy(target.viewport)
        target.scissorTest = true
        renderer.setRenderTarget(target)
        renderer.setClearColor(
          transparent ? 0x000000 : new Color().setRGB(0.965, 0.972, 0.99),
          transparent ? 0 : 1
        )
        renderer.clear(true, true, true)
        renderer.render(inset.scene, insetCamera)
        texts.push({
          text: inset.title.textContent ?? '',
          color: '#172033',
          x: rect.x,
          y: rect.y,
          scale,
          clip: rect,
          title: true
        })
        for (const label of inset.labels) this.captureLabel(texts, label, insetCamera, rect, scale)
      }
      if (signal.aborted) throw aborted()
      if (this.shaderError) throw this.shaderError
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
      if (this.gl.isContextLost())
        throw failure('WEBGL_CONTEXT_LOST', 'The WebGL context was lost during PNG export.')
    } finally {
      if (selection && previousSelectionVisibility !== undefined)
        selection.visible = previousSelectionVisibility
      try {
        renderer.setRenderTarget(previousTarget)
        renderer.setViewport(previousViewport)
        renderer.setScissor(previousScissor)
        renderer.setScissorTest(previousScissorTest)
        renderer.setClearColor(previousColor, previousAlpha)
      } finally {
        target.dispose()
      }
    }
    if (signal.aborted) throw aborted()
    return encodePng(pixels, width, height, transparent, texts, signal)
  }

  point(x: number, y: number): { cartesian: Vec3; source: 'surface' | 'view-plane' } | undefined {
    if (!this.prepareRay(x, y)) return undefined
    const hit = this.intersection(x, y)
    if (hit) return { cartesian: xyz(hit.point), source: 'surface' }
    const normal = this.camera.getWorldDirection(new Vector3())
    const plane = new Plane().setFromNormalAndCoplanarPoint(
      normal,
      new Vector3(...this.pose.target)
    )
    const point = this.raycaster.ray.intersectPlane(plane, new Vector3())
    return point ? { cartesian: xyz(point), source: 'view-plane' } : undefined
  }

  getCamera(): CameraPose {
    return copyPose(this.pose)
  }
  setCamera(pose: CameraPose): void {
    this.assertActive()
    validatePose(pose)
    const next = copyPose(pose)
    if (JSON.stringify(next) === JSON.stringify(this.pose)) return
    this.pose = next
    this.applyCamera()
    this.callbacks.changed()
    this.schedule()
  }
  rotate(azimuthDegrees: number, elevationDegrees: number): void {
    this.assertActive()
    if (![azimuthDegrees, elevationDegrees].every(Number.isFinite))
      throw failure('CAMERA_PARAMETER', 'Camera rotation must use finite angles in degrees.')
    const up = new Vector3(...this.pose.up).normalize()
    const offset = new Vector3(...this.pose.position).sub(new Vector3(...this.pose.target))
    offset.applyAxisAngle(up, (azimuthDegrees * Math.PI) / 180)
    const elevation = Math.asin(Math.max(-1, Math.min(1, offset.clone().normalize().dot(up))))
    const requested = elevation + (elevationDegrees * Math.PI) / 180
    const clamped = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, requested))
    const right = offset.clone().cross(up).normalize()
    offset.applyAxisAngle(right, clamped - elevation)
    this.setCamera({ ...this.pose, position: xyz(new Vector3(...this.pose.target).add(offset)) })
  }
  zoom(factor: number): void {
    this.assertActive()
    if (!Number.isFinite(factor) || factor <= 0)
      throw failure('CAMERA_PARAMETER', 'The zoom factor must be finite and positive.')
    const offset = new Vector3(...this.pose.position).sub(new Vector3(...this.pose.target))
    const distance = Math.max(
      this.pose.near * 2,
      Math.min(this.pose.far * 0.8, offset.length() * factor)
    )
    offset.setLength(distance)
    this.setCamera({ ...this.pose, position: xyz(new Vector3(...this.pose.target).add(offset)) })
  }
  center(): void {
    this.assertActive()
    const bounds = this.layer?.atoms.boundingBox?.clone() ?? new Box3()
    if (this.layer?.bonds?.boundingBox) bounds.union(this.layer.bonds.boundingBox)
    if (bounds.isEmpty() && this.frame?.cell) {
      bounds.expandByPoint(new Vector3())
      for (const edge of latticeEdges(this.frame.cell.basis)) {
        bounds.expandByPoint(new Vector3(...edge[0]))
        bounds.expandByPoint(new Vector3(...edge[1]))
      }
    }
    if (bounds.isEmpty()) return
    const target = bounds.getCenter(new Vector3())
    const radius = Math.max(0.1, bounds.getSize(new Vector3()).length() / 2)
    const vertical = (this.pose.fovYDegrees * Math.PI) / 180
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * (this.width / this.height))
    const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.12
    const offset = new Vector3(...this.pose.position)
      .sub(new Vector3(...this.pose.target))
      .setLength(distance)
    this.setCamera({
      ...this.pose,
      target: xyz(target),
      position: xyz(target.clone().add(offset)),
      near: Math.max(0.001, distance - radius * 2),
      far: Math.max(distance + radius * 4, 1)
    })
  }

  setOverlay(overlay: InteractionOverlay): void {
    if (this.disposed) return
    const measurementChanged =
      this.interaction.label !== overlay.label ||
      JSON.stringify(this.interaction.points) !== JSON.stringify(overlay.points)
    this.interaction = structuredClone(overlay)
    this.updateInteraction()
    if (measurementChanged) this.callbacks.changed()
    this.schedule()
  }

  setCoordination(result: CoordinationResult | undefined, showPolyhedra: boolean): void {
    if (this.disposed) return
    if (this.coordinationResult === result && this.showPolyhedra === showPolyhedra) return
    let prepared: Group | undefined
    if (result && showPolyhedra) {
      prepared = new Group()
      try {
        for (const center of result.centers) {
          const polyhedron = center.polyhedron
          if (!polyhedron) continue
          const geometry = new BufferGeometry()
          geometry.setAttribute(
            'position',
            new BufferAttribute(new Float32Array(polyhedron.vertices.flat()), 3)
          )
          geometry.setIndex(polyhedron.triangles.flat())
          prepared.add(
            new Mesh(
              geometry,
              new MeshBasicMaterial({
                color: 0x3c91ba,
                side: DoubleSide,
                transparent: true,
                opacity: 0.2,
                depthWrite: false,
                toneMapped: false
              })
            )
          )
          const edges = new Map<string, readonly [Vec3, Vec3]>()
          for (const face of polyhedron.faces)
            for (let index = 0; index < face.length; index++) {
              const a = face[index]
              const b = face[(index + 1) % face.length]
              edges.set(a < b ? `${a}:${b}` : `${b}:${a}`, [
                polyhedron.vertices[a],
                polyhedron.vertices[b]
              ])
            }
          prepared.add(
            lineSegments(
              [...edges.values()],
              [...edges.values()].map(() => [0.1, 0.3, 0.4])
            )
          )
        }
      } catch (error) {
        disposeTree(prepared)
        throw error
      }
    }
    const changed = this.showPolyhedra || showPolyhedra
    if (this.coordinationGroup) disposeTree(this.coordinationGroup)
    this.coordinationGroup = prepared
    this.coordinationResult = result
    this.showPolyhedra = showPolyhedra
    if (prepared) this.scene.add(prepared)
    if (changed) {
      this.callbacks.changed()
      this.schedule()
    }
  }

  clear(): void {
    if (this.disposed) return
    this.generation++
    this.pending?.controller.abort()
    this.pending = undefined
    this.pointerInteraction.clear()
    this.cancelScheduled()
    if (this.layer) disposeTree(this.layer.group)
    this.layer = undefined
    this.releaseAuxiliary()
    this.releaseInteraction()
    if (this.coordinationGroup) disposeTree(this.coordinationGroup)
    this.coordinationGroup = undefined
    this.coordinationResult = undefined
    this.showPolyhedra = false
    this.interaction = EMPTY_OVERLAY
    this.frame = undefined
    this.performanceLabel.style.display = 'none'
    this.shaderError = undefined
    this.renderer.renderLists.dispose()
    if (!this.lost) this.draw()
  }
  dispose(): void {
    if (this.disposed) return
    try {
      this.clear()
    } finally {
      this.disposed = true
      this.pointerInteraction.dispose()
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
      this.labelsRoot.remove()
      this.renderer.dispose()
      this.renderer.forceContextLoss()
    }
  }

  private assertActive() {
    if (this.disposed) throw failure('VIEWER_DISPOSED', 'The viewer backend has been disposed.')
  }
  private assertCommit(operation: PendingCommit) {
    if (
      this.disposed ||
      this.lost ||
      operation.token !== this.generation ||
      operation.controller.signal.aborted
    )
      throw aborted()
  }
  private createInstances(
    geometry: BufferGeometry,
    count: number,
    material: ReturnType<typeof instanceMaterial>
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, count)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
    mesh.instanceColor.setUsage(DynamicDrawUsage)
    return mesh
  }
  private async prepareInstances(
    frame: RenderFrame,
    atomIds: readonly string[],
    bondIds: readonly string[],
    atoms: Float64Array,
    bonds: Float64Array,
    operation: PendingCommit
  ): Promise<InstanceLayer> {
    const group = new Group()
    try {
      this.assertCommit(operation)
      const material = instanceMaterial()
      const atomMesh = this.createInstances(sphereGeometry(), atomIds.length, material)
      group.add(atomMesh)
      const bondMesh =
        frame.options.renderMode === 'ball-and-stick'
          ? this.createInstances(cylinderGeometry(), bondIds.length, material)
          : undefined
      if (bondMesh) group.add(bondMesh)
      for (let index = 0; index < atomIds.length; index++) {
        this.writeAtom(atomMesh, atoms, index)
        if ((index + 1) % CHUNK_SIZE === 0 && index + 1 < atomIds.length) {
          this.assertCommit(operation)
          await yieldTask(operation.controller.signal)
          this.assertCommit(operation)
        }
      }
      this.finishInstances(atomMesh)
      if (bondMesh) {
        for (let index = 0; index < bondIds.length; index++) {
          this.writeBond(bondMesh, bonds, index)
          if ((index + 1) % CHUNK_SIZE === 0 && index + 1 < bondIds.length) {
            this.assertCommit(operation)
            await yieldTask(operation.controller.signal)
            this.assertCommit(operation)
          }
        }
        this.finishInstances(bondMesh)
      }
      this.assertCommit(operation)
      return {
        group,
        atoms: atomMesh,
        bonds: bondMesh,
        atomIds,
        bondIds,
        mode: frame.options.renderMode,
        atomValues: atoms,
        bondValues: bonds
      }
    } catch (error) {
      disposeTree(group)
      throw error
    }
  }
  private writeAtom(mesh: InstancedMesh, values: Float64Array, index: number, update = false) {
    const offset = index * ATOM_STRIDE
    this.position.fromArray(values, offset)
    this.rotation.identity()
    this.scale.setScalar(values[offset + 6])
    this.matrix.compose(this.position, this.rotation, this.scale)
    mesh.setMatrixAt(index, this.matrix)
    this.color.setRGB(
      values[offset + 3],
      values[offset + 4],
      values[offset + 5],
      LinearSRGBColorSpace
    )
    mesh.setColorAt(index, this.color)
    if (update) this.markRanges(mesh, index)
  }
  private writeBond(mesh: InstancedMesh, values: Float64Array, index: number, update = false) {
    const offset = index * BOND_STRIDE
    this.position.fromArray(values, offset)
    this.direction.fromArray(values, offset + 3).sub(this.position)
    const length = this.direction.length()
    this.position.addScaledVector(this.direction, 0.5)
    this.rotation.identity()
    if (length > 0)
      this.rotation.setFromUnitVectors(this.cylinderUp, this.direction.multiplyScalar(1 / length))
    // Degenerate explicit geometry is invisible, without NaN matrices or fake pick surfaces.
    this.scale.set(length > 0 ? values[offset + 9] : 0, length, length > 0 ? values[offset + 9] : 0)
    this.matrix.compose(this.position, this.rotation, this.scale)
    mesh.setMatrixAt(index, this.matrix)
    this.color.setRGB(
      values[offset + 6],
      values[offset + 7],
      values[offset + 8],
      LinearSRGBColorSpace
    )
    mesh.setColorAt(index, this.color)
    if (update) this.markRanges(mesh, index)
  }
  private markRanges(mesh: InstancedMesh, index: number) {
    mesh.instanceMatrix.addUpdateRange(index * 16, 16)
    mesh.instanceColor!.addUpdateRange(index * 3, 3)
  }
  private finishInstances(mesh: InstancedMesh) {
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    mesh.updateMatrixWorld(true)
  }

  private label(text: string, position: Vec3, color = '#172033'): Label {
    const node = document.createElement('span')
    node.textContent = text
    node.dataset.alchemionLabel = text
    Object.assign(node.style, {
      position: 'absolute',
      whiteSpace: 'nowrap',
      transform: 'translate(-50%, -50%)',
      padding: '2px 4px',
      background: '#ffffffdf',
      borderRadius: '2px',
      color
    })
    return { node, position: new Vector3(...position), text, color }
  }
  private prepareAuxiliary(frame: RenderFrame, signature: string): AuxiliaryLayer {
    const group = new Group()
    const labels: Label[] = []
    const insets: Inset[] = []
    try {
      if (frame.options.showLattice && frame.cell) {
        const edges = latticeEdges(frame.cell.basis)
        group.add(
          lineSegments(
            edges,
            edges.map((_, index) => (index < 3 ? AXIS_COLORS[index] : [0.3, 0.34, 0.4]))
          )
        )
        for (let axis = 0; axis < 3; axis++)
          labels.push(this.label(['a', 'b', 'c'][axis], frame.cell.basis[axis], AXIS_CSS[axis]))
      }
      if (frame.options.showReciprocalLattice && frame.reciprocal) {
        const scene = new Scene()
        const basis = frame.reciprocal.basis
        scene.add(
          lineSegments(
            basis.map((point) => [[0, 0, 0] as Vec3, point] as const),
            AXIS_COLORS
          )
        )
        const geometry = new BufferGeometry()
        const points = frame.reciprocalPoints ?? [[0, 0, 0] as Vec3, ...basis]
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(points.flat()), 3))
        scene.add(
          new Points(
            geometry,
            new PointsMaterial({
              color: 0x354259,
              size: 6,
              sizeAttenuation: false,
              toneMapped: false
            })
          )
        )
        const axisLabels = basis.map((point, index) =>
          this.label(['a*', 'b*', 'c*'][index], point, AXIS_CSS[index])
        )
        insets.push(this.inset(scene, 'Reciprocal lattice · Å⁻¹', axisLabels))
      }
      if (frame.options.showBrillouinZone && frame.zone) {
        const scene = new Scene()
        const geometry = new BufferGeometry()
        geometry.setAttribute(
          'position',
          new BufferAttribute(new Float32Array(frame.zone.vertices.flat()), 3)
        )
        geometry.setIndex(frame.zone.triangles.flat())
        geometry.computeVertexNormals()
        scene.add(
          new Mesh(
            geometry,
            new MeshBasicMaterial({
              color: 0x5965cf,
              side: DoubleSide,
              transparent: true,
              opacity: 0.24,
              depthWrite: false,
              toneMapped: false
            })
          )
        )
        const edges = new Map<string, readonly [Vec3, Vec3]>()
        for (const face of frame.zone.faces)
          for (let index = 0; index < face.vertices.length; index++) {
            const a = face.vertices[index]
            const b = face.vertices[(index + 1) % face.vertices.length]
            edges.set(a < b ? `${a}:${b}` : `${b}:${a}`, [
              frame.zone.vertices[a],
              frame.zone.vertices[b]
            ])
          }
        const lines = lineSegments(
          [...edges.values()],
          [...edges.values()].map(() => [0.15, 0.18, 0.52])
        )
        scene.add(lines)
        insets.push(this.inset(scene, 'First Brillouin zone · Å⁻¹', []))
      }
      return { group, labels, insets, signature }
    } catch (error) {
      const partial = { group, labels, insets, signature }
      this.disposeAuxiliary(partial)
      throw error
    }
  }
  private inset(scene: Scene, text: string, labels: readonly Label[]): Inset {
    scene.updateMatrixWorld(true)
    const box = new Box3().setFromObject(scene)
    const target = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3())
    const radius = box.isEmpty() ? 1 : Math.max(0.1, box.getSize(new Vector3()).length() / 2)
    const title = document.createElement('div')
    title.textContent = text
    title.dataset.alchemionInset = text
    Object.assign(title.style, {
      position: 'absolute',
      padding: '4px 6px',
      background: '#eef1faed',
      fontSize: '11px',
      boxSizing: 'border-box',
      borderTop: '1px solid #c6cddd'
    })
    return {
      scene,
      camera: new PerspectiveCamera(40, 1, 0.001, 1000),
      title,
      labels,
      radius,
      target,
      rect: { x: 0, y: 0, width: 1, height: 1 }
    }
  }
  private disposeAuxiliary(auxiliary: AuxiliaryLayer) {
    disposeTree(auxiliary.group)
    for (const label of auxiliary.labels) label.node.remove()
    for (const inset of auxiliary.insets) {
      disposeTree(inset.scene)
      inset.title.remove()
      for (const label of inset.labels) label.node.remove()
    }
  }
  private releaseAuxiliary() {
    if (this.auxiliary) this.disposeAuxiliary(this.auxiliary)
    this.auxiliary = undefined
  }

  private releaseInteraction() {
    if (this.interactionGroup) disposeTree(this.interactionGroup)
    this.interactionGroup = undefined
    this.selectionGroup = undefined
    this.interactionLabel?.node.remove()
    this.interactionLabel = undefined
  }
  private updateInteraction() {
    this.releaseInteraction()
    if (!this.layer) return
    const group = new Group()
    this.interactionGroup = group
    const selection = new Group()
    this.selectionGroup = selection
    group.add(selection)
    const atomSet = new Set(this.interaction.selectedAtomIds)
    const atomIndices = this.layer.atomIds.flatMap((id, index) => (atomSet.has(id) ? [index] : []))
    if (atomIndices.length) {
      const mesh = this.createInstances(
        sphereGeometry(),
        atomIndices.length,
        instanceMaterial(true)
      )
      selection.add(mesh)
      const values = new Float64Array(atomIndices.length * ATOM_STRIDE)
      atomIndices.forEach((source, index) => {
        values.set(
          this.layer!.atomValues.subarray(source * ATOM_STRIDE, (source + 1) * ATOM_STRIDE),
          index * ATOM_STRIDE
        )
        values.set([1, 0.6, 0.02], index * ATOM_STRIDE + 3)
        values[index * ATOM_STRIDE + 6] *= 1.055
        this.writeAtom(mesh, values, index)
      })
      mesh.renderOrder = 10
      this.finishInstances(mesh)
    }
    const bondSet = new Set(this.interaction.selectedBondIds)
    const bondIndices = this.layer.bondIds.flatMap((id, index) => (bondSet.has(id) ? [index] : []))
    if (bondIndices.length) {
      const mesh = this.createInstances(
        cylinderGeometry(),
        bondIndices.length,
        instanceMaterial(true)
      )
      selection.add(mesh)
      const values = new Float64Array(bondIndices.length * BOND_STRIDE)
      bondIndices.forEach((source, index) => {
        values.set(
          this.layer!.bondValues.subarray(source * BOND_STRIDE, (source + 1) * BOND_STRIDE),
          index * BOND_STRIDE
        )
        values.set([1, 0.6, 0.02], index * BOND_STRIDE + 6)
        values[index * BOND_STRIDE + 9] *= 1.4
        this.writeBond(mesh, values, index)
      })
      mesh.renderOrder = 10
      this.finishInstances(mesh)
    }
    if (this.interaction.points.length > 1) {
      const segments = this.interaction.points
        .slice(1)
        .map((point, index) => [this.interaction.points[index], point] as const)
      const lines = lineSegments(segments)
      lines.renderOrder = 11
      ;(lines.material as LineBasicMaterial).depthTest = false
      group.add(lines)
    }
    if (this.interaction.label && this.interaction.points.length) {
      const center = new Vector3()
      for (const point of this.interaction.points) center.add(new Vector3(...point))
      center.multiplyScalar(1 / this.interaction.points.length)
      this.interactionLabel = this.label(this.interaction.label, xyz(center), '#a11228')
      this.interactionLabel.node.dataset.alchemionMeasurement = ''
      this.labelsRoot.appendChild(this.interactionLabel.node)
    }
    this.scene.add(group)
  }

  private applyCamera() {
    this.camera.position.set(...this.pose.position)
    this.camera.up.set(...this.pose.up)
    this.camera.fov = this.pose.fovYDegrees
    this.camera.near = this.pose.near
    this.camera.far = this.pose.far
    this.camera.aspect = this.width / this.height
    this.camera.lookAt(...this.pose.target)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
  }
  private mainPoint(x: number, y: number): boolean {
    if (
      this.disposed ||
      this.lost ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      x > this.width ||
      y > this.height
    )
      return false
    const insets = this.auxiliary?.insets ?? []
    return !insets.some((_, index) => {
      const rect = this.insetRectangle(this.width, this.height, index, insets.length)
      return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    })
  }
  private prepareRay(x: number, y: number): boolean {
    if (!this.frame || !this.mainPoint(x, y)) return false
    this.pointer.set((x / this.width) * 2 - 1, 1 - (y / this.height) * 2)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return true
  }
  private intersection(x: number, y: number) {
    if (!this.layer || !this.prepareRay(x, y)) return undefined
    const meshes = this.layer.bonds ? [this.layer.atoms, this.layer.bonds] : [this.layer.atoms]
    return this.raycaster.intersectObjects(meshes, false)[0]
  }
  private labelPosition(label: Label, camera: PerspectiveCamera, rect: ScreenRectangle) {
    const projected = label.position.clone().project(camera)
    const visible =
      projected.z >= -1 &&
      projected.z <= 1 &&
      Math.abs(projected.x) <= 1 &&
      Math.abs(projected.y) <= 1
    return visible
      ? {
          x: rect.x + ((projected.x + 1) / 2) * rect.width,
          y: rect.y + ((1 - projected.y) / 2) * rect.height
        }
      : undefined
  }
  private placeLabel(label: Label, camera: PerspectiveCamera, rect: ScreenRectangle) {
    const position = this.labelPosition(label, camera, rect)
    label.node.style.display = position ? 'block' : 'none'
    if (!position) return
    label.node.style.left = `${position.x}px`
    label.node.style.top = `${position.y}px`
  }
  private captureLabel(
    texts: CaptureText[],
    label: Label,
    camera: PerspectiveCamera,
    rect: ScreenRectangle,
    scale: number
  ) {
    const position = this.labelPosition(label, camera, rect)
    if (position)
      texts.push({ text: label.text, color: label.color, ...position, clip: rect, scale })
  }
  private insetRectangle(
    width: number,
    height: number,
    index: number,
    count: number,
    scale = 1
  ): ScreenRectangle {
    const margin = Math.min(12 * scale, width / 20)
    const size = Math.max(
      1,
      Math.min(240 * scale, (width - margin * (count + 1)) / Math.max(1, count), height * 0.36)
    )
    return {
      x: width - (index + 1) * (size + margin),
      y: height - size - margin,
      width: size,
      height: size
    }
  }
  private configureInsetCamera(inset: Inset, camera: PerspectiveCamera) {
    const offset = new Vector3(...this.pose.position)
      .sub(new Vector3(...this.pose.target))
      .normalize()
    const distance = (inset.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15
    camera.position.copy(inset.target).addScaledVector(offset, distance)
    camera.up.set(...this.pose.up)
    camera.near = Math.max(0.0001, distance - inset.radius * 2)
    camera.far = distance + inset.radius * 4
    camera.lookAt(inset.target)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
  }
  private draw() {
    if (this.disposed || this.lost) return
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.width, this.height)
    this.renderer.setClearColor(new Color().setRGB(1, 1, 1), 1)
    this.renderer.clear(true, true, true)
    this.renderer.render(this.scene, this.camera)
    const fullRect = { x: 0, y: 0, width: this.width, height: this.height }
    for (const label of this.auxiliary?.labels ?? []) this.placeLabel(label, this.camera, fullRect)
    if (this.interactionLabel) this.placeLabel(this.interactionLabel, this.camera, fullRect)
    const insets = this.auxiliary?.insets ?? []
    for (let index = 0; index < insets.length; index++) {
      const inset = insets[index]
      const rect = this.insetRectangle(this.width, this.height, index, insets.length)
      inset.rect = rect
      this.configureInsetCamera(inset, inset.camera)
      this.renderer.setScissorTest(true)
      this.renderer.setViewport(rect.x, this.height - rect.y - rect.height, rect.width, rect.height)
      this.renderer.setScissor(rect.x, this.height - rect.y - rect.height, rect.width, rect.height)
      this.renderer.setClearColor(new Color().setRGB(0.965, 0.972, 0.99), 1)
      this.renderer.clear(true, true, true)
      this.renderer.render(inset.scene, inset.camera)
      Object.assign(inset.title.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`
      })
      for (const label of inset.labels) this.placeLabel(label, inset.camera, rect)
    }
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.width, this.height)
    if (this.shaderError) throw this.shaderError
    const showPerformance = this.frame?.options.showPerformance ?? false
    this.performanceLabel.style.display = showPerformance ? 'block' : 'none'
    if (showPerformance) {
      const now = performance.now()
      this.fpsFrames++
      if (now - this.fpsStart >= 500) {
        this.performanceLabel.textContent = `${Math.round((this.fpsFrames * 1000) / (now - this.fpsStart))} FPS · ${this.layer?.atomIds.length ?? 0} atoms`
        this.fpsStart = now
        this.fpsFrames = 0
      }
    } else {
      this.fpsStart = performance.now()
      this.fpsFrames = 0
    }
  }
  private schedule() {
    if (this.raf !== undefined || this.disposed || this.lost) return
    this.raf = requestAnimationFrame(() => {
      this.raf = undefined
      if (this.disposed || this.lost) return
      try {
        this.draw()
        if (this.frame?.options.showPerformance) this.schedule()
      } catch (error) {
        this.callbacks.error(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
  private cancelScheduled() {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf)
    this.raf = undefined
  }
  private async gpuComplete(signal: AbortSignal) {
    if (signal.aborted) throw aborted()
    if (this.gl.isContextLost())
      throw failure('WEBGL_CONTEXT_LOST', 'The WebGL context was lost during frame submission.')
    const fence = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!fence)
      throw failure('RENDER_GPU_FENCE', 'The viewer could not allocate a GPU completion fence.')
    const started = performance.now()
    this.gl.flush()
    try {
      while (true) {
        if (signal.aborted) throw aborted()
        if (this.gl.isContextLost())
          throw failure('WEBGL_CONTEXT_LOST', 'The WebGL context was lost during frame submission.')
        const state = this.gl.clientWaitSync(fence, 0, 0)
        if (state === this.gl.ALREADY_SIGNALED || state === this.gl.CONDITION_SATISFIED) break
        if (state === this.gl.WAIT_FAILED)
          throw failure('RENDER_GPU_FENCE', 'GPU completion could not be observed.')
        if (performance.now() - started > 30000)
          throw failure('RENDER_GPU_TIMEOUT', 'GPU frame completion exceeded 30 seconds.')
        await yieldTask(signal)
        if (signal.aborted) throw aborted()
      }
    } finally {
      this.gl.deleteSync(fence)
    }
    if (signal.aborted) throw aborted()
  }
  private onContextLost = (event: Event) => {
    if (this.disposed) return
    event.preventDefault()
    this.lost = true
    this.clear()
    this.callbacks.contextLost()
  }
  private onContextRestored = () => {
    if (this.disposed) return
    this.lost = false
    this.shaderError = undefined
    this.applyCamera()
    this.callbacks.contextRestored()
  }
}

export function createThreeBackend(
  canvas: HTMLCanvasElement,
  overlay: HTMLElement,
  callbacks: BackendCallbacks
): ViewerBackend {
  return new ThreeBackend(canvas, overlay, callbacks)
}
