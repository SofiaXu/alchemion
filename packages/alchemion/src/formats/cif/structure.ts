import {
  cartesianToFractional,
  cellParameters,
  checkReportedCellVolume,
  createCell,
  createStructureSnapshot,
  fractionalToCartesian,
  getElement,
  getSpaceGroupSetting,
  parseSymmetryOperation,
  resolveSymmetry,
  validateStructure
} from '../../core'
import type {
  Cell,
  CellParameters,
  Diagnostic,
  JsonValue,
  PeriodicAtom,
  ScientificValue,
  SpaceGroupIdentifier,
  StructureSnapshot,
  SymmetryOperation,
  Vec3
} from '../../core'
import type { CifParseOptions, CifWriteOptions, ParseResult, WriteResult } from '../contracts'
import { hasErrors, inheritedLossDiagnostics, lossDiagnostic } from '../loss'
import { cifNameKey, parseCifDocument, writeCifDocument } from './document'
import type { CifDataBlock, CifDocument, CifEntry, CifLocation, CifTag, CifValue } from './types'

interface NumberValue {
  readonly value: number
  readonly literal: string
  readonly standardUncertainty?: number
}
interface Field {
  readonly tag: CifTag
  readonly values: readonly CifValue[]
  readonly loop?: CifEntry
}
const close = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-9 + 1e-10 * Math.max(Math.abs(a), Math.abs(b))
const normalized = (tag: string): string => tag.slice(1).toLowerCase().replace(/\./g, '_')
const aliases: Readonly<Record<string, string>> = {
  symmetry_int_tables_number: 'space_group_it_number',
  symmetry_space_group_name_hall: 'space_group_name_hall',
  'symmetry_space_group_name_h-m': 'space_group_name_h-m_alt',
  symmetry_equiv_pos_as_xyz: 'space_group_symop_operation_xyz'
}
const canonical = (tag: string): string => aliases[normalized(tag)] ?? normalized(tag)
const supported = new Set([
  'cell_length_a',
  'cell_length_b',
  'cell_length_c',
  'cell_angle_alpha',
  'cell_angle_beta',
  'cell_angle_gamma',
  'cell_volume',
  'atom_site_label',
  'atom_site_type_symbol',
  'atom_site_fract_x',
  'atom_site_fract_y',
  'atom_site_fract_z',
  'atom_site_cartn_x',
  'atom_site_cartn_y',
  'atom_site_cartn_z',
  'atom_site_occupancy',
  'atom_site_u_iso_or_equiv',
  'atom_site_b_iso_or_equiv',
  'space_group_it_number',
  'space_group_name_h-m_alt',
  'space_group_name_hall',
  'space_group_symop_operation_xyz'
])
const annotation = (tag: string): boolean =>
  /^(?:audit_|publ_|journal_|citation_|database_|chemical_name_|chemical_formula_|exptl_crystal_description$)/.test(
    tag
  )
let nextImportId = 0

/** Both conventional CIF placement of an esd and exponent-before-esd are accepted. */
export function parseCifNumber(text: string): NumberValue | undefined {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\((\d+)\))?([eE][+-]?\d+)?(?:\((\d+)\))?$/.exec(
    text
  )
  if (!match || (match[2] !== undefined && match[4] !== undefined)) return undefined
  const value = Number(match[1] + (match[3] ?? ''))
  if (!Number.isFinite(value)) return undefined
  const digits = match[2] ?? match[4]
  if (digits === undefined) return { value, literal: text }
  const decimals = (match[1].split('.')[1] ?? '').length
  const exponent = match[3] === undefined ? 0 : Number(match[3].slice(1))
  const standardUncertainty = Number(digits) * 10 ** (exponent - decimals)
  return Number.isFinite(standardUncertainty)
    ? { value, literal: text, standardUncertainty }
    : undefined
}
const scientific = (value: CifValue): ScientificValue | undefined => {
  if (value.kind === 'unknown' || value.kind === 'not-applicable') return { kind: value.kind }
  const number = value.kind === 'scalar' && !value.quoted ? parseCifNumber(value.value) : undefined
  return number ? { kind: 'known', ...number } : undefined
}
const scalar = (value: CifValue | undefined): string | undefined =>
  value?.kind === 'scalar' ? value.value : undefined
const sameValues = (a: readonly CifValue[], b: readonly CifValue[]): boolean =>
  a.length === b.length &&
  a.every((value, index) => {
    const other = b[index]
    if (value.kind !== other.kind) return false
    if (value.kind === 'scalar' && other.kind === 'scalar') {
      const na = parseCifNumber(value.value),
        nb = parseCifNumber(other.value)
      return na && nb
        ? close(na.value, nb.value) &&
            ((na.standardUncertainty === undefined && nb.standardUncertainty === undefined) ||
              (na.standardUncertainty !== undefined &&
                nb.standardUncertainty !== undefined &&
                close(na.standardUncertainty, nb.standardUncertainty)))
        : value.value === other.value
    }
    if (value.kind === 'unknown' || value.kind === 'not-applicable') return true
    return JSON.stringify(value) === JSON.stringify(other)
  })

