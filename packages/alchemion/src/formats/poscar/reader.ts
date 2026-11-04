import { cartesianToFractional, cellVolume, createCell } from '../../core/cell'
import { getElement } from '../../core/data'
import { createStructureSnapshot } from '../../core/structure'
import type { Diagnostic, Matrix3, Mobility, PeriodicAtom, Vec3 } from '../../core/types'
import type { ParseResult } from '../contracts'

const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?$/
const number = (text: string): number =>
  numeric.test(text) ? Number(text.replace(/[dD]/, 'e')) : Number.NaN
const tokens = (line: string): string[] =>
  line.split(/[!#]/, 1)[0].trim().split(/\s+/).filter(Boolean)

/** VASP5 geometry and Direct mobility. Unmodelled scientific sections are hard failures. */
export function parsePoscarStructure(text: string): ParseResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)
  const diagnostics: Diagnostic[] = []
  const fail = (code: string, message: string, line: number, field?: string): ParseResult => ({
    diagnostics: [
      ...diagnostics,
      {
        severity: 'error',
        code,
        message,
        context: { format: 'poscar', ...(field ? { field } : {}) },
        sourceLocation: { line, column: 1 }
      }
    ]
  })
  if (lines.length < 8)
    return fail(
      'POSCAR_TRUNCATED',
      'POSCAR requires a comment, scaling, three vectors, species, counts and coordinates.',
      lines.length
    )
  const scaling = tokens(lines[1]).map(number)
  if (
    ![1, 3].includes(scaling.length) ||
    !scaling.every(Number.isFinite) ||
    (scaling.length === 1 ? scaling[0] === 0 : scaling.some((value) => value <= 0))
  )
    return fail(
      'POSCAR_SCALE',
      'Provide one nonzero scaling factor or three positive Cartesian scaling factors.',
      2,
      'scaling'
    )
  const raw = lines.slice(2, 5).map((line) => tokens(line).map(number))
  const invalidVector = raw.findIndex((row) => row.length !== 3 || !row.every(Number.isFinite))
  if (invalidVector >= 0)
    return fail(
      'POSCAR_LATTICE',
      'Each lattice vector requires three finite Cartesian components.',
      invalidVector + 3,
      'cell'
    )
  const rawBasis = raw as unknown as Matrix3
  let factors: readonly number[] = scaling
  if (scaling.length === 1) {
    let factor = scaling[0]
    if (factor < 0) {
      const volume = cellVolume({ basis: rawBasis })
      if (!volume.ok)
        return fail(
          'POSCAR_CELL',
          'A negative volume scale requires a valid, right-handed unscaled lattice.',
          3,
          'cell'
        )
      factor = Math.cbrt(-factor / volume.value)
    }
    factors = [factor, factor, factor]
  }
  const createdCell = createCell({
    basis: rawBasis.map((column) =>
      column.map((value, axis) => value * factors[axis])
    ) as unknown as Matrix3
  })
  if (!createdCell.ok)
    return fail(
      'POSCAR_CELL',
      'The scaled lattice must be finite, right-handed and non-degenerate.',
      3,
      'cell'
    )
  const cell = createdCell.value
  const species = tokens(lines[5])
  if (species.length > 0 && species.every((entry) => /^\d+$/.test(entry)))
    return fail(
      'POSCAR_SPECIES_REQUIRED',
      'VASP4 input without an explicit element line requires an external POTCAR and is not supported.',
      6,
      'species'
    )
  if (!species.length || species.some((symbol) => !getElement(symbol)))
    return fail(
      'POSCAR_ELEMENT',
      'Species must be explicit, recognised chemical element symbols.',
      6,
      'species'
    )
  const countTokens = tokens(lines[6])
  const counts = countTokens.map(Number)
  if (
    counts.length !== species.length ||
    countTokens.some((token) => !/^\d+$/.test(token)) ||
    counts.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    !Number.isSafeInteger(counts.reduce((sum, value) => sum + value, 0)) ||
    counts.reduce((sum, value) => sum + value, 0) === 0
  )
    return fail(
      'POSCAR_COUNTS',
      'Species counts must be matching nonnegative safe integers with a positive total.',
      7,
      'counts'
    )
  const selective = /^[sS]/.test(tokens(lines[7])[0] ?? '')
  const modeIndex = selective ? 8 : 7
  const mode = tokens(lines[modeIndex] ?? '')[0]?.toLowerCase()
  if (!mode || !/^[dck]/.test(mode))
    return fail(
      'POSCAR_COORDINATE_MODE',
      'Choose explicit Direct or Cartesian coordinates (C/c/K/k).',
      modeIndex + 1,
      'coordinates'
    )
  const cartesian = /^[ck]/.test(mode)
  const total = counts.reduce((sum, value) => sum + value, 0)
  const atoms: PeriodicAtom[] = []
  let group = 0,
    groupEnd = counts[0]
  for (let index = 0; index < total; index++) {
    const lineIndex = index + modeIndex + 1
    const lineNumber = lineIndex + 1
    if (lines[lineIndex] === undefined || !lines[lineIndex].trim())
      return fail(
        'POSCAR_TRUNCATED',
        'The coordinate section contains fewer atom records than declared.',
        lineNumber,
        'coordinates'
      )
    while (index >= groupEnd) groupEnd += counts[++group]
    const fields = tokens(lines[lineIndex])
    const values = fields.slice(0, 3).map(number)
    if (values.length !== 3 || !values.every(Number.isFinite))
      return fail(
        'POSCAR_COORDINATE',
        'Each atom requires three finite coordinates.',
        lineNumber,
        'coordinates'
      )
    let movable: Mobility | undefined
    if (selective) {
      const flags = fields.slice(3, 6)
      if (flags.length !== 3 || flags.some((flag) => flag !== 'T' && flag !== 'F'))
        return fail(
          'POSCAR_SELECTIVE_FLAGS',
          'Selective dynamics requires exactly three Direct flags, T or F.',
          lineNumber,
          'constraints'
        )
      movable = [flags[0] === 'T', flags[1] === 'T', flags[2] === 'T']
    }
    const fieldCount = selective ? 6 : 3
    if (
      fields.length > fieldCount &&
      (fields.length !== fieldCount + 1 || fields[fieldCount] !== species[group])
    )
      return fail(
        'POSCAR_COORDINATE_FIELDS',
        'Only an optional matching element label may follow coordinates and any enabled flags.',
        lineNumber,
        'coordinates'
      )
    let fractional = values as unknown as Vec3
    if (cartesian) {
      const converted = cartesianToFractional(
        cell,
        values.map((value, axis) => value * factors[axis]) as unknown as Vec3
      )
      if (!converted.ok)
        return fail(
          'POSCAR_COORDINATE',
          'Scaled Cartesian coordinates cannot be converted to finite fractional coordinates.',
          lineNumber,
          'coordinates'
        )
      fractional = converted.value
    }
    atoms.push({
      id: `poscar:atom:${index + 1}`,
      element: species[group],
      fractional,
      ...(movable ? { movable } : {}),
      occupancy: { kind: 'known', value: 1, provenance: { source: 'POSCAR', version: 'VASP5' } }
    })
  }
  const trailing = lines.findIndex(
    (line, index) => index >= total + modeIndex + 1 && line.trim().length > 0
  )
  if (trailing >= 0)
    return fail(
      /^\s*[lL]/.test(lines[trailing])
        ? 'POSCAR_LATTICE_VELOCITIES_UNSUPPORTED'
        : 'POSCAR_TRAILING_DATA_UNSUPPORTED',
      'Velocities, predictor-corrector and other trailing scientific sections are not represented by the structure model.',
      trailing + 1,
      'trailingData'
    )
  const created = createStructureSnapshot({
    kind: 'periodic',
    title: lines[0],
    cell,
    atoms,
    bonds: [],
    metadata: {
      alchemionFormats: { schemaVersion: 1, sourceFormat: 'poscar', version: 'VASP5', losses: [] }
    }
  })
  if (!created.ok) return { diagnostics: [...diagnostics, ...created.diagnostics] }
  return { structure: created.value, diagnostics: [...diagnostics, ...created.diagnostics] }
}
