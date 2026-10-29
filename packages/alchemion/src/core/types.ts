/** JSON/structured-clone compatible scientific contracts. Matrices contain columns. */
export type Vec3 = readonly [number, number, number]
export type Matrix3 = readonly [Vec3, Vec3, Vec3]
export type AtomId = string
export type BondId = string
export type SymmetryOperationId = string
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }
export type DiagnosticContext = Readonly<Record<string, JsonValue | undefined>>
export interface Diagnostic {
  readonly severity: 'error' | 'warning' | 'info'
  readonly code: string
  readonly message: string
  readonly context?: DiagnosticContext
  readonly sourceLocation?: {
    readonly line: number
    readonly column: number
    readonly offset?: number
  }
}
export type ScientificResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }
export interface Provenance {
  readonly source: string
  readonly version?: string
  readonly reference?: string
}
export type ScientificValue =
  | {
      readonly kind: 'known'
      readonly value: number
      readonly standardUncertainty?: number
      readonly literal?: string
      readonly provenance?: Provenance
    }
  | { readonly kind: 'unknown' | 'not-applicable' }
export interface CellParameters {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly alpha: number
  readonly beta: number
  readonly gamma: number
}
export interface Cell {
  readonly basis: Matrix3
  readonly parameterUncertainties?: Readonly<
    Partial<
      Record<
        keyof CellParameters,
        { readonly standardUncertainty: number; readonly literal?: string }
      >
    >
  >
}
export interface Rational {
  readonly numerator: number
  readonly denominator: number
}
export interface SymmetryOperation {
  readonly id: SymmetryOperationId
  readonly rotation: Matrix3
  readonly translation: readonly [Rational, Rational, Rational]
  readonly provenance?: Provenance
}
export interface SpaceGroupIdentifier {
  readonly itNumber?: number
  readonly hallNumber?: number
  readonly hallSymbol?: string
  readonly hermannMauguin?: string
  readonly choice?: string
}
export interface SymmetryInformation {
  readonly operations?: readonly SymmetryOperation[]
  readonly spaceGroup?: SpaceGroupIdentifier
}
export interface AtomProperties {
  readonly id: AtomId
  readonly element: string
  readonly label?: string
  readonly occupancy?: ScientificValue
  readonly isotope?: number
  readonly formalCharge?: number
  readonly oxidationState?: ScientificValue
  readonly radical?: 'singlet' | 'doublet' | 'triplet'
  readonly atomMap?: number
  /** Explicit tetrahedral parity relative to four stable neighbours; null denotes implicit H. */
  readonly stereoParity?: {
    readonly parity: 'odd' | 'even' | 'either'
    readonly referenceAtoms: readonly (AtomId | null)[]
  }
  readonly displacementU?: ScientificValue
  readonly coordinateUncertainties?: {
    readonly frame: 'fractional' | 'cartesian'
    readonly standardUncertainties: Vec3
    readonly literals?: readonly [string, string, string]
  }
  readonly provenance?: Provenance
  readonly metadata?: Readonly<Record<string, JsonValue>>
}
export interface PeriodicAtom extends AtomProperties {
  readonly fractional: Vec3
}
export interface MolecularAtom extends AtomProperties {
  readonly cartesian: Vec3
}
export interface BondEndpoint {
  readonly sourceAtomId: AtomId
  readonly symmetryOperationId: SymmetryOperationId
  readonly integerCellOffset: Vec3
}
export type BondOrder = 'single' | 'double' | 'triple' | 'aromatic'
export interface SourceBond {
  readonly id: BondId
  readonly endpoints: readonly [BondEndpoint, BondEndpoint]
  readonly order: BondOrder
  readonly stereo?: 'up' | 'down' | 'either' | 'cis' | 'trans'
  readonly provenance?: Provenance
  readonly metadata?: Readonly<Record<string, JsonValue>>
}
interface StructureBase {
  readonly title?: string
  readonly bonds: readonly SourceBond[]
  readonly metadata?: Readonly<Record<string, JsonValue>>
}
export interface PeriodicStructureSnapshot extends StructureBase {
  readonly kind: 'periodic'
  readonly cell: Cell
  readonly atoms: readonly PeriodicAtom[]
  readonly symmetry?: SymmetryInformation
}
export interface MolecularStructureSnapshot extends StructureBase {
  readonly kind: 'molecular'
  readonly atoms: readonly MolecularAtom[]
  /** CTfile absolute-stereochemistry flag; this does not assert that the molecule is chiral. */
  readonly stereoAbsolute?: boolean
}
export type StructureSnapshot = PeriodicStructureSnapshot | MolecularStructureSnapshot
export interface AtomInstance extends BondEndpoint {
  readonly id: string
  readonly cartesian: Vec3
  readonly fractional?: Vec3
  readonly equivalentSources: readonly BondEndpoint[]
}
export interface DerivedBond {
  readonly id: string
  readonly sourceBondId?: BondId
  readonly provenance: 'explicit' | 'inferred'
  readonly order: BondOrder
  readonly endpoints: readonly [string, string]
  readonly canonicalEndpoints: readonly [BondEndpoint, BondEndpoint]
}
export interface DerivedStructure {
  readonly atoms: readonly AtomInstance[]
  readonly bonds: readonly DerivedBond[]
}
