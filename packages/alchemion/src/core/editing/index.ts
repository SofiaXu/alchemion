import { cartesianToFractional } from '../cell'
import { sourcePositionFromInstance } from '../derivation'
import { failure, failureFrom, success } from '../result'
import { createStructureSnapshot } from '../structure'
import { buildSupercell } from '../supercell'
import type {
  AtomId,
  AtomInstance,
  Cell,
  Diagnostic,
  MolecularAtom,
  MolecularStructureSnapshot,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  SourceBond,
  StructureSnapshot,
  SymmetryInformation,
  Vec3
} from '../types'

export type EditCommand =
  | { readonly type: 'build-supercell'; readonly repetitions: Vec3 }
  | { readonly type: 'add-atom'; readonly atom: PeriodicAtom | MolecularAtom }
  | { readonly type: 'remove-atom'; readonly atomId: AtomId }
  | { readonly type: 'set-element'; readonly atomId: AtomId; readonly element: string }
  | {
      readonly type: 'set-position'
      readonly atomId: AtomId
      readonly position: { readonly frame: 'fractional' | 'cartesian'; readonly value: Vec3 }
    }
  | {
      readonly type: 'set-instance-position'
      readonly instance: AtomInstance
      readonly cartesian: Vec3
      readonly documentId: string
      readonly revision: number
    }
  | { readonly type: 'set-cell'; readonly cell: Cell }
  | { readonly type: 'set-symmetry'; readonly symmetry?: SymmetryInformation }

export interface DocumentState {
  readonly documentId?: string
  readonly revision: number
  readonly snapshot?: StructureSnapshot
  readonly canUndo: boolean
  readonly canRedo: boolean
}
export interface DocumentChange {
  readonly changed: boolean
  readonly state: DocumentState
}
export interface DocumentStoreOptions {
  readonly historyLimit?: number
}
export interface DocumentStore {
  getState(): DocumentState
  load(snapshot: StructureSnapshot): ScientificResult<DocumentChange>
  execute(command: EditCommand | readonly EditCommand[]): ScientificResult<DocumentChange>
  undo(): ScientificResult<DocumentChange>
  redo(): ScientificResult<DocumentChange>
  clear(): DocumentChange
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }
type Draft =
  | (Omit<Mutable<PeriodicStructureSnapshot>, 'atoms' | 'bonds' | 'cell'> & {
      atoms: Mutable<PeriodicAtom>[]
      bonds: SourceBond[]
      cell: Mutable<Cell>
    })
  | (Omit<Mutable<MolecularStructureSnapshot>, 'atoms' | 'bonds'> & {
      atoms: Mutable<MolecularAtom>[]
      bonds: SourceBond[]
    })
type DraftAtom = Mutable<PeriodicAtom | MolecularAtom>

// Opaque identity allocation has no browser dependency or mutable document state.
let documentSequence = 0

/** Copy plain inputs without JSON's silent conversion of NaN, dates or unsupported values. */
function copy<T>(input: T, ancestors = new Set<object>(), depth = 0): T {
  if (input === null || input === undefined || typeof input !== 'object') {
    if (typeof input === 'function' || typeof input === 'symbol' || typeof input === 'bigint')
      throw new Error('Editing inputs must contain plain scientific data.')
    return input
  }
  if (
    depth > 128 ||
    ancestors.has(input) ||
    (!Array.isArray(input) &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  )
    throw new Error('Editing inputs must contain acyclic plain scientific data.')
  ancestors.add(input)
  const output = Array.isArray(input)
    ? input.map((value) => copy(value, ancestors, depth + 1))
    : Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, copy(value, ancestors, depth + 1)])
      )
  ancestors.delete(input)
  return output as T
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item
  )
}
const equalPosition = (a: Vec3, b: Vec3) => a.every((value, index) => value === b[index])
const vector = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)

