import type {
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  SourceBond,
  Vec3
} from 'alchemion/core'
import type { CameraPose, ViewerOptions } from 'alchemion/viewer'

const endpoint = (id: string) => ({
  sourceAtomId: id,
  symmetryOperationId: 'identity',
  integerCellOffset: [0, 0, 0] as Vec3
})
export const bond = (id: string, a: string, b: string): SourceBond => ({
  id,
  endpoints: [endpoint(a), endpoint(b)],
  order: 'single'
})
export function molecule(): MolecularStructureSnapshot {
  return {
    kind: 'molecular',
    atoms: [
      { id: 'a', element: 'C', cartesian: [-3, 0, 0] },
      { id: 'b', element: 'O', cartesian: [0, 0, 0] },
      { id: 'c', element: 'N', cartesian: [0, 3, 0] },
      { id: 'd', element: 'S', cartesian: [0, 3, 3] }
    ],
    bonds: [bond('ab', 'a', 'b'), bond('bc', 'b', 'c'), bond('cd', 'c', 'd')]
  }
}
export function crystal(orthogonal = false): PeriodicStructureSnapshot {
  return {
    kind: 'periodic',
    cell: {
      basis: orthogonal
        ? [
            [8, 0, 0],
            [0, 6, 0],
            [0, 0, 7]
          ]
        : [
            [8, 0, 0],
            [2, 6, 0],
            [1, 1, 7]
          ]
    },
    atoms: [
      { id: 'p', element: 'C', fractional: [0.25, 0.25, 0.25] },
      { id: 'q', element: 'O', fractional: [0.5, 0.25, 0.25] }
    ],
    bonds: [bond('pq', 'p', 'q')],
    symmetry: {
      operations: [
        {
          id: 'identity',
          rotation: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
          ],
          translation: [
            { numerator: 0, denominator: 1 },
            { numerator: 0, denominator: 1 },
            { numerator: 0, denominator: 1 }
          ]
        },
        {
          id: 'inversion',
          rotation: [
            [-1, 0, 0],
            [0, -1, 0],
            [0, 0, -1]
          ],
          translation: [
            { numerator: 0, denominator: 1 },
            { numerator: 0, denominator: 1 },
            { numerator: 0, denominator: 1 }
          ]
        }
      ]
    }
  }
}
export const SMALL_CAMERA: CameraPose = {
  position: [12, 10, 28],
  target: [0, 1.5, 1.5],
  up: [0, 1, 0],
  fovYDegrees: 45,
  near: 0.1,
  far: 1000
}
export const BENCH_CAMERA: CameraPose = {
  position: [36, 28.5, 188.5],
  target: [36, 28.5, 28.5],
  up: [0, 1, 0],
  fovYDegrees: 45,
  near: 0.1,
  far: 1000
}
/** Project-authored M2 positions/topology, converted to a valid scientific source. */
export function benchmark(): MolecularStructureSnapshot {
  const atoms = Array.from({ length: 10000 }, (_, i) => ({
    id: `atom-${i}`,
    element: ['C', 'O', 'N', 'S'][i % 4],
    cartesian: [(i % 25) * 3, (Math.floor(i / 25) % 20) * 3, Math.floor(i / 500) * 3] as Vec3
  }))
  const endpoints: [number, number][] = []
  for (let i = 0; i < 10000; i++) if (i % 25 < 24) endpoints.push([i, i + 1])
  for (let i = 0; i < 10000; i++) if (Math.floor(i / 25) % 20 < 19) endpoints.push([i, i + 25])
  for (let i = 0; i < 900; i++) endpoints.push([i, i + 500])
  return {
    kind: 'molecular',
    atoms,
    bonds: endpoints.map(([a, b], i) => bond(`bond-${i}`, `atom-${a}`, `atom-${b}`))
  }
}
export const BENCH_OPTIONS: Partial<ViewerOptions> = {
  inferBonds: false,
  showSymmetryMates: false,
  showLattice: false,
  showReciprocalLattice: false,
  showBrillouinZone: false,
  showPerformance: false,
  interactionMode: 'select',
  ballRadius: 0.45,
  bondRadius: 0.12,
  atomScale: 1,
  elementStyles: {
    C: { color: '#7c7c7c', spaceFillingRadius: 1, ballRadius: 0.45 },
    O: { color: '#ed6161', spaceFillingRadius: 1, ballRadius: 0.45 },
    N: { color: '#6189ed', spaceFillingRadius: 1, ballRadius: 0.45 },
    S: { color: '#edda61', spaceFillingRadius: 1, ballRadius: 0.45 }
  }
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const unit = (a: Vec3): Vec3 => a.map((v) => v / Math.hypot(...a)) as unknown as Vec3
/** Independent perspective projection for real mouse targets; no engine or SDK picking API. */
export function project(point: Vec3, camera: CameraPose, width: number, height: number) {
  const forward = unit(sub(camera.target, camera.position))
  const right = unit(cross(forward, camera.up))
  const up = cross(right, forward)
  const relative = sub(point, camera.position)
  const scale =
    height / (2 * Math.tan((camera.fovYDegrees * Math.PI) / 360) * dot(relative, forward))
  return { x: width / 2 + dot(relative, right) * scale, y: height / 2 - dot(relative, up) * scale }
}
