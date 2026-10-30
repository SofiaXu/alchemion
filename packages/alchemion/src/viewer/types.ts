import type { DerivationOptions } from '../core/bonds'
import type { EditCommand } from '../core/editing'
import type { CoordinationResult, CoordinationRule } from '../core/coordination'
import type { Measurement } from '../core/measurements'
import type { AtomInstance, DerivedBond, Diagnostic, StructureSnapshot, Vec3 } from '../core/types'
import type { ComputationRuntimeOptions, EditorState } from './runtime/types'

export type InteractionMode =
  | 'none'
  | 'select'
  | 'box-select'
  | 'pick-point'
  | 'measure-distance'
  | 'measure-angle'
  | 'measure-torsion'
export interface CameraPose {
  readonly position: Vec3
  readonly target: Vec3
  readonly up: Vec3
  readonly fovYDegrees: number
  readonly near: number
  readonly far: number
}
/** Radius values are in Å; colors are #RRGGBB sRGB. */
export interface ElementStyle {
  readonly color?: string
  readonly spaceFillingRadius?: number
  readonly ballRadius?: number
}
export interface ViewerOptions {
  readonly renderMode: 'space-filling' | 'ball-and-stick'
  readonly elementStyles: Readonly<Record<string, ElementStyle>>
  readonly atomScale: number
  readonly ballRadius: number
  readonly bondRadius: number
  readonly missingRadius: number
  readonly showLattice: boolean
  readonly showReciprocalLattice: boolean
  readonly showBrillouinZone: boolean
  readonly showSymmetryMates: boolean
  readonly neighborCells: readonly Vec3[]
  readonly cutoff: NonNullable<DerivationOptions['cutoff']>
  readonly inferBonds: boolean
  readonly interactionMode: InteractionMode
  readonly showPerformance: boolean
  readonly coordination: {
    readonly rules: readonly CoordinationRule[]
    readonly showPolyhedra: boolean
  }
}
export interface PngExportOptions {
  /** Output pixels; omitted dimensions use the current canvas dimensions. */
  readonly width?: number
  readonly height?: number
  readonly transparent?: boolean
}
export interface ViewerViewState {
  readonly version: 1
  readonly camera: CameraPose
  readonly options: ViewerOptions
}
export type ViewerCreateOptions = Partial<ViewerOptions> &
  ComputationRuntimeOptions & {
    readonly historyLimit?: number
    readonly camera?: CameraPose
  }
export type ViewerSelection =
  | { readonly kind: 'atom'; readonly instance: AtomInstance }
  | {
      readonly kind: 'bond'
      readonly bond: DerivedBond
      readonly endpoints: readonly [AtomInstance, AtomInstance]
    }
export interface ViewerMeasurement extends Measurement {
  readonly kind: 'distance' | 'angle' | 'torsion'
  readonly instances: readonly AtomInstance[]
}
export interface ViewerPoint {
  readonly cartesian: Vec3
  readonly fractional?: Vec3
  readonly unit: 'angstrom'
  readonly source: 'surface' | 'view-plane'
}
export interface ViewerState {
  readonly status: EditorState['status']
  readonly documentId?: string
  readonly revision: number
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly diagnostics: readonly Diagnostic[]
  readonly options: ViewerOptions
  readonly selection?: ViewerSelection
  readonly selectedSourceAtomIds: readonly string[]
  readonly measurement?: ViewerMeasurement
  readonly coordination?: CoordinationResult
}
export interface ViewerEventContext {
  readonly documentId?: string
  readonly revision: number
}
export type ViewerEvent =
  | { readonly type: 'state'; readonly state: ViewerState }
  | (ViewerEventContext & {
      readonly type: 'selection'
      readonly selection?: ViewerSelection
      readonly selectedSourceAtomIds: readonly string[]
    })
  | (ViewerEventContext & { readonly type: 'point'; readonly point: ViewerPoint })
  | (ViewerEventContext & {
      readonly type: 'measurement'
      readonly measurement?: ViewerMeasurement
      readonly diagnostics: readonly Diagnostic[]
    })
  | (ViewerEventContext & {
      readonly type: 'history'
      readonly canUndo: boolean
      readonly canRedo: boolean
    })
  | (ViewerEventContext & { readonly type: 'error'; readonly diagnostics: readonly Diagnostic[] })
export interface Viewer {
  load(snapshot: StructureSnapshot): Promise<void>
  getSnapshot(): StructureSnapshot | undefined
  getState(): ViewerState
  setSelectedSourceAtomIds(ids: readonly string[]): void
  setOptions(patch: Partial<ViewerOptions>): Promise<void>
  execute(command: EditCommand | readonly EditCommand[]): Promise<void>
  undo(): Promise<void>
  redo(): Promise<void>
  /** Cancel pending work while retaining the accepted source and transaction history. */
  cancel(): void
  /** Rebuild the current source without adding a transaction or clearing history. */
  recompute(): Promise<void>
  getCamera(): CameraPose
  setCamera(pose: CameraPose): void
  rotate(azimuthDegrees: number, elevationDegrees: number): void
  zoom(factor: number): void
  center(): void
  exportPng(options?: PngExportOptions): Promise<Blob>
  getViewState(): ViewerViewState
  restoreViewState(state: ViewerViewState): Promise<void>
  subscribe(listener: (event: ViewerEvent) => void): () => void
  clear(): void
  dispose(): void
}
