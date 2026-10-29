/** Private renderer boundary. This module is never exported from alchemion/viewer. */
import type { BrillouinZone } from '../core/brillouin-zone'
import type { ReciprocalLattice } from '../core/reciprocal'
import type { AtomInstance, Cell, DerivedBond, Vec3 } from '../core/types'
import type { ComputationContext } from './runtime/types'
import type { CameraPose, ViewerOptions } from './types'

export interface RenderAtom {
  readonly instance: AtomInstance
  readonly color: Vec3
  readonly radius: number
}
export interface RenderBond {
  readonly bond: DerivedBond
  readonly a: Vec3
  readonly b: Vec3
  readonly color: Vec3
  readonly radius: number
}
export interface RenderFrame {
  readonly fitToView?: boolean
  readonly atoms: readonly RenderAtom[]
  readonly bonds: readonly RenderBond[]
  readonly cell?: Cell
  readonly reciprocal?: ReciprocalLattice
  readonly reciprocalPoints?: readonly Vec3[]
  readonly zone?: BrillouinZone
  readonly options: ViewerOptions
}
export type RenderContext = ComputationContext & { readonly viewRevision: number }
export interface BackendPick {
  readonly kind: 'atom' | 'bond'
  readonly instanceId: string
  readonly cartesian: Vec3
}
export interface InteractionOverlay {
  readonly selectedAtomIds: readonly string[]
  readonly selectedBondIds: readonly string[]
  readonly points: readonly Vec3[]
  readonly label?: string
}
export interface BackendCallbacks {
  readonly click: (x: number, y: number) => void
  readonly contextLost: () => void
  readonly contextRestored: () => void
  readonly error: (error: Error) => void
}
export interface ViewerBackend {
  /** Resolves only after the complete frame has reached the GPU completion boundary. */
  commit(frame: RenderFrame, context: RenderContext, signal: AbortSignal): Promise<void>
  resize(width: number, height: number, dpr: number): void
  pick(x: number, y: number): BackendPick | undefined
  point(
    x: number,
    y: number
  ): { readonly cartesian: Vec3; readonly source: 'surface' | 'view-plane' } | undefined
  getCamera(): CameraPose
  setCamera(pose: CameraPose): void
  rotate(azimuthDegrees: number, elevationDegrees: number): void
  zoom(factor: number): void
  center(): void
  setOverlay(overlay: InteractionOverlay): void
  clear(): void
  dispose(): void
}