function collectFields(block: CifDataBlock, diagnostics: Diagnostic[]): Map<string, Field> {
  const fields = new Map<string, Field>()
  const add = (tag: CifTag, values: readonly CifValue[], loop?: CifEntry) => {
    const key = canonical(tag.name)
    const previous = fields.get(key)
    if (previous && !sameValues(previous.values, values))
      diagnostics.push({
        severity: 'error',
        code: 'CIF_ALIAS_CONFLICT',
        message: 'Equivalent CIF data names contain conflicting values.',
        sourceLocation: tag.sourceLocation,
        context: { block: block.name, tag: tag.name, previousTag: previous.tag.name }
      })
    else if (!previous) fields.set(key, { tag, values, loop })
  }
  for (const entry of block.entries) {
    if (entry.kind === 'item') add(entry.tag, [entry.value])
    else
      entry.tags.forEach((tag, index) =>
        add(
          tag,
          entry.rows.map((row) => row[index]),
          entry
        )
      )
  }
  return fields
}

function readBlock(block: CifDataBlock, version: '1' | '2'): ParseResult {
  const diagnostics: Diagnostic[] = []
  const losses: Diagnostic[] = []
  const fields = collectFields(block, diagnostics)
  const error = (code: string, message: string, key?: string, index = 0) =>
    diagnostics.push({
      severity: 'error',
      code,
      message,
      sourceLocation:
        fields.get(key ?? '')?.values[index]?.sourceLocation ??
        fields.get(key ?? '')?.tag.sourceLocation ??
        block.sourceLocation,
      context: {
        format: 'cif',
        version,
        block: block.name,
        ...(key ? { tag: fields.get(key)?.tag.name ?? `_${key}`, record: index + 1 } : {})
      }
    })
  const number = (key: string, required: boolean, index = 0): NumberValue | undefined => {
    const entry = fields.get(key)?.values[index]
    if (!entry) {
      if (required)
        error('CIF_REQUIRED_FIELD', 'A required crystallographic field is missing.', key, index)
      return undefined
    }
    const result =
      entry.kind === 'scalar' && !entry.quoted ? parseCifNumber(entry.value) : undefined
    if (!result) error('CIF_NUMBER', 'A finite CIF number is required for this field.', key, index)
    return result
  }
  const single = (key: string) => {
    const field = fields.get(key)
    if (field && field.values.length !== 1)
      error('CIF_SCALAR_FIELD', 'This crystallographic field must have one value.', key)
    return field?.values[0]
  }
  const parameterKeys: Record<keyof CellParameters, string> = {
    a: 'cell_length_a',
    b: 'cell_length_b',
    c: 'cell_length_c',
    alpha: 'cell_angle_alpha',
    beta: 'cell_angle_beta',
    gamma: 'cell_angle_gamma'
  }
  const measurements = Object.fromEntries(
    Object.entries(parameterKeys).map(([parameter, key]) => {
      single(key)
      return [parameter, number(key, true)]
    })
  ) as Record<keyof CellParameters, NumberValue | undefined>
  if (hasErrors(diagnostics)) return { diagnostics }
  const parameters = Object.fromEntries(
    Object.entries(measurements).map(([key, measurement]) => [key, measurement!.value])
  ) as unknown as CellParameters
  const cellResult = createCell(parameters)
  if (!cellResult.ok)
    return {
      diagnostics: [
        ...diagnostics,
        ...cellResult.diagnostics.map((entry) => ({
          ...entry,
          sourceLocation: fields.get('cell_length_a')?.tag.sourceLocation,
          context: { ...entry.context, format: 'cif', version, block: block.name }
        }))
      ]
    }
  const parameterUncertainties = Object.fromEntries(
    Object.entries(measurements).flatMap(([key, measurement]) =>
      measurement?.standardUncertainty === undefined
        ? []
        : [
            [
              key,
              { standardUncertainty: measurement.standardUncertainty, literal: measurement.literal }
            ]
          ]
    )
  )
  const cell: Cell = {
    ...cellResult.value,
    ...(Object.keys(parameterUncertainties).length ? { parameterUncertainties } : {})
  }
  const volumeValue = fields.has('cell_volume') ? single('cell_volume') : undefined
  const volumeMissing =
    volumeValue?.kind === 'unknown' || volumeValue?.kind === 'not-applicable'
      ? volumeValue.kind
      : undefined
  const volume = volumeValue && !volumeMissing ? number('cell_volume', false) : undefined
  if (volume) {
    const checked = checkReportedCellVolume(cell, volume.value, volume.standardUncertainty)
    diagnostics.push(
      ...checked.diagnostics.map((entry) => ({
        ...entry,
        sourceLocation: fields.get('cell_volume')?.values[0].sourceLocation,
        context: {
          ...entry.context,
          format: 'cif',
          version,
          block: block.name,
          tag: fields.get('cell_volume')!.tag.name
        }
      }))
    )
  }
  const fractionalKeys = ['atom_site_fract_x', 'atom_site_fract_y', 'atom_site_fract_z']
  const cartesianKeys = ['atom_site_cartn_x', 'atom_site_cartn_y', 'atom_site_cartn_z']
  const hasFractional = fractionalKeys.some((key) => fields.has(key))
  const hasCartesian = cartesianKeys.some((key) => fields.has(key))
  if (!hasFractional && !hasCartesian)
    error('CIF_ATOMS', 'The selected data block has no supported atom coordinates.')
  const atomFields = [...fields.entries()].filter(
    ([key]) => key.startsWith('atom_site_') && supported.has(key)
  )
  const atomCount = atomFields[0]?.[1].values.length ?? 0
  const atomLoops = new Set(atomFields.map(([, field]) => field.loop))
  if (atomLoops.size > 1)
    error(
      'CIF_ATOM_TABLE_SPLIT',
      'Mapped atom fields must share one atom table; unrelated loop rows cannot be aligned by their position.'
    )
  for (const [key, field] of atomFields)
    if (field.values.length !== atomCount)
      error('CIF_ATOM_CARDINALITY', 'Atom fields must contain equal numbers of records.', key)
  if (!atomCount) error('CIF_ATOMS', 'A crystal structure requires at least one atom record.')
  const importId = `cif-import-${++nextImportId}`
  let atomSequence = 0
  const atoms: PeriodicAtom[] = []
  const sourceAtoms: JsonValue[] = []
  for (let index = 0; index < atomCount; index++) {
    const id = `${importId}-atom-${++atomSequence}`
    const labelValue = fields.get('atom_site_label')?.values[index]
    const label = scalar(labelValue)
    if (labelValue && label === undefined)
      error('CIF_ATOM_LABEL', 'Atom labels must be textual values.', 'atom_site_label', index)
    const typeValue = fields.get('atom_site_type_symbol')?.values[index]
    const explicitType = scalar(typeValue)
    let element: string | undefined
    if (explicitType !== undefined) {
      const match = /^([A-Z][a-z]?)(?:(?:\d+[+-])|(?:[+-]\d*))?$/.exec(explicitType)
      element = match?.[1]
      if (!element || !getElement(element))
        error(
          'CIF_ELEMENT',
          'Atom type is not a supported chemical element.',
          'atom_site_type_symbol',
          index
        )
      // Oxidation suffixes are not formal charges and are retained explicitly as oxidation states.
    } else if (typeValue)
      error(
        'CIF_ELEMENT',
        'An explicit atom type cannot be unknown or not applicable.',
        'atom_site_type_symbol',
        index
      )
    else if (label !== undefined) {
      const match = /^([A-Z][a-z]?)(?:\d.*|[^A-Za-z].*|)$/.exec(label)
      if (match && getElement(match[1])) {
        element = match[1]
        diagnostics.push({
          severity: 'warning',
          code: 'CIF_ELEMENT_FROM_LABEL',
          message: 'The atom element was inferred from its unambiguous label.',
          sourceLocation: labelValue?.sourceLocation,
          context: { atomId: id, block: block.name, label }
        })
      } else
        error(
          'CIF_ELEMENT_AMBIGUOUS',
          'A missing atom type cannot be inferred uniquely from the label.',
          'atom_site_label',
          index
        )
    } else
      error(
        'CIF_ELEMENT_MISSING',
        'An atom requires an element type or an unambiguous label.',
        'atom_site_type_symbol',
        index
      )
    const fractionalMeasurements = hasFractional
      ? fractionalKeys.map((key) => number(key, true, index))
      : undefined
    const cartesianMeasurements = hasCartesian
      ? cartesianKeys.map((key) => number(key, true, index))
      : undefined
    if (
      fractionalMeasurements?.some((entry) => !entry) ||
      cartesianMeasurements?.some((entry) => !entry)
    )
      continue
    const fractionalInput = fractionalMeasurements?.map((entry) => entry!.value) as unknown as
      | Vec3
      | undefined
    const cartesianInput = cartesianMeasurements?.map((entry) => entry!.value) as unknown as
      | Vec3
      | undefined
    const converted = cartesianInput ? cartesianToFractional(cell, cartesianInput) : undefined
    if (converted && !converted.ok) {
      diagnostics.push(...converted.diagnostics)
      continue
    }
    const fractional = fractionalInput ?? (converted?.ok ? converted.value : undefined)
    if (!fractional) continue
    if (fractionalInput && cartesianInput) {
      const cartesian = fractionalToCartesian(cell, fractionalInput)
      if (!cartesian.ok) diagnostics.push(...cartesian.diagnostics)
      else if (
        !cartesian.value.every((entry, coordinate) => close(entry, cartesianInput[coordinate]))
      )
        error(
          'CIF_COORDINATE_CONFLICT',
          'Fractional and Cartesian coordinates disagree for this atom.',
          'atom_site_cartn_x',
          index
        )
    }
    const property = (key: string): ScientificValue | undefined => {
      const value = fields.get(key)?.values[index]
      if (!value) return undefined
      const result = scientific(value)
      if (!result)
        error(
          'CIF_NUMBER',
          'Expected a scientific number, unknown value, or not-applicable value.',
          key,
          index
        )
      return result
    }
    const occupancy = property('atom_site_occupancy')
    const u = property('atom_site_u_iso_or_equiv')
    const b = property('atom_site_b_iso_or_equiv')
    const bAsU: ScientificValue | undefined =
      b?.kind === 'known'
        ? {
            kind: 'known',
            value: b.value / (8 * Math.PI ** 2),
            ...(b.standardUncertainty === undefined
              ? {}
              : { standardUncertainty: b.standardUncertainty / (8 * Math.PI ** 2) }),
            provenance: { source: 'CIF B/(8π²)', version }
          }
        : b
    if (
      u &&
      bAsU &&
      (u.kind !== bAsU.kind ||
        (u.kind === 'known' && bAsU.kind === 'known' && !close(u.value, bAsU.value)))
    )
      error(
        'CIF_DISPLACEMENT_CONFLICT',
        'U and B isotropic displacement fields are inconsistent.',
        'atom_site_b_iso_or_equiv',
        index
      )
    const measured = fractionalMeasurements?.every(
      (entry) => entry?.standardUncertainty !== undefined
    )
      ? { frame: 'fractional' as const, values: fractionalMeasurements }
      : cartesianMeasurements?.every((entry) => entry?.standardUncertainty !== undefined)
        ? { frame: 'cartesian' as const, values: cartesianMeasurements }
        : undefined
    const oxidationMatch =
      explicitType && /^[A-Z][a-z]?(?:(\d+)([+-])|([+-])(\d*))$/.exec(explicitType)
    const oxidationState = oxidationMatch
      ? {
          kind: 'known' as const,
          value:
            Number(oxidationMatch[1] ?? (oxidationMatch[4] || '1')) *
            ((oxidationMatch[2] ?? oxidationMatch[3]) === '-' ? -1 : 1)
        }
      : undefined
    atoms.push({
      id,
      element: element ?? '',
      fractional,
      ...(label === undefined ? {} : { label }),
      ...(occupancy ? { occupancy } : {}),
      ...((u ?? bAsU) ? { displacementU: u ?? bAsU } : {}),
      ...(oxidationState ? { oxidationState } : {}),
      ...(measured
        ? {
            coordinateUncertainties: {
              frame: measured.frame,
              standardUncertainties: measured.values.map(
                (entry) => entry!.standardUncertainty!
              ) as unknown as Vec3,
              literals: measured.values.map((entry) => entry!.literal) as unknown as readonly [
                string,
                string,
                string
              ]
            }
          }
        : {})
    })
    sourceAtoms.push({
      atomId: id,
      fractional,
      ...(fractionalMeasurements
        ? { fractionalMeasurements: fractionalMeasurements as unknown as JsonValue }
        : {}),
      ...(cartesianMeasurements
        ? { cartesianMeasurements: cartesianMeasurements as unknown as JsonValue }
        : {}),
      ...(b?.kind === 'known' ? { displacementB: b as unknown as JsonValue } : {})
    })
  }
  const identifier: { -readonly [K in keyof SpaceGroupIdentifier]: SpaceGroupIdentifier[K] } = {}
  const symmetryMarkers: Record<string, 'unknown' | 'not-applicable'> = {}
  if (fields.has('space_group_it_number')) {
    const value = single('space_group_it_number')
    if (value?.kind === 'unknown' || value?.kind === 'not-applicable')
      symmetryMarkers.space_group_it_number = value.kind
    else {
      const it = number('space_group_it_number', false)
      if (it) identifier.itNumber = it.value
    }
  }
  for (const [key, property] of [
    ['space_group_name_h-m_alt', 'hermannMauguin'],
    ['space_group_name_hall', 'hallSymbol']
  ] as const) {
    const value = single(key)
    if (value) {
      const text = scalar(value)
      if (text !== undefined) identifier[property] = text
      else if (value.kind !== 'unknown' && value.kind !== 'not-applicable')
        error('CIF_SYMMETRY_NAME', 'A space-group identifier must be a scalar string.', key)
      else symmetryMarkers[key] = value.kind
    }
  }
  const operations: SymmetryOperation[] = []
  for (const [index, value] of (
    fields.get('space_group_symop_operation_xyz')?.values ?? []
  ).entries()) {
    const text = scalar(value)
    if (
      (value.kind === 'unknown' || value.kind === 'not-applicable') &&
      fields.get('space_group_symop_operation_xyz')!.values.length === 1
    )
      symmetryMarkers.space_group_symop_operation_xyz = value.kind
    else if (text === undefined)
      error(
        'CIF_SYMMETRY_OPERATION',
        'A symmetry operation requires an affine xyz string.',
        'space_group_symop_operation_xyz',
        index
      )
    else {
      const result = parseSymmetryOperation(text, `${importId}-symop-${index + 1}`)
      if (result.ok) operations.push(result.value)
      else
        diagnostics.push(
          ...result.diagnostics.map((entry) => ({
            ...entry,
            sourceLocation: value.sourceLocation,
            context: { ...entry.context, block: block.name, record: index + 1 }
          }))
        )
    }
  }
  for (const [key, field] of fields) {
    if (supported.has(key) || annotation(key)) continue
    const loss: Diagnostic = {
      severity: 'warning',
      code: 'CIF_UNMAPPED_SCIENCE',
      message:
        'This scientific CIF data item is retained only by the document API and is not represented in the structure model.',
      sourceLocation: field.tag.sourceLocation,
      context: {
        format: 'cif',
        version,
        block: block.name,
        tag: field.tag.name,
        category: key.split('_').slice(0, 2).join('_')
      }
    }
    losses.push(loss)
    diagnostics.push(loss)
  }
  for (const [tag, state] of Object.entries(symmetryMarkers))
    diagnostics.push({
      severity: 'warning',
      code: 'CIF_SYMMETRY_UNKNOWN',
      message:
        'The missing space-group value is preserved as a marker and does not resolve a symmetry setting.',
      sourceLocation: fields.get(tag)?.tag.sourceLocation,
      context: { tag, state, block: block.name }
    })
  for (const frame of block.saveFrames) {
    const loss: Diagnostic = {
      severity: 'warning',
      code: 'CIF_UNMAPPED_FRAME',
      message:
        'Save-frame content is retained by the document API and is not mapped into a crystal structure.',
      sourceLocation: frame.sourceLocation,
      context: { format: 'cif', version, block: block.name, frame: frame.name }
    }
    losses.push(loss)
    diagnostics.push(loss)
  }
  if (hasErrors(diagnostics)) return { diagnostics }
  const title =
    scalar(fields.get('chemical_name_common')?.values[0]) ??
    scalar(fields.get('chemical_name_systematic')?.values[0])
  const symmetry =
    operations.length || Object.keys(identifier).length
      ? {
          ...(operations.length ? { operations } : {}),
          ...(Object.keys(identifier).length ? { spaceGroup: identifier } : {})
        }
      : undefined
  const result = createStructureSnapshot({
    kind: 'periodic',
    cell,
    atoms,
    bonds: [],
    ...(title ? { title } : {}),
    ...(symmetry ? { symmetry } : {}),
    metadata: {
      alchemionFormats: {
        schemaVersion: 1,
        sourceFormat: 'cif',
        version,
        losses: losses as unknown as JsonValue,
        sourceMeasurements: {
          cellBasis: cell.basis,
          cellParameters: measurements as unknown as JsonValue,
          atoms: sourceAtoms,
          ...(Object.keys(symmetryMarkers).length
            ? { symmetryMarkers, symmetryAnchor: (symmetry ?? null) as unknown as JsonValue }
            : {}),
          ...(volume ? { reportedVolume: volume as unknown as JsonValue } : {}),
          ...(volumeMissing ? { reportedVolumeMissing: volumeMissing } : {})
        }
      }
    }
  })
  const positioned = result.diagnostics.map((entry) => ({
    ...entry,
    sourceLocation:
      entry.sourceLocation ??
      (entry.context?.atomId
        ? atoms.find((atom) => atom.id === entry.context!.atomId) &&
          fields.get('atom_site_label')?.tag.sourceLocation
        : undefined) ??
      block.sourceLocation,
    context: { ...entry.context, format: 'cif', version, block: block.name }
  }))
  return result.ok
    ? { structure: result.value, diagnostics: [...diagnostics, ...positioned] }
    : { diagnostics: [...diagnostics, ...positioned] }
}

