import {
  fractionalToCartesian,
  resolveBondEndpoint,
  resolveSymmetry,
  validateStructure
} from '../../core'
import { canonicalizeEndpoint, endpointKey, transformBondEndpoint } from '../../core/symmetry'
import type {
  BondEndpoint,
  Diagnostic,
  MolecularAtom,
  MolecularStructureSnapshot,
  SourceBond,
  StructureSnapshot,
  SymmetryOperation,
  Vec3
} from '../../core/types'
import type { ExportAtomMapping, MolFiniteSelection } from '../contracts'
import { hasErrors, lossDiagnostic } from '../loss'
import { molecularEndpoint, molDiagnostic } from './common'

export interface FiniteMolecule {
  readonly atoms: readonly MolecularAtom[]
  readonly bonds: readonly SourceBond[]
  readonly atomMapping: readonly ExportAtomMapping[]
  readonly diagnostics: readonly Diagnostic[]
}

const identityOperation = (operation: SymmetryOperation): boolean =>
  operation.rotation.every((column, i) => column.every((x, j) => x === Number(i === j))) &&
  operation.translation.every((x) => x.numerator === 0)
const keyPair = (a: string, b: string): string => JSON.stringify([a, b].sort())

/** An explicit export boundary, not an implicit expansion of the current display. */
export function finiteMolecule(
  snapshot: StructureSnapshot,
  selection: MolFiniteSelection | undefined,
  allowLoss: boolean
): FiniteMolecule {
  const diagnostics: Diagnostic[] = [...validateStructure(snapshot)]
  const empty = (): FiniteMolecule => ({ atoms: [], bonds: [], atomMapping: [], diagnostics })
  if (hasErrors(diagnostics)) return empty()
  if (snapshot.kind === 'molecular' && selection === undefined) {
    return {
      atoms: snapshot.atoms,
      bonds: snapshot.bonds,
      atomMapping: snapshot.atoms.map((atom, i) => ({
        fileAtomNumber: i + 1,
        exportAtomId: atom.id,
        source: molecularEndpoint(atom.id)
      })),
      diagnostics
    }
  }
  if (!selection || !['source', 'instances'].includes(selection.kind)) {
    diagnostics.push(
      molDiagnostic(
        'MOL_FINITE_REQUIRED',
        'Periodic MOL export requires an explicit finite source-atom or instance selection.'
      )
    )
    return empty()
  }
  let operations: readonly SymmetryOperation[] | undefined
  if (snapshot.kind === 'periodic') {
    const resolved = resolveSymmetry(snapshot.symmetry, snapshot.cell)
    diagnostics.push(...resolved.diagnostics)
    if (!resolved.ok) return empty()
    operations = resolved.value
  }
  const identity = operations?.find(identityOperation)
  if (snapshot.kind === 'periodic' && selection.kind === 'source' && !identity) {
    diagnostics.push(
      molDiagnostic(
        'MOL_IDENTITY_MISSING',
        'Source-atom export needs a verified identity operation for provenance.'
      )
    )
    return empty()
  }
  const endpoints: readonly BondEndpoint[] =
    selection.kind === 'source'
      ? (Array.isArray(selection.atomIds) ? selection.atomIds : []).map((sourceAtomId) => ({
          sourceAtomId,
          symmetryOperationId: identity?.id ?? 'identity',
          integerCellOffset: [0, 0, 0]
        }))
      : selection.endpoints
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    diagnostics.push(
      molDiagnostic('MOL_FINITE_EMPTY', 'A finite export selection must contain at least one atom.')
    )
    return empty()
  }
  const atomsById = new Map(snapshot.atoms.map((atom) => [atom.id, atom]))
  const selected = new Map<
    string,
    { source: BondEndpoint; canonical: BondEndpoint; atom: MolecularAtom }
  >()
  const bySource = new Map<
    string,
    { source: BondEndpoint; canonical: BondEndpoint; atom: MolecularAtom }[]
  >()
  const atomMapping: ExportAtomMapping[] = []
  for (const endpoint of endpoints) {
    const position = resolveBondEndpoint(snapshot, endpoint, operations)
    diagnostics.push(...position.diagnostics)
    if (!position.ok) return empty()
    const canonical = canonicalizeEndpoint(snapshot, endpoint, operations)
    diagnostics.push(...canonical.diagnostics)
    if (!canonical.ok) return empty()
    const key = endpointKey(canonical.value)
    if (selected.has(key)) {
      diagnostics.push(
        molDiagnostic(
          'MOL_FINITE_DUPLICATE',
          'The same physical source instance cannot be selected twice.',
          undefined,
          { sourceAtomId: endpoint.sourceAtomId }
        )
      )
      return empty()
    }
    const source = atomsById.get(endpoint.sourceAtomId)!
    const copy = { ...source } as Record<string, unknown>
    delete copy.id
    delete copy.fractional
    // Coordinates are reconstructed from core provenance, never copied from a stale display object.
    const cartesian =
      selection.kind === 'source' && snapshot.kind === 'periodic' && 'fractional' in source
        ? fractionalToCartesian(snapshot.cell, source.fractional)
        : position
    if (!cartesian.ok) {
      diagnostics.push(...cartesian.diagnostics)
      return empty()
    }
    const atom: MolecularAtom = {
      ...(copy as Omit<MolecularAtom, 'id' | 'cartesian'>),
      id: `finite:${endpointKey(endpoint)}`,
      cartesian:
        'cartesian' in cartesian.value ? cartesian.value.cartesian : (cartesian.value as Vec3)
    }
    const entry = { source: endpoint, canonical: canonical.value, atom }
    selected.set(key, entry)
    const sameSource = bySource.get(source.id)
    if (sameSource) sameSource.push(entry)
    else bySource.set(source.id, [entry])
    atomMapping.push({
      fileAtomNumber: atomMapping.length + 1,
      exportAtomId: atom.id,
      source: { ...endpoint, integerCellOffset: [...endpoint.integerCellOffset] as unknown as Vec3 }
    })
  }
  const bonds: SourceBond[] = [],
    seen = new Set<string>(),
    boundary = new Set<string>()
  const loss = (code: string, message: string, context?: Diagnostic['context']) =>
    diagnostics.push(lossDiagnostic(code, message, allowLoss, { format: 'mol', ...context }))
  if (snapshot.kind === 'periodic') {
    loss(
      'MOL_PERIODICITY_LOSS',
      'A finite MOL snapshot cannot express the source cell, periodicity or symmetry.'
    )
    if (snapshot.cell.parameterUncertainties)
      loss(
        'MOL_CELL_UNCERTAINTY_LOSS',
        'Cell measurement uncertainties are omitted from the finite MOL snapshot.'
      )
  }
  for (const bond of snapshot.bonds) {
    const orbit: readonly (SymmetryOperation | undefined)[] =
      snapshot.kind === 'periodic' ? operations! : [undefined]
    for (const operation of orbit) {
      const transformed = bond.endpoints.map((endpoint) =>
        operation
          ? transformBondEndpoint(snapshot, endpoint, operation, operations!)
          : canonicalizeEndpoint(snapshot, endpoint, operations)
      )
      for (const result of transformed) diagnostics.push(...result.diagnostics)
      const [first, second] = transformed
      if (!first.ok || !second.ok) return empty()
      for (const reverse of [false, true]) {
        const left = reverse ? second.value : first.value,
          right = reverse ? first.value : second.value
        for (const selectedLeft of bySource.get(left.sourceAtomId) ?? []) {
          if (selectedLeft.canonical.symmetryOperationId !== left.symmetryOperationId) continue
          const shift = selectedLeft.canonical.integerCellOffset.map(
            (x, i) => x - left.integerCellOffset[i]
          ) as unknown as Vec3
          const target: BondEndpoint = {
            ...right,
            integerCellOffset: right.integerCellOffset.map(
              (x, i) => x + shift[i]
            ) as unknown as Vec3
          }
          const canonical = canonicalizeEndpoint(snapshot, target, operations)
          if (!canonical.ok) {
            diagnostics.push(...canonical.diagnostics)
            return empty()
          }
          const selectedRight = selected.get(endpointKey(canonical.value))
          if (!selectedRight) {
            boundary.add(
              JSON.stringify([
                bond.id,
                endpointKey(selectedLeft.canonical),
                endpointKey(canonical.value)
              ])
            )
            continue
          }
          const a = reverse ? selectedRight : selectedLeft,
            b = reverse ? selectedLeft : selectedRight
          const key = keyPair(a.atom.id, b.atom.id)
          if (seen.has(key)) continue
          seen.add(key)
          bonds.push({
            ...bond,
            id: `finite:${JSON.stringify([bond.id, key])}`,
            endpoints: [molecularEndpoint(a.atom.id), molecularEndpoint(b.atom.id)],
            ...(snapshot.kind === 'periodic' ? { stereo: undefined } : {})
          })
        }
      }
    }
    if (snapshot.kind === 'periodic' && bond.stereo)
      loss(
        'MOL_FINITE_STEREO_LOSS',
        'Drawing stereo markers are not projected through crystallographic operations.',
        { bondId: bond.id }
      )
  }
  for (const key of boundary) {
    const [bondId, inside, outside] = JSON.parse(key) as string[]
    loss(
      'MOL_BOUNDARY_BOND_LOSS',
      'An explicit bond crosses the selected finite export boundary.',
      { bondId, inside, outside }
    )
  }
  const exportedAtoms = [...selected.values()].map((entry) => {
    if (!entry.atom.stereoParity) return entry.atom
    if (snapshot.kind === 'periodic') {
      loss(
        'MOL_FINITE_PARITY_LOSS',
        'Atom parity is not projected through crystallographic operations.',
        { atomId: entry.source.sourceAtomId }
      )
      return { ...entry.atom, stereoParity: undefined }
    }
    const references = entry.atom.stereoParity.referenceAtoms.map((id) =>
      id === null ? null : bySource.get(id)?.[0]?.atom.id
    )
    if (references.some((id) => id === undefined)) {
      loss(
        'MOL_BOUNDARY_PARITY_LOSS',
        'An atom parity reference lies outside the finite export boundary.',
        { atomId: entry.source.sourceAtomId }
      )
      return { ...entry.atom, stereoParity: undefined }
    }
    return {
      ...entry.atom,
      stereoParity: {
        ...entry.atom.stereoParity,
        referenceAtoms: references as readonly (string | null)[]
      }
    }
  })
  return { atoms: exportedAtoms, bonds, atomMapping, diagnostics }
}

export function asMolecularSnapshot(
  snapshot: StructureSnapshot,
  finite: FiniteMolecule
): MolecularStructureSnapshot {
  return {
    kind: 'molecular',
    title: snapshot.title,
    metadata: snapshot.metadata,
    atoms: finite.atoms,
    bonds: finite.bonds,
    ...(snapshot.kind === 'molecular' ? { stereoAbsolute: snapshot.stereoAbsolute } : {})
  }
}