/** A pure source-document store. Derived state and browser resources belong to consumers. */
export function createDocumentStore(options: DocumentStoreOptions = {}): DocumentStore {
  const historyLimit = options.historyLimit ?? 100
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 0)
    throw new RangeError('historyLimit must be a nonnegative safe integer.')
  let snapshot: StructureSnapshot | undefined
  let documentId: string | undefined
  let revision = 0
  const past: StructureSnapshot[] = []
  const future: StructureSnapshot[] = []
  let usedAtomIds = new Set<string>()
  let usedBondIds = new Set<string>()
  let generatedAtomSequence = 0
  let generatedBondSequence = 0
  const state = (): DocumentState =>
    Object.freeze({
      ...(documentId ? { documentId } : {}),
      revision,
      ...(snapshot ? { snapshot } : {}),
      canUndo: past.length > 0,
      canRedo: future.length > 0
    })
  const change = (changed: boolean): DocumentChange => Object.freeze({ changed, state: state() })
  const invalidateMeasurement = (atom: DraftAtom, diagnostics: Diagnostic[]) => {
    if (!atom.coordinateUncertainties) return
    delete atom.coordinateUncertainties
    diagnostics.push({
      severity: 'warning',
      code: 'EDIT_COORDINATE_UNCERTAINTY_CLEARED',
      message: 'Changing coordinates invalidated the previous coordinate measurement uncertainty.',
      context: { atomId: atom.id }
    })
  }
  const setPosition = (
    atom: DraftAtom,
    position: Vec3,
    kind: StructureSnapshot['kind'],
    diagnostics: Diagnostic[]
  ) => {
    const previous =
      kind === 'periodic' ? (atom as PeriodicAtom).fractional : (atom as MolecularAtom).cartesian
    if (equalPosition(previous, position)) return
    invalidateMeasurement(atom, diagnostics)
    if (kind === 'periodic') (atom as Mutable<PeriodicAtom>).fractional = [...position]
    else (atom as Mutable<MolecularAtom>).cartesian = [...position]
  }

  function apply(
    draft: Draft,
    command: EditCommand,
    diagnostics: Diagnostic[],
    added: Set<string>,
    addedBonds: Set<string>
  ): ScientificResult<undefined> {
    if (!command || typeof command !== 'object')
      return failure('EDIT_COMMAND', 'An edit command is required.')
    if (command.type === 'build-supercell') {
      const nextId = (kind: 'atom' | 'bond'): string => {
        const used = kind === 'atom' ? usedAtomIds : usedBondIds
        const pending = kind === 'atom' ? added : addedBonds
        let id: string
        do {
          const sequence = kind === 'atom' ? ++generatedAtomSequence : ++generatedBondSequence
          if (!Number.isSafeInteger(sequence))
            throw new Error('The document exhausted its generated ID range.')
          id = `supercell:${kind}:${sequence}`
        } while (used.has(id) || pending.has(id))
        pending.add(id)
        return id
      }
      const built = buildSupercell(draft, command.repetitions, {
        atom: () => nextId('atom'),
        bond: () => nextId('bond')
      })
      if (!built.ok) return built
      Object.assign(draft, copy(built.value.snapshot))
      return success(undefined, built.diagnostics)
    }
    if (command.type === 'add-atom') {
      const atom = command.atom
      if (!atom || typeof atom.id !== 'string' || !atom.id.trim())
        return failure('ATOM_ID', 'A new atom requires a nonempty stable ID.')
      if (usedAtomIds.has(atom.id) || added.has(atom.id))
        return failure(
          'EDIT_ATOM_ID_REUSED',
          'A new atom must use an ID not previously issued in this document.',
          { atomId: atom.id }
        )
      ;(draft.atoms as DraftAtom[]).push(copy(atom) as DraftAtom)
      added.add(atom.id)
      return success(undefined)
    }
    if (command.type === 'set-cell') {
      if (draft.kind !== 'periodic')
        return failure('EDIT_PERIODIC_REQUIRED', 'Cell edits require a periodic document.')
      const basisChanged = canonical(draft.cell.basis) !== canonical(command.cell?.basis)
      draft.cell = copy(command.cell) as Mutable<Cell>
      if (basisChanged) {
        if (snapshot?.kind === 'periodic' && snapshot.cell.parameterUncertainties) {
          // A new cell is a new measurement; old parameter uncertainties cannot be inherited.
          if (draft.cell) delete draft.cell.parameterUncertainties
          diagnostics.push({
            severity: 'warning',
            code: 'EDIT_CELL_UNCERTAINTY_CLEARED',
            message: 'Changing the cell invalidated the previous cell parameter uncertainties.'
          })
        }
        for (const atom of draft.atoms)
          if (atom.coordinateUncertainties?.frame === 'cartesian')
            invalidateMeasurement(atom, diagnostics)
      }
      return success(undefined)
    }
    if (command.type === 'set-symmetry') {
      if (draft.kind !== 'periodic')
        return failure('EDIT_PERIODIC_REQUIRED', 'Symmetry edits require a periodic document.')
      if (command.symmetry === undefined) delete draft.symmetry
      else draft.symmetry = copy(command.symmetry) as Mutable<SymmetryInformation>
      return success(undefined)
    }
    if (command.type === 'set-instance-position') {
      if (command.documentId !== documentId || command.revision !== revision)
        return failure(
          'EDIT_STALE_INSTANCE',
          'The edited instance belongs to a different document or revision.'
        )
      const position = sourcePositionFromInstance(draft, command.instance, command.cartesian)
      if (!position.ok) return position
      const atom = draft.atoms.find((entry) => entry.id === command.instance.sourceAtomId)!
      setPosition(atom, position.value, draft.kind, diagnostics)
      return success(undefined, position.diagnostics)
    }
    if (!['remove-atom', 'set-element', 'set-position'].includes(command.type))
      return failure('EDIT_COMMAND', 'Unknown edit command type.')
    const target = command as Extract<EditCommand, { atomId: string }>
    const index = draft.atoms.findIndex((entry) => entry.id === target.atomId)
    if (index < 0)
      return failure('EDIT_ATOM_MISSING', 'The edit references a missing source atom.', {
        atomId: target.atomId
      })
    const atom = draft.atoms[index]
    if (target.type === 'remove-atom') {
      draft.atoms.splice(index, 1)
      draft.bonds = draft.bonds.filter(
        (bond) => !bond.endpoints.some((endpoint) => endpoint.sourceAtomId === target.atomId)
      )
      for (const remaining of draft.atoms) {
        if (remaining.stereoParity?.referenceAtoms.includes(target.atomId)) {
          delete remaining.stereoParity
          diagnostics.push({
            severity: 'warning',
            code: 'EDIT_STEREO_PARITY_CLEARED',
            message: 'Deleting a referenced atom invalidated this atom stereo parity.',
            context: { atomId: remaining.id, removedAtomId: target.atomId }
          })
        }
      }
      return success(undefined)
    }
    if (target.type === 'set-element') {
      atom.element = target.element
      return success(undefined)
    }
    const position = target.position
    if (
      !position ||
      !['fractional', 'cartesian'].includes(position.frame) ||
      !vector(position.value)
    )
      return failure(
        'EDIT_POSITION',
        'Position edits require an explicit frame and finite coordinate triple.'
      )
    if (draft.kind === 'molecular' && position.frame !== 'cartesian')
      return failure(
        'EDIT_POSITION_FRAME',
        'Molecular positions require cartesian coordinates in angstroms.'
      )
    const converted =
      draft.kind === 'periodic' && position.frame === 'cartesian'
        ? cartesianToFractional(draft.cell, position.value)
        : success(position.value)
    if (!converted.ok) return converted
    setPosition(atom, converted.value, draft.kind, diagnostics)
    return success(undefined)
  }

  return {
    getState: state,
    load(input) {
      const result = createStructureSnapshot(input)
      if (!result.ok) return result
      snapshot = result.value
      documentId = `document:${++documentSequence}`
      revision = 0
      past.length = future.length = 0
      usedAtomIds = new Set(snapshot.atoms.map((atom) => atom.id))
      usedBondIds = new Set(snapshot.bonds.map((bond) => bond.id))
      generatedAtomSequence = generatedBondSequence = 0
      return success(change(true), result.diagnostics)
    },
    execute(input) {
      if (!snapshot) return failure('EDIT_DOCUMENT_EMPTY', 'Load a structure before editing it.')
      const commands = Array.isArray(input) ? input : [input]
      const diagnostics: Diagnostic[] = []
      const added = new Set<string>()
      const addedBonds = new Set<string>()
      let draft: Draft
      try {
        draft = copy(snapshot) as Draft
        for (const command of commands) {
          const result = apply(draft, command, diagnostics, added, addedBonds)
          diagnostics.push(...result.diagnostics)
          if (!result.ok) return failureFrom(diagnostics)
        }
      } catch (error) {
        return failure(
          'EDIT_INPUT',
          error instanceof Error ? error.message : 'Invalid editing input.'
        )
      }
      const checked = createStructureSnapshot(draft)
      diagnostics.push(...checked.diagnostics)
      if (!checked.ok) return failureFrom(diagnostics)
      if (canonical(checked.value) === canonical(snapshot)) return success(change(false))
      if (revision === Number.MAX_SAFE_INTEGER)
        return failure('EDIT_REVISION_LIMIT', 'The document exhausted its exact revision range.')
      if (historyLimit > 0) {
        past.push(snapshot)
        if (past.length > historyLimit) past.shift()
      }
      future.length = 0
      snapshot = checked.value
      for (const id of added) usedAtomIds.add(id)
      for (const id of addedBonds) usedBondIds.add(id)
      revision++
      return success(change(true), diagnostics)
    },
    undo() {
      if (!past.length) return success(change(false))
      if (revision === Number.MAX_SAFE_INTEGER)
        return failure('EDIT_REVISION_LIMIT', 'The document exhausted its exact revision range.')
      future.push(snapshot!)
      snapshot = past.pop()!
      revision++
      return success(change(true))
    },
    redo() {
      if (!future.length) return success(change(false))
      if (revision === Number.MAX_SAFE_INTEGER)
        return failure('EDIT_REVISION_LIMIT', 'The document exhausted its exact revision range.')
      past.push(snapshot!)
      snapshot = future.pop()!
      revision++
      return success(change(true))
    },
    clear() {
      const changed = snapshot !== undefined
      snapshot = undefined
      documentId = undefined
      revision = 0
      past.length = future.length = 0
      usedAtomIds.clear()
      usedBondIds.clear()
      generatedAtomSequence = generatedBondSequence = 0
      return change(changed)
    }
  }
}