export function parseCifStructure(text: string, options: CifParseOptions): ParseResult {
  const parsed = parseCifDocument(text)
  if (!parsed.document) return { diagnostics: parsed.diagnostics }
  const candidates = parsed.document.blocks.map((block, index) => ({ name: block.name, index }))
  const selector = options.block
  let block: CifDataBlock | undefined
  if (selector && 'name' in selector)
    block = parsed.document.blocks.find(
      (entry) => cifNameKey(entry.name) === cifNameKey(selector.name)
    )
  else if (
    selector &&
    'index' in selector &&
    Number.isSafeInteger(selector.index) &&
    selector.index >= 0
  )
    block = parsed.document.blocks[selector.index]
  else if (!selector && candidates.length === 1) block = parsed.document.blocks[0]
  if (!block)
    return {
      diagnostics: [
        {
          severity: 'error',
          code: candidates.length
            ? selector
              ? 'CIF_BLOCK_SELECTION'
              : 'CIF_BLOCK_REQUIRED'
            : 'CIF_NO_BLOCKS',
          message: candidates.length
            ? 'Select one crystal data block by its name or zero-based index.'
            : 'The CIF document contains no data blocks.',
          context: { format: 'cif', version: parsed.document.version }
        }
      ],
      candidates
    }
  return readBlock(block, parsed.document.version)
}

