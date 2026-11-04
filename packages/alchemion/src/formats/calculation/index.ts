import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import {
  CALCULATION_LIMITS,
  validateCalculationResult,
  type CalculationResult,
  type CalculationSource,
  type ResultFrame
} from '../../core/calculation'
import { norm, subtract } from '../../core/math'
import { failure, failureFrom, success } from '../../core/result'
import { validateStructure } from '../../core/structure'
import type { Diagnostic, PeriodicStructureSnapshot, ScientificResult } from '../../core/types'
import { parsePoscarStructure } from '../poscar/reader'
import {
  CalculationParseError,
  type CalculationParseOptions,
  type ParsedCalculation
} from './common'
import { parseOutcar } from './outcar'
import { parseXdatcar } from './trajectory'
import { parseVasprun } from './vasprun'
import { parseCube, parseVaspGrid } from './volumetric'

export type { CalculationParseOptions } from './common'

const formats = new Set([
  'chg',
  'chgcar',
  'locpot',
  'cube',
  'contcar',
  'xdatcar',
  'vasprun',
  'outcar',
  'alchemion-result'
])

function textDigest(text: string, override?: string): string {
  if (text.length > CALCULATION_LIMITS.fileBytes)
    throw new CalculationParseError('RESULT_FILE_BUDGET', 'The file exceeds the byte budget.', 1)
  const hash = sha256.create()
  let size = 0
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(text.length, offset + 65_536)
    const last = text.charCodeAt(end - 1)
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end++
    const bytes = utf8ToBytes(text.slice(offset, end))
    size += bytes.length
    if (size > CALCULATION_LIMITS.fileBytes)
      throw new CalculationParseError('RESULT_FILE_BUDGET', 'The file exceeds the byte budget.', 1)
    if (!override) hash.update(bytes)
    offset = end
  }
  return override ?? bytesToHex(hash.digest())
}

function parseNative(text: string, options: CalculationParseOptions): ParsedCalculation {
  switch (options.format) {
    case 'chg':
    case 'chgcar':
    case 'locpot':
      return parseVaspGrid(text, options.format)
    case 'cube':
      return parseCube(text, options)
    case 'xdatcar':
      return parseXdatcar(text)
    case 'vasprun':
      return parseVasprun(text, options)
    case 'outcar':
      return parseOutcar(text, options)
    case 'contcar': {
      const parsed = parsePoscarStructure(text, CALCULATION_LIMITS.atomFrames)
      return {
        frames: parsed.structure ? [{ id: 'structure', structure: parsed.structure }] : [],
        data: [],
        program: { name: 'VASP' },
        diagnostics: parsed.diagnostics
      }
    }
    default:
      throw new CalculationParseError('RESULT_FORMAT', 'Unsupported native result format.', 1)
  }
}

/** Parse the explicitly selected local calculation output without browser globals or engine state. */
export function parseCalculationResult(
  text: string,
  options: CalculationParseOptions
): ScientificResult<CalculationResult> {
  if (
    typeof text !== 'string' ||
    !options ||
    !formats.has(options.format) ||
    (options.name !== undefined && (typeof options.name !== 'string' || !options.name.trim())) ||
    (options.quantity !== undefined && typeof options.quantity !== 'string') ||
    (options.unit !== undefined && typeof options.unit !== 'string') ||
    (options.sha256 !== undefined &&
      (typeof options.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(options.sha256)))
  )
    return failure(
      'RESULT_PARSE_OPTIONS',
      'Provide text, an explicit result format and valid optional source metadata.'
    )
  const { format, name = format } = options
  if (
    options.reference !== undefined &&
    validateStructure(options.reference).some((item) => item.severity === 'error')
  )
    return failure(
      'RESULT_PARSE_OPTIONS',
      'The optional reference must be a valid structure snapshot.',
      { format, file: name }
    )
  try {
    const digest = textDigest(text, options.sha256)
    const source = { name, format, sha256: digest }
    if (format === 'alchemion-result') {
      let input: unknown
      try {
        input = JSON.parse(text.replace(/^\uFEFF/, ''))
      } catch {
        throw new CalculationParseError('RESULT_JSON', 'Malformed calculation result JSON.', 1)
      }
      const validated = validateCalculationResult(input)
      return validated.ok
        ? success(
            Object.freeze({
              ...validated.value,
              sources: Object.freeze([
                ...validated.value.sources.filter((entry) => entry.sha256 !== digest),
                Object.freeze(source)
              ])
            }),
            validated.diagnostics
          )
        : validated
    }
    const { diagnostics = [], ...native } = parseNative(text, options)
    const locate = (item: (typeof diagnostics)[number]) => ({
      ...item,
      context: { ...item.context, format, file: name }
    })
    if (diagnostics.some(({ severity }) => severity === 'error'))
      return failureFrom(diagnostics.map(locate))
    const result = validateCalculationResult({
      version: 1,
      id: `result:${digest}`,
      sources: [source],
      termination: 'unknown',
      convergence: 'unknown',
      ...native
    })
    return result.ok
      ? success(result.value, [...diagnostics.map(locate), ...result.diagnostics.map(locate)])
      : failureFrom(result.diagnostics.map(locate))
  } catch (error) {
    if (!(error instanceof CalculationParseError)) throw error
    return failureFrom([
      {
        severity: 'error',
        code: error.code,
        message: error.message,
        context: { format, file: name },
        sourceLocation: { line: error.line, column: 1 }
      }
    ])
  }
}

