import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Triangle,
  Vector3
} from 'three'
import type { Intersection, Object3D } from 'three'
import { norm } from '../../core/math'
import type { Vec3 } from '../../core/types'
import type { RenderResultLayer } from '../results/controller'
import type { ResultPick } from '../results/types'
import type { ResultGlyph } from '../results/task'

export interface ResultDrawing {
  readonly layer: RenderResultLayer
  readonly group: Group
  readonly legend: string
  readonly colors: readonly [string, string]
  readonly node: HTMLDivElement
  readonly glyphs: readonly ResultGlyph[]
  readonly read: (hit: Intersection) => ResultPick | undefined
}

const toVec = (vector: Vector3): Vec3 => [vector.x, vector.y, vector.z]
const low = '#253fac'
const high = '#e24e43'
const fixed = '#198a9b'

export function prepareResultDrawing(layer: RenderResultLayer, document: Document): ResultDrawing {
  const { geometry, spec } = layer
  const group = new Group()
  const glyphs = geometry.glyphs ?? []
  const magnitude = (value: ResultGlyph['value']) =>
    typeof value === 'number' ? value : value ? norm(value) : 0
  const readers = new Map<
    Object3D,
    (hit: Intersection) => { value?: number | Vec3; atomId?: string }
  >()
  const gradient = !!geometry.meshes?.some((part) => part.gradient) || spec.kind === 'atomic'
  const firstColor = gradient ? low : (geometry.meshes?.[0]?.color ?? spec.color ?? fixed)
  const lastColor = gradient ? (spec.color ?? high) : (geometry.meshes?.[1]?.color ?? firstColor)
  let lo = Infinity
  let hi = -Infinity
  function range(value: number) {
    lo = Math.min(lo, value)
    hi = Math.max(hi, value)
  }
  for (const mesh of geometry.meshes ?? []) if (mesh.gradient) mesh.values.forEach(range)
  if (spec.kind === 'atomic') for (const glyph of glyphs) range(magnitude(glyph.value))
  lo = spec.min ?? lo
  hi = spec.max ?? hi
  const start = new Color(firstColor)
  const end = new Color(lastColor)
  const tint = new Color()
  const color = (value: number) =>
    tint.copy(start).lerp(end, hi > lo ? Math.min(1, Math.max(0, (value - lo) / (hi - lo))) : 0.5)
  const opacity = spec.opacity ?? (spec.kind === 'surface' ? 0.65 : 1)
  const order = spec.order ?? 0
  for (const part of geometry.meshes ?? []) {
    if (!part.positions.length) continue
    const meshGeometry = new BufferGeometry().setAttribute(
      'position',
      new BufferAttribute(part.positions, 3)
    )
    if (part.gradient) {
      const rgb = new Float32Array(part.values.length * 3)
      part.values.forEach((value, index) => color(value).toArray(rgb, index * 3))
      meshGeometry.setAttribute('color', new BufferAttribute(rgb, 3))
    }
    const mesh = new Mesh(
      meshGeometry,
      new MeshBasicMaterial({
        color: part.gradient ? '#ffffff' : (part.color ?? firstColor),
        vertexColors: !!part.gradient,
        side: DoubleSide,
        opacity,
        transparent: opacity < 1,
        depthWrite: opacity === 1
      })
    )
    mesh.renderOrder = order
    group.add(mesh)
    readers.set(mesh, (hit) => {
      const face = hit.face
      if (!face) return {}
      const positions = meshGeometry.getAttribute('position')
      const weights = Triangle.getBarycoord(
        hit.point,
        new Vector3().fromBufferAttribute(positions, face.a),
        new Vector3().fromBufferAttribute(positions, face.b),
        new Vector3().fromBufferAttribute(positions, face.c),
        new Vector3()
      )
      return {
        value: weights
          ? weights.x * part.values[face.a] +
            weights.y * part.values[face.b] +
            weights.z * part.values[face.c]
          : undefined
      }
    })
  }
  if (glyphs.length) {
    const positions = new Float32Array(glyphs.length * 3)
    const rgb = new Float32Array(positions.length)
    const lines: number[] = []
    const lineColors: number[] = []
    const lineRows: number[] = []
    for (const [index, glyph] of glyphs.entries()) {
      const glyphColor = gradient ? color(magnitude(glyph.value)) : start
      positions.set(glyph.position, index * 3)
      glyphColor.toArray(rgb, index * 3)
      if (!glyph.tip) continue
      const a = new Vector3(...glyph.position),
        b = new Vector3(...glyph.tip)
      const [origin, tip] =
        spec.kind === 'comparison' || spec.kind === 'vibration' ? [b, a] : [a, b]
      const axis = tip.clone().sub(origin)
      const length = axis.length()
      if (!length) continue
      axis.divideScalar(length)
      const cross = axis
        .clone()
        .cross(Math.abs(axis.z) < 0.8 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0))
        .normalize()
        .multiplyScalar(length * 0.1)
      const base = tip.clone().addScaledVector(axis, -length * 0.24)
      lines.push(
        ...toVec(origin),
        ...toVec(tip),
        ...toVec(tip),
        ...toVec(base.clone().add(cross)),
        ...toVec(tip),
        ...toVec(base.sub(cross))
      )
      for (let vertex = 0; vertex < 6; vertex++)
        lineColors.push(glyphColor.r, glyphColor.g, glyphColor.b)
      lineRows.push(index, index, index)
    }
    const alwaysVisible = spec.kind === 'atomic' || spec.kind === 'vibration'
    const points = new Points(
      new BufferGeometry()
        .setAttribute('position', new BufferAttribute(positions, 3))
        .setAttribute('color', new BufferAttribute(rgb, 3)),
      new PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        size: spec.kind === 'comparison' ? 11 : 8,
        sizeAttenuation: false,
        opacity,
        transparent: opacity < 1,
        depthWrite: false,
        depthTest: !alwaysVisible
      })
    )
    points.renderOrder = order + (alwaysVisible ? 100 : 0)
    group.add(points)
    readers.set(points, (hit) => glyphs[hit.index ?? -1] ?? {})
    if (lines.length) {
      const arrows = new LineSegments(
        new BufferGeometry()
          .setAttribute('position', new BufferAttribute(new Float32Array(lines), 3))
          .setAttribute('color', new BufferAttribute(new Float32Array(lineColors), 3)),
        new LineBasicMaterial({
          color: 0xffffff,
          vertexColors: true,
          opacity,
          transparent: opacity < 1,
          depthWrite: false,
          depthTest: !alwaysVisible
        })
      )
      arrows.renderOrder = points.renderOrder
      group.add(arrows)
      readers.set(arrows, (hit) => glyphs[lineRows[Math.floor((hit.index ?? -1) / 2)]] ?? {})
    }
  }
  const suffix =
    gradient && Number.isFinite(lo) && Number.isFinite(hi)
      ? ` · ${lo.toPrecision(4)} – ${hi.toPrecision(4)}`
      : spec.kind === 'surface'
        ? ` · ${[spec.threshold, spec.negativeThreshold].filter((value) => value !== undefined).join(' / ')}`
        : ''
  const legend = `${geometry.quantity} [${geometry.unit}]${suffix}${geometry.summary ? ' · ' + geometry.summary : ''}`
  const node = document.createElement('div')
  node.dataset.alchemionResultLegend = layer.id
  node.textContent = legend
  node.style.cssText = `max-width:100%;width:max-content;padding:2px 5px 2px 18px;background:linear-gradient(${firstColor},${lastColor}) left/14px 100% no-repeat,#f7f8ffed;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`
  return {
    layer,
    group,
    node,
    legend,
    colors: [firstColor, lastColor],
    glyphs,
    read(hit) {
      const reader = readers.get(hit.object)
      return reader
        ? {
            layerId: layer.id,
            resultId: spec.resultId,
            frameId: layer.frameId,
            datasetId: layer.datasetId,
            position: toVec(hit.point),
            coordinateUnit: geometry.reciprocal ? 'angstrom^-1' : 'angstrom',
            quantity: geometry.quantity,
            unit: geometry.unit,
            ...reader(hit)
          }
        : undefined
    }
  }
}