const literalValue = (value: string, quoted = false): CifValue => ({
  kind: 'scalar',
  value,
  quoted
})
function numericText(value: number, standardUncertainty?: number, literal?: string): string {
  const previous = literal === undefined ? undefined : parseCifNumber(literal)
  if (
    previous &&
    close(previous.value, value) &&
    (standardUncertainty === undefined
      ? previous.standardUncertainty === undefined
      : previous.standardUncertainty !== undefined &&
        close(previous.standardUncertainty, standardUncertainty))
  )
    return literal!
  if (standardUncertainty === undefined) return String(value)
  if (standardUncertainty === 0)
    return `${String(value).replace(/([eE].*)$/, '(0)$1')}${/[eE]/.test(String(value)) ? '' : '(0)'}`
  const exponent = Math.floor(Math.log10(Math.max(Math.abs(value), standardUncertainty)))
  const places = Math.max(17, exponent - Math.floor(Math.log10(standardUncertainty)) + 12)
  if (places > 100)
    throw new Error(
      'This numerical value and uncertainty require more decimal precision than the writer supports.'
    )
  const mantissa = (value / 10 ** exponent).toFixed(places)
  const esd = (standardUncertainty / 10 ** (exponent - places)).toFixed(0)
  return `${mantissa}(${esd})e${exponent}`
}
const measuredValue = (value: ScientificValue): CifValue =>
  value.kind === 'known'
    ? literalValue(numericText(value.value, value.standardUncertainty, value.literal))
    : { kind: value.kind }
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const sameAnchor = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const measurement = (value: unknown): NumberValue | undefined =>
  object(value) &&
  typeof value.value === 'number' &&
  typeof value.literal === 'string' &&
  (value.standardUncertainty === undefined || typeof value.standardUncertainty === 'number')
    ? (value as unknown as NumberValue)
    : undefined