export interface NebImageInput {
  readonly image: number
  readonly text: string
  readonly name?: string
  /** Free energy TOTEN, when independently available for this geometry. */
  readonly energyEv?: number
}

/** Assemble explicitly numbered local VASP NEB image geometry files and optional energies. */
export function parseNebImages(
  images: readonly NebImageInput[]
): ScientificResult<CalculationResult> {
  if (
    !Array.isArray(images) ||
    images.length < 2 ||
    images.length > CALCULATION_LIMITS.frames ||
    images.some(
      (image) =>
        !image ||
        !Number.isSafeInteger(image.image) ||
        image.image < 0 ||
        typeof image.text !== 'string' ||
        (image.energyEv !== undefined && !Number.isFinite(image.energyEv))
    )
  )
    return failure(
      'RESULT_NEB_INPUT',
      'Provide at least two explicitly numbered image geometry files and optional finite energies.'
    )
  if (images.reduce((sum, image) => sum + image.text.length, 0) > CALCULATION_LIMITS.resultBytes)
    return failure('RESULT_NEB_BUDGET', 'The combined image input exceeds the budget.')
  const ordered = [...images].sort((a, b) => a.image - b.image)
  if (ordered.some((image, index) => index > 0 && ordered[index - 1].image === image.image))
    return failure('RESULT_NEB_INPUT', 'NEB image numbers must be unique.')
  const frames: ResultFrame[] = []
  const sources: CalculationSource[] = []
  const diagnostics: Diagnostic[] = []
  let first: PeriodicStructureSnapshot | undefined
  let atomFrames = 0
  for (const image of ordered) {
    const name = image.name ?? `image ${image.image}`
    const parsed = parseCalculationResult(image.text, { format: 'contcar', name })
    if (!parsed.ok) return parsed
    diagnostics.push(...parsed.diagnostics)
    const structure = parsed.value.frames[0].structure
    if (structure.kind !== 'periodic')
      return failure('RESULT_NEB_GEOMETRY', 'NEB image geometry must be periodic.')
    if (
      first &&
      (structure.atoms.length !== first.atoms.length ||
        structure.atoms.some((atom, index) => atom.element !== first!.atoms[index].element) ||
        structure.cell.basis.some(
          (axis, index) => norm(subtract(axis, first!.cell.basis[index])) > 1e-5
        ))
    )
      return failure(
        'RESULT_NEB_GEOMETRY',
        'NEB images must share the same file atom order and fixed cell.',
        { file: name, image: image.image }
      )
    first ??= structure
    atomFrames += structure.atoms.length
    if (atomFrames > CALCULATION_LIMITS.atomFrames)
      return failure('RESULT_NEB_BUDGET', 'The image structures exceed the atom-frame budget.', {
        file: name,
        image: image.image
      })
    frames.push({
      id: `image:${image.image}`,
      image: image.image,
      structure,
      ...(image.energyEv === undefined
        ? {}
        : { energyEv: image.energyEv, energyKind: 'VASP free energy (TOTEN)' })
    })
    sources.push(parsed.value.sources[0])
  }
  const digest = textDigest(
    JSON.stringify(ordered.map(({ image, energyEv }, i) => [image, sources[i].sha256, energyEv]))
  )
  const result = validateCalculationResult({
    version: 1,
    id: `neb:${digest}`,
    sources,
    program: { name: 'VASP' },
    termination: 'unknown',
    convergence: 'unknown',
    frames,
    data: [],
    ...(ordered[0].image === 0 ? { initialFrameId: 'image:0' } : {})
  })
  return result.ok ? success(result.value, [...diagnostics, ...result.diagnostics]) : result
}
