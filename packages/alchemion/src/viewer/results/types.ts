import type {
  CalculationData,
  CalculationResult,
  CalculationSource,
  PoscarExportReceipt,
  ResultFrame
} from '../../core/calculation'
import type { AtomId, Diagnostic, Vec3 } from '../../core/types'
import type { CalculationParseOptions } from '../../formats/calculation'
import type { CameraPose, ViewerOptions } from '../types'

export type ResultImportOptions = CalculationParseOptions
export interface ResultBindingOptions {
  readonly receipt?: PoscarExportReceipt
  readonly frameId?: string
  /** In result file order. Providing this confirms the correspondence. */
  readonly atomIds?: readonly AtomId[]
}
export interface ResultLayerSpec {
  readonly kind: 'surface' | 'slice' | 'atomic' | 'comparison' | 'vibration' | 'fermi' | 'k-point'
  readonly resultId: string
  readonly datasetId?: string
  readonly frameId?: string
  readonly visible?: boolean
  readonly opacity?: number
  readonly order?: number
  readonly color?: string
  readonly negativeColor?: string
  readonly threshold?: number
  readonly negativeThreshold?: number
  readonly plane?: { readonly point: Vec3; readonly normal: Vec3 }
  readonly tiles?: readonly Vec3[]
  readonly colorDatasetId?: string
  readonly colorResultId?: string
  readonly subtractDatasetId?: string
  readonly subtractResultId?: string
  readonly resample?: boolean
  readonly targetResultId?: string
  readonly targetFrameId?: string
  readonly removeCellDeformation?: boolean
  readonly fit?: boolean
  readonly pairs?: readonly { readonly referenceId: AtomId; readonly targetId: AtomId }[]
  readonly scale?: number
  readonly min?: number
  readonly max?: number
  readonly elements?: readonly string[]
  readonly selectedOnly?: boolean
  readonly labels?: boolean
  readonly arrows?: boolean
  readonly modeId?: string
  readonly phase?: number
  readonly supercell?: Vec3
  readonly kIndex?: number
}
export interface ResultPick {
  readonly layerId: string
  readonly resultId: string
  readonly frameId: string
  readonly datasetId?: string
  readonly position: Vec3
  readonly coordinateUnit: 'angstrom' | 'angstrom^-1'
  readonly atomId?: AtomId
  readonly quantity: string
  readonly unit: string
  readonly value?: number | Vec3
}
export interface ResultLayerState {
  readonly id: string
  readonly spec: ResultLayerSpec
  readonly status: 'waiting' | 'computing' | 'ready' | 'hidden' | 'incompatible' | 'error'
  readonly diagnostics: readonly Diagnostic[]
  readonly summary?: string
}
export interface ResultImportState {
  readonly id: string
  readonly name: string
  readonly status: 'computing' | 'ready' | 'error'
  readonly diagnostics: readonly Diagnostic[]
}
export interface ResultFrameReference {
  readonly resultId: string
  readonly frameId: string
}
export interface ViewerResultsState {
  readonly results: readonly {
    readonly id: string
    readonly sources: readonly CalculationSource[]
    readonly frames: readonly Omit<ResultFrame, 'structure'>[]
    readonly data: readonly Pick<
      CalculationData,
      'id' | 'kind' | 'frameId' | 'quantity' | 'unit' | 'spin'
    >[]
    readonly termination: CalculationResult['termination']
    readonly convergence: CalculationResult['convergence']
    readonly bound: boolean
  }[]
  readonly layers: readonly ResultLayerState[]
  readonly frame?: ResultFrameReference
  readonly pick?: ResultPick
  readonly imports: readonly ResultImportState[]
}
export interface ResultViewLayer {
  readonly id: string
  readonly spec: ResultLayerSpec
  readonly sources: readonly string[]
  readonly targetSources?: readonly string[]
  readonly colorSources?: readonly string[]
  readonly subtractSources?: readonly string[]
}
export interface ViewerResultViewState {
  readonly version: 2
  readonly camera: CameraPose
  readonly options: ViewerOptions
  readonly layers: readonly ResultViewLayer[]
}
export interface ViewerResults {
  import(file: File | string, options: ResultImportOptions): Promise<CalculationResult>
  register(input: unknown): Promise<CalculationResult>
  get(resultId: string): CalculationResult | undefined
  bind(resultId: string, options?: ResultBindingOptions): Promise<void>
  open(resultId: string, frameId?: string): Promise<void>
  setFrame(
    resultId?: string,
    frameId?: string,
    options?: { readonly continuous?: boolean }
  ): Promise<void>
  addLayer(spec: ResultLayerSpec): Promise<string>
  updateLayer(id: string, patch: Partial<ResultLayerSpec>): Promise<void>
  removeLayer(id: string): Promise<void>
  remove(resultId: string): Promise<void>
  getState(): ViewerResultsState
  subscribe(listener: (state: ViewerResultsState) => void): () => void
}