function operationText(operation: SymmetryOperation): string {
  return [0, 1, 2]
    .map((row) => {
      let text = ''
      for (let column = 0; column < 3; column++) {
        const coefficient = operation.rotation[column][row]
        if (coefficient)
          text += `${coefficient < 0 ? '-' : text ? '+' : ''}${Math.abs(coefficient) === 1 ? '' : Math.abs(coefficient)}${'xyz'[column]}`
      }
      const { numerator, denominator } = operation.translation[row]
      if (numerator)
        text += `${numerator < 0 ? '-' : text ? '+' : ''}${Math.abs(numerator)}${denominator === 1 ? '' : `/${denominator}`}`
      return text || '0'
    })
    .join(',')
}

export function writeCifStructure(
  snapshot: StructureSnapshot,
  options: CifWriteOptions
): WriteResult {
  const diagnostics: Diagnostic[] = [...validateStructure(snapshot)]
  if (snapshot.kind !== 'periodic')
    diagnostics.push({
      severity: 'error',
      code: 'CIF_PERIODIC_REQUIRED',
      message: 'Crystal CIF output requires a periodic structure and a valid cell.'
    })
  if (hasErrors(diagnostics) || snapshot.kind !== 'periodic') return { diagnostics }
  if (!snapshot.atoms.length)
    return {
      diagnostics: [
        {
          severity: 'error',
          code: 'CIF_EMPTY',
          message: 'Crystal CIF output requires at least one atom.'
        }
      ]
    }
  const allowLoss = options.allowLoss === true
  diagnostics.push(...inheritedLossDiagnostics(snapshot, allowLoss))
  const loss = (
    code: string,
    message: string,
    context?: Diagnostic['context'],
    sourceLocation?: CifLocation
  ) => diagnostics.push(lossDiagnostic(code, message, allowLoss, context, sourceLocation))
  for (const bond of snapshot.bonds)
    loss(
      'CIF_BOND_LOSS',
      'The supported crystal CIF mapping does not express explicit bond semantics.',
      { bondId: bond.id }
    )
  const parameters = cellParameters(snapshot.cell)
  if (!parameters.ok) return { diagnostics: [...diagnostics, ...parameters.diagnostics] }
  const metadata = snapshot.metadata?.alchemionFormats
  const source =
    object(metadata) && object(metadata.sourceMeasurements)
      ? metadata.sourceMeasurements
      : undefined
  const cellAnchored = source && sameAnchor(source.cellBasis, snapshot.cell.basis)
  const sourceParameters =
    cellAnchored && object(source.cellParameters) ? source.cellParameters : undefined
  const sourceAtoms = source && Array.isArray(source.atoms) ? source.atoms : []
  const entries: CifEntry[] = []
  const item = (tag: string, value: CifValue) =>
    entries.push({ kind: 'item', tag: { name: `_${tag}` }, value })
  const parameterKeys: Record<keyof CellParameters, string> = {
    a: 'cell_length_a',
    b: 'cell_length_b',
    c: 'cell_length_c',
    alpha: 'cell_angle_alpha',
    beta: 'cell_angle_beta',
    gamma: 'cell_angle_gamma'
  }
  try {
    for (const [key, tag] of Object.entries(parameterKeys)) {
      const parameter = key as keyof CellParameters
      const known = snapshot.cell.parameterUncertainties?.[parameter]
      const original = sourceParameters && measurement(sourceParameters[parameter])
      item(
        tag,
        literalValue(
          numericText(
            parameters.value[parameter],
            known?.standardUncertainty,
            known?.literal ?? original?.literal
          )
        )
      )
    }
    const reported = cellAnchored && measurement(source.reportedVolume)
    if (reported) {
      item(
        'cell_volume',
        literalValue(numericText(reported.value, reported.standardUncertainty, reported.literal))
      )
      diagnostics.push(
        ...checkReportedCellVolume(snapshot.cell, reported.value, reported.standardUncertainty)
          .diagnostics
      )
    } else if (
      cellAnchored &&
      (source.reportedVolumeMissing === 'unknown' ||
        source.reportedVolumeMissing === 'not-applicable')
    )
      item('cell_volume', { kind: source.reportedVolumeMissing })
    if (snapshot.title !== undefined)
      item('chemical_name_common', literalValue(snapshot.title, true))
    const spaceGroup = snapshot.symmetry?.spaceGroup
    if (spaceGroup?.itNumber !== undefined)
      item('space_group_IT_number', literalValue(String(spaceGroup.itNumber)))
    if (spaceGroup?.hermannMauguin !== undefined)
      item('space_group_name_H-M_alt', literalValue(spaceGroup.hermannMauguin, true))
    if (spaceGroup?.hallSymbol !== undefined)
      item('space_group_name_Hall', literalValue(spaceGroup.hallSymbol, true))
    // Hall number/choice do not have supported standalone CIF fields; resolved operations express the actual setting.
    let operations = snapshot.symmetry?.operations
    if ((spaceGroup?.hallNumber !== undefined || spaceGroup?.choice !== undefined) && !operations) {
      const resolved = resolveSymmetry(snapshot.symmetry, snapshot.cell)
      if (!resolved.ok) diagnostics.push(...resolved.diagnostics)
      else operations = resolved.value
    }
    if (spaceGroup?.hallNumber !== undefined && !spaceGroup.hallSymbol) {
      const setting = getSpaceGroupSetting(spaceGroup.hallNumber)
      if (setting) item('space_group_name_Hall', literalValue(setting.hallSymbol, true))
    }
    if (operations?.length)
      entries.push({
        kind: 'loop',
        tags: [{ name: '_space_group_symop_operation_xyz' }],
        rows: operations.map((operation) => [literalValue(operationText(operation), true)])
      })
    if (
      source &&
      sameAnchor(source.symmetryAnchor, snapshot.symmetry ?? null) &&
      object(source.symmetryMarkers)
    ) {
      for (const [tag, state] of Object.entries(source.symmetryMarkers)) {
        if (state === 'unknown' || state === 'not-applicable') item(tag, { kind: state })
      }
    }
    const anchored = (atom: PeriodicAtom) => {
      const original = sourceAtoms.find((entry) => object(entry) && entry.atomId === atom.id)
      return cellAnchored && object(original) && sameAnchor(original.fractional, atom.fractional)
        ? original
        : undefined
    }
    const includeCartesian = snapshot.atoms.some((atom) => {
      const original = anchored(atom)
      return (
        atom.coordinateUncertainties?.frame === 'cartesian' ||
        (Array.isArray(original?.cartesianMeasurements) &&
          original.cartesianMeasurements.some(
            (entry) => measurement(entry)?.standardUncertainty !== undefined
          ))
      )
    })
    const includeU = snapshot.atoms.some((atom) => atom.displacementU !== undefined)
    const includeB = snapshot.atoms.some((atom) => anchored(atom)?.displacementB !== undefined)
    const rows: CifValue[][] = []
    const labels = new Set(
      snapshot.atoms.flatMap((atom) => (atom.label === undefined ? [] : [atom.label]))
    )
    let generatedLabels = 0
    for (const atom of snapshot.atoms) {
      const original = anchored(atom)
      let label = atom.label
      if (label === undefined) {
        do {
          label = `Alchemion${++generatedLabels}`
        } while (labels.has(label))
        labels.add(label)
        diagnostics.push({
          severity: 'info',
          code: 'CIF_LABEL_GENERATED',
          message: 'A label was generated for an atom without an explicit label.',
          context: { atomId: atom.id, label }
        })
      }
      for (const key of ['isotope', 'formalCharge', 'radical', 'atomMap'] as const)
        if (atom[key] !== undefined)
          loss(
            'CIF_ATOM_PROPERTY_LOSS',
            'The supported crystal CIF mapping cannot express this atom property.',
            { atomId: atom.id, field: key }
          )
      let typeSymbol = atom.element
      if (atom.oxidationState !== undefined) {
        if (
          atom.oxidationState.kind === 'known' &&
          Number.isSafeInteger(atom.oxidationState.value) &&
          atom.oxidationState.standardUncertainty === undefined
        ) {
          const oxidation = atom.oxidationState.value
          if (oxidation) typeSymbol += `${Math.abs(oxidation)}${oxidation < 0 ? '-' : '+'}`
        } else
          loss(
            'CIF_OXIDATION_LOSS',
            'This oxidation-state measurement cannot be represented in an atom type symbol.',
            { atomId: atom.id }
          )
      }
      const row: CifValue[] = [literalValue(label, true), literalValue(typeSymbol, true)]
      const coordinateValues = (frame: 'fractional' | 'cartesian', values: Vec3) => {
        const historical = original?.[`${frame}Measurements`]
        const formal =
          atom.coordinateUncertainties?.frame === frame ? atom.coordinateUncertainties : undefined
        return values.map((value, coordinate) => {
          const old = Array.isArray(historical) ? measurement(historical[coordinate]) : undefined
          const literal = formal?.literals?.[coordinate] ?? old?.literal
          const su = formal?.standardUncertainties[coordinate] ?? old?.standardUncertainty
          if (literal) {
            const parsed = parseCifNumber(literal)
            if (parsed && !close(parsed.value, value)) {
              loss(
                'CIF_UNCERTAINTY_STALE',
                'A coordinate literal no longer matches the current coordinate and its uncertainty cannot be reused.',
                { atomId: atom.id, frame, coordinate }
              )
              return literalValue(String(value))
            }
          }
          return literalValue(numericText(value, su, literal))
        })
      }
      row.push(...coordinateValues('fractional', atom.fractional))
      if (includeCartesian) {
        const cartesian = fractionalToCartesian(snapshot.cell, atom.fractional)
        if (!cartesian.ok) {
          diagnostics.push(...cartesian.diagnostics)
          continue
        }
        row.push(...coordinateValues('cartesian', cartesian.value))
      }
      row.push(measuredValue(atom.occupancy ?? { kind: 'known', value: 1 }))
      if (includeU)
        row.push(
          atom.displacementU ? measuredValue(atom.displacementU) : { kind: 'not-applicable' }
        )
      if (includeB) {
        const old = original?.displacementB
        if (
          object(old) &&
          old.kind === 'known' &&
          typeof old.value === 'number' &&
          atom.displacementU?.kind === 'known' &&
          close(atom.displacementU.value * 8 * Math.PI ** 2, old.value)
        )
          row.push(measuredValue(old as unknown as ScientificValue))
        else if (atom.displacementU?.kind === 'known')
          row.push(
            literalValue(
              numericText(
                atom.displacementU.value * 8 * Math.PI ** 2,
                atom.displacementU.standardUncertainty === undefined
                  ? undefined
                  : atom.displacementU.standardUncertainty * 8 * Math.PI ** 2
              )
            )
          )
        else row.push({ kind: atom.displacementU?.kind ?? 'not-applicable' })
      }
      rows.push(row)
    }
    entries.push({
      kind: 'loop',
      tags: [
        'atom_site_label',
        'atom_site_type_symbol',
        'atom_site_fract_x',
        'atom_site_fract_y',
        'atom_site_fract_z',
        ...(includeCartesian
          ? ['atom_site_Cartn_x', 'atom_site_Cartn_y', 'atom_site_Cartn_z']
          : []),
        'atom_site_occupancy',
        ...(includeU ? ['atom_site_U_iso_or_equiv'] : []),
        ...(includeB ? ['atom_site_B_iso_or_equiv'] : [])
      ].map((tag) => ({ name: `_${tag}` })),
      rows
    })
    if (hasErrors(diagnostics)) return { diagnostics }
    const document: CifDocument = {
      version: options.version,
      blocks: [{ name: 'alchemion', entries, saveFrames: [] }]
    }
    const written = writeCifDocument(document, { version: options.version })
    return { ...written, diagnostics: [...diagnostics, ...written.diagnostics] }
  } catch (error) {
    return {
      diagnostics: [
        ...diagnostics,
        {
          severity: 'error',
          code: 'CIF_NUMERIC_OUTPUT',
          message:
            error instanceof Error
              ? error.message
              : 'A scientific value cannot be represented in CIF.'
        }
      ]
    }
  }
}
