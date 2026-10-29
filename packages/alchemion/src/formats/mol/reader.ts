import { createStructureSnapshot, getElement } from '../../core'
import type { MolecularAtom, MolecularStructureSnapshot, SourceBond } from '../../core/types'
import type { Diagnostic } from '../../core/types'
import type { MolParseOptions, ParseResult } from '../contracts'
import { hasErrors } from '../loss'
import {
  bondStereo,
  molecularEndpoint,
  molDiagnostic,
  orderFromNumber,
  parityReferences
} from './common'
import type { MolVersion } from './common'
import isotopeReference from './reference-isotopes.json'

class ParseFailure extends Error {}
type MutableAtom = { -readonly [K in keyof MolecularAtom]: MolecularAtom[K] }
const radicals = ['singlet', 'doublet', 'triplet'] as const
const integerPattern = /^[+-]?\d+$/
const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

class MolReader {
  readonly lines: string[]
  readonly diagnostics: Diagnostic[] = []
  version?: MolVersion
  readonly atoms: MutableAtom[] = []
  readonly bonds: SourceBond[] = []
  readonly bondPairs = new Set<string>()
  readonly atomsByNumber = new Map<number, MutableAtom>()
  readonly numbersById = new Map<string, number>()
  readonly linesById = new Map<string, number>()
  readonly parity = new Map<string, { value: number; line: number }>()
  private nextAtomId = 1
  private nextBondId = 1
  absolute = false
  cursor = 4

  constructor(text: string) {
    this.lines = text.replace(/\r\n?/g, '\n').split('\n')
  }
  fail(code: string, message: string, line: number, field?: string, column = 1): never {
    this.diagnostics.push(
      molDiagnostic(code, message, this.version, field ? { field } : undefined, line, column)
    )
    throw new ParseFailure(message)
  }
  int(
    text: string,
    line: number,
    field: string,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER,
    blank = false
  ): number {
    const value = text.trim()
    if (blank && value === '') return 0
    if (!integerPattern.test(value))
      this.fail('MOL_INTEGER', 'Expected an integer field.', line, field)
    const n = Number(value)
    if (!Number.isSafeInteger(n) || n < minimum || n > maximum)
      this.fail('MOL_INTEGER_RANGE', 'Integer field is outside the supported range.', line, field)
    return n
  }
  number(text: string, line: number, field: string, blank = false): number {
    const value = text.trim()
    if (blank && value === '') return 0
    if (!numberPattern.test(value) || !Number.isFinite(Number(value)))
      this.fail('MOL_NUMBER', 'Expected a finite coordinate.', line, field)
    return Number(value)
  }
  line(index: number): string {
    const line = this.lines[index]
    if (line === undefined)
      this.fail('MOL_TRUNCATED', 'The molfile ends before the declared record.', index + 1)
    return line
  }
  atom(
    number: number,
    element: string,
    coordinates: readonly [number, number, number],
    line: number
  ): MutableAtom {
    if (this.atomsByNumber.has(number))
      this.fail(
        'MOL_ATOM_NUMBER_DUPLICATE',
        'Atom record numbers must be unique.',
        line,
        'atomNumber'
      )
    const isotope = element === 'D' ? 2 : element === 'T' ? 3 : undefined
    if (isotope) element = 'H'
    if (!getElement(element))
      this.fail('MOL_ELEMENT', 'Unknown or unsupported query atom symbol.', line, 'element')
    // File numbers are lookup keys. IDs are minted once, and are never updated by edits/reordering.
    const atom: MutableAtom = {
      id: `mol:atom:${this.nextAtomId++}`,
      element,
      cartesian: coordinates,
      ...(isotope ? { isotope } : {}),
      provenance: { source: 'mol', version: this.version, reference: `atom record ${number}` }
    }
    this.atoms.push(atom)
    this.atomsByNumber.set(number, atom)
    this.numbersById.set(atom.id, number)
    this.linesById.set(atom.id, line)
    return atom
  }
  bond(
    number: number,
    type: number,
    a: number,
    b: number,
    stereo: number,
    line: number,
    numbers: Set<number>
  ): void {
    if (numbers.has(number))
      this.fail(
        'MOL_BOND_NUMBER_DUPLICATE',
        'Bond record numbers must be unique.',
        line,
        'bondNumber'
      )
    numbers.add(number)
    const order = orderFromNumber.get(type)
    if (!order)
      this.fail(
        'MOL_BOND_UNSUPPORTED',
        'Only single, double, triple and aromatic bond types are supported.',
        line,
        'bondType'
      )
    const left = this.atomsByNumber.get(a),
      right = this.atomsByNumber.get(b)
    if (!left || !right)
      this.fail(
        'MOL_BOND_ENDPOINT',
        'Bond endpoint references a missing atom record.',
        line,
        'bondEndpoint'
      )
    if (left === right)
      this.fail(
        'MOL_BOND_SELF',
        'A molecular bond cannot connect an atom to itself.',
        line,
        'bondEndpoint'
      )
    const marker = bondStereo(order, stereo, this.version!)
    if (marker === false)
      this.fail(
        'MOL_STEREO_UNSUPPORTED',
        'The stereo marker is invalid for this bond order.',
        line,
        'stereo'
      )
    const pair = JSON.stringify([left.id, right.id].sort())
    if (this.bondPairs.has(pair))
      this.fail(
        'MOL_BOND_DUPLICATE',
        'Multiple bond records for the same atom pair are unsupported.',
        line,
        'bondEndpoint'
      )
    this.bondPairs.add(pair)
    const id = `mol:bond:${this.nextBondId++}`
    this.linesById.set(id, line)
    this.bonds.push({
      id,
      endpoints: [molecularEndpoint(left.id), molecularEndpoint(right.id)],
      order,
      ...(marker ? { stereo: marker } : {}),
      provenance: { source: 'mol', version: this.version, reference: `bond record ${number}` }
    })
  }
  v2000(): void {
    const count = this.line(3)
    const nAtoms = this.int(count.slice(0, 3), 4, 'atomCount', 0, 999, true)
    const nBonds = this.int(count.slice(3, 6), 4, 'bondCount', 0, 999, true)
    this.absolute = this.int(count.slice(12, 15), 4, 'chiralFlag', 0, 1, true) === 1
    if (this.int(count.slice(6, 9), 4, 'atomLists', 0, 999, true) !== 0)
      this.fail(
        'MOL_QUERY_UNSUPPORTED',
        'Atom lists are outside the declared molecular subset.',
        4,
        'atomLists'
      )
    for (let i = 0; i < nAtoms; i++) {
      const lineNumber = this.cursor + 1,
        line = this.line(this.cursor++)
      if (line.length < 34)
        this.fail(
          'MOL_ATOM_TRUNCATED',
          'A V2000 atom record requires coordinates and an element symbol.',
          lineNumber
        )
      const atom = this.atom(
        i + 1,
        line.slice(31, 34).trim(),
        [
          this.number(line.slice(0, 10), lineNumber, 'x', true),
          this.number(line.slice(10, 20), lineNumber, 'y', true),
          this.number(line.slice(20, 30), lineNumber, 'z', true)
        ],
        lineNumber
      )
      const delta = this.int(line.slice(34, 36), lineNumber, 'massDifference', -3, 4, true)
      if (delta !== 0) {
        const base = (isotopeReference.referenceMassNumbers as Readonly<Record<string, number>>)[
          atom.element
        ]
        if (!base)
          this.fail(
            'MOL_ISOTOPE_REFERENCE',
            'No verified CTfile reference isotope is available for this element.',
            lineNumber,
            'massDifference'
          )
        atom.isotope = base + delta
        if (atom.isotope <= 0)
          this.fail(
            'MOL_ISOTOPE_RANGE',
            'The mass difference resolves to an invalid isotope mass number.',
            lineNumber,
            'massDifference'
          )
      }
      const charge = this.int(line.slice(36, 39), lineNumber, 'chargeCode', 0, 7, true)
      if (charge === 4) atom.radical = 'doublet'
      else if (charge) atom.formalCharge = 4 - charge
      const parity = this.int(line.slice(39, 42), lineNumber, 'atomParity', 0, 3, true)
      if (parity) this.parity.set(atom.id, { value: parity, line: lineNumber })
      const map = this.int(line.slice(60, 63), lineNumber, 'atomMap', 0, 999, true)
      if (map) atom.atomMap = map
      for (const [start, field] of [
        [42, 'hydrogenCount'],
        [45, 'stereoCare'],
        [48, 'valence'],
        [51, 'h0Designator'],
        [63, 'inversionRetention'],
        [66, 'exactChange']
      ] as const)
        if (this.int(line.slice(start, start + 3), lineNumber, field, 0, 999, true) !== 0)
          this.fail(
            'MOL_ATOM_PROPERTY_UNSUPPORTED',
            'An explicit atom property is outside the declared molecular subset.',
            lineNumber,
            field,
            start + 1
          )
      if (line.slice(69).trim())
        this.fail('MOL_ATOM_TRAILING', 'Unexpected trailing atom fields.', lineNumber)
    }
    const numbers = new Set<number>()
    for (let i = 0; i < nBonds; i++) {
      const lineNumber = this.cursor + 1,
        line = this.line(this.cursor++)
      if (line.length < 9)
        this.fail('MOL_BOND_TRUNCATED', 'A V2000 bond record is incomplete.', lineNumber)
      this.bond(
        i + 1,
        this.int(line.slice(6, 9), lineNumber, 'bondType', 1, 10),
        this.int(line.slice(0, 3), lineNumber, 'firstAtom', 1, nAtoms),
        this.int(line.slice(3, 6), lineNumber, 'secondAtom', 1, nAtoms),
        this.int(line.slice(9, 12), lineNumber, 'stereo', 0, 6, true),
        lineNumber,
        numbers
      )
      for (const [start, field] of [
        [15, 'topology'],
        [18, 'reactionCenter']
      ] as const)
        if (this.int(line.slice(start, start + 3), lineNumber, field, 0, 999, true) !== 0)
          this.fail(
            'MOL_BOND_PROPERTY_UNSUPPORTED',
            'Query and reaction bond properties are unsupported.',
            lineNumber,
            field,
            start + 1
          )
      if (line.slice(21).trim())
        this.fail('MOL_BOND_TRAILING', 'Unexpected trailing bond fields.', lineNumber)
    }
    const properties: {
      kind: 'CHG' | 'RAD' | 'ISO'
      atom: MutableAtom
      value: number
      line: number
    }[] = []
    let end = false
    for (; this.cursor < this.lines.length; this.cursor++) {
      const line = this.line(this.cursor),
        lineNumber = this.cursor + 1
      if (/^M {2}END\s*$/.test(line)) {
        this.cursor++
        end = true
        break
      }
      const match = /^M {2}(CHG|RAD|ISO)/.exec(line)
      if (!match)
        this.fail(
          'MOL_RECORD_UNSUPPORTED',
          'Unsupported or malformed CTfile property record.',
          lineNumber,
          line.slice(0, 6).trim()
        )
      const kind = match[1] as 'CHG' | 'RAD' | 'ISO'
      const count = this.int(line.slice(6, 9), lineNumber, 'propertyCount', 1, 8)
      if (line.length < 9 + count * 8 || line.slice(9 + count * 8).trim())
        this.fail(
          'MOL_PROPERTY_COUNT',
          'Property values do not match the declared pair count.',
          lineNumber,
          kind
        )
      for (let j = 0; j < count; j++) {
        const number = this.int(
          line.slice(9 + j * 8, 13 + j * 8),
          lineNumber,
          'atomNumber',
          1,
          nAtoms
        )
        const value = this.int(
          line.slice(13 + j * 8, 17 + j * 8),
          lineNumber,
          kind,
          kind === 'CHG' ? -15 : kind === 'ISO' ? 1 : 0,
          kind === 'CHG' ? 15 : kind === 'RAD' ? 3 : 999
        )
        properties.push({ kind, atom: this.atomsByNumber.get(number)!, value, line: lineNumber })
      }
    }
    if (!end)
      this.fail('MOL_END_MISSING', 'The properties block must end with M  END.', this.cursor + 1)
    if (properties.some((p) => p.kind === 'CHG' || p.kind === 'RAD'))
      for (const atom of this.atoms) {
        delete atom.formalCharge
        delete atom.radical
      }
    if (properties.some((p) => p.kind === 'ISO')) for (const atom of this.atoms) delete atom.isotope
    const seen = new Set<string>()
    for (const property of properties) {
      const key = `${property.kind}:${property.atom.id}`
      if (seen.has(key))
        this.fail(
          'MOL_PROPERTY_DUPLICATE',
          'A chemical property is assigned more than once to the same atom.',
          property.line,
          property.kind
        )
      seen.add(key)
      if (property.kind === 'CHG') property.atom.formalCharge = property.value
      else if (property.kind === 'ISO') property.atom.isotope = property.value
      else if (property.value) property.atom.radical = radicals[property.value - 1]
    }
  }
  logical(): { text: string; line: number } {
    const start = this.cursor + 1
    let text = ''
    while (true) {
      const line = this.line(this.cursor++)
      if (!line.startsWith('M  V30 '))
        this.fail(
          'MOL_V3000_PREFIX',
          'Every V3000 CTAB line requires the M  V30 prefix.',
          this.cursor
        )
      if (line.length > 80)
        this.fail(
          'MOL_V3000_LINE_LENGTH',
          'V3000 physical lines cannot exceed 80 characters.',
          this.cursor
        )
      const payload = line.slice(7)
      const continued = payload.endsWith('-')
      text += continued ? payload.slice(0, -1) : payload
      if (!continued) break
      if (this.cursor >= this.lines.length)
        this.fail('MOL_CONTINUATION', 'Unterminated V3000 continuation.', this.cursor)
    }
    return { text: text.trim(), line: start }
  }
  tokens(text: string, line: number): string[] {
    const tokens: string[] = []
    let value = '',
      quoted = false
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          value += '"'
          i++
        } else quoted = !quoted
      } else if (/\s/.test(char) && !quoted) {
        if (value) {
          tokens.push(value)
          value = ''
        }
      } else value += char
    }
    if (quoted) this.fail('MOL_QUOTE', 'Unterminated V3000 quoted value.', line)
    if (value) tokens.push(value)
    return tokens
  }
  expect(text: string): void {
    const record = this.logical()
    if (record.text !== text)
      this.fail('MOL_V3000_BLOCK', `Expected ${text}.`, record.line, record.text)
  }
  v3000(): void {
    const header = this.line(3)
    if (
      this.int(header.slice(0, 3), 4, 'legacyAtomCount', 0, 999, true) ||
      this.int(header.slice(3, 6), 4, 'legacyBondCount', 0, 999, true)
    )
      this.fail(
        'MOL_V3000_HEADER',
        'V3000 atom and bond counts belong in the CTAB COUNTS record.',
        4
      )
    this.expect('BEGIN CTAB')
    const count = this.logical(),
      counts = this.tokens(count.text, count.line)
    if (counts[0] !== 'COUNTS' || counts.length < 6)
      this.fail(
        'MOL_V3000_COUNTS',
        'A complete COUNTS record must precede the atom block.',
        count.line
      )
    const nAtoms = this.int(counts[1], count.line, 'atomCount'),
      nBonds = this.int(counts[2], count.line, 'bondCount')
    if (
      this.int(counts[3], count.line, 'sgroupCount') ||
      this.int(counts[4], count.line, 'constraintCount')
    )
      this.fail(
        'MOL_CONSTRUCT_UNSUPPORTED',
        'Sgroups and 3D constraints are outside the declared molecular subset.',
        count.line
      )
    this.absolute = this.int(counts[5], count.line, 'chiralFlag', 0, 1) === 1
    if (counts.length > 6)
      this.fail(
        'MOL_COUNTS_PROPERTY_UNSUPPORTED',
        'Additional COUNTS properties are unsupported.',
        count.line
      )
    this.expect('BEGIN ATOM')
    for (let i = 0; i < nAtoms; i++) {
      const record = this.logical(),
        tokens = this.tokens(record.text, record.line)
      if (tokens.length < 6)
        this.fail('MOL_ATOM_COUNT', 'Atom records do not match the declared count.', record.line)
      const atom = this.atom(
        this.int(tokens[0], record.line, 'atomNumber', 1),
        tokens[1],
        [
          this.number(tokens[2], record.line, 'x'),
          this.number(tokens[3], record.line, 'y'),
          this.number(tokens[4], record.line, 'z')
        ],
        record.line
      )
      const map = this.int(tokens[5], record.line, 'atomMap')
      if (map) atom.atomMap = map
      const seen = new Set<string>()
      for (const token of tokens.slice(6)) {
        const match = /^(CHG|RAD|MASS|CFG)=([^=]+)$/.exec(token)
        if (!match)
          this.fail(
            'MOL_ATOM_PROPERTY_UNSUPPORTED',
            'Unsupported V3000 atom property.',
            record.line,
            token
          )
        if (seen.has(match[1]))
          this.fail(
            'MOL_PROPERTY_DUPLICATE',
            'V3000 atom properties must be unique.',
            record.line,
            match[1]
          )
        seen.add(match[1])
        if (match[1] === 'CHG') atom.formalCharge = this.int(match[2], record.line, 'CHG', -15, 15)
        if (match[1] === 'MASS') atom.isotope = this.int(match[2], record.line, 'MASS', 1)
        if (match[1] === 'RAD') {
          const value = this.int(match[2], record.line, 'RAD', 0, 3)
          if (value) atom.radical = radicals[value - 1]
        }
        if (match[1] === 'CFG') {
          const value = this.int(match[2], record.line, 'CFG', 0, 3)
          if (value) this.parity.set(atom.id, { value, line: record.line })
        }
      }
    }
    this.expect('END ATOM')
    const next = this.logical()
    if (next.text === 'BEGIN BOND') {
      const numbers = new Set<number>()
      for (let i = 0; i < nBonds; i++) {
        const record = this.logical(),
          tokens = this.tokens(record.text, record.line)
        if (tokens.length < 4)
          this.fail('MOL_BOND_COUNT', 'Bond records do not match the declared count.', record.line)
        let stereo = 0
        if (tokens.length > 4) {
          if (tokens.length !== 5 || !/^CFG=\d+$/.test(tokens[4]))
            this.fail(
              'MOL_BOND_PROPERTY_UNSUPPORTED',
              'Only basic CFG bond properties are supported.',
              record.line
            )
          stereo = this.int(tokens[4].slice(4), record.line, 'CFG', 0, 3)
        }
        this.bond(
          this.int(tokens[0], record.line, 'bondNumber', 1),
          this.int(tokens[1], record.line, 'bondType', 1, 10),
          this.int(tokens[2], record.line, 'firstAtom', 1),
          this.int(tokens[3], record.line, 'secondAtom', 1),
          stereo,
          record.line,
          numbers
        )
      }
      this.expect('END BOND')
      this.expect('END CTAB')
    } else if (nBonds || next.text !== 'END CTAB') {
      this.fail(
        'MOL_V3000_BLOCK_UNSUPPORTED',
        'Expected the declared bond block and END CTAB; other scientific blocks are unsupported.',
        next.line,
        next.text
      )
    }
    if (!/^M {2}END\s*$/.test(this.line(this.cursor++)))
      this.fail('MOL_END_MISSING', 'The molfile must end with M  END.', this.cursor)
  }
  read(): ParseResult {
    try {
      if (this.lines.length < 4)
        this.fail(
          'MOL_HEADER',
          'A molfile requires three header lines and a versioned counts line.',
          1
        )
      const match = /\b(V2000|V3000)\s*$/.exec(this.line(3))
      if (!match)
        this.fail(
          'MOL_VERSION',
          'The counts line must explicitly identify V2000 or V3000.',
          4,
          'version'
        )
      this.version = match[1] as MolVersion
      if (this.version === 'V2000') this.v2000()
      else this.v3000()
      if (this.lines.slice(this.cursor).some((line) => line.trim()))
        this.fail(
          'MOL_TRAILING_STRUCTURE',
          'Only a single molfile is supported; trailing records are not silently discarded.',
          this.cursor + 1
        )
      const elements = new Map(this.atoms.map((atom) => [atom.id, atom.element]))
      for (const [atomId, parity] of this.parity) {
        const references = parityReferences(atomId, this.bonds, this.numbersById, elements)
        if (references.length !== 4 || new Set(references).size !== 4)
          this.fail(
            'MOL_PARITY_UNSUPPORTED',
            'Atom parity requires four distinct tetrahedral references, including at most one implicit hydrogen.',
            parity.line,
            'CFG'
          )
        this.atomsByNumber.get(this.numbersById.get(atomId)!)!.stereoParity = {
          parity: parity.value === 1 ? 'odd' : parity.value === 2 ? 'even' : 'either',
          referenceAtoms: references
        }
      }
      const snapshot: MolecularStructureSnapshot = {
        kind: 'molecular',
        title: this.lines[0],
        atoms: this.atoms,
        bonds: this.bonds,
        stereoAbsolute: this.absolute,
        metadata: {
          alchemionFormats: {
            schemaVersion: 1,
            sourceFormat: 'mol',
            version: this.version,
            losses: []
          },
          alchemionMol: { header: this.lines[1], comment: this.lines[2] }
        }
      }
      const result = createStructureSnapshot(snapshot)
      this.diagnostics.push(
        ...result.diagnostics.map((d) => {
          const id = d.context?.atomId ?? d.context?.bondId
          const line = typeof id === 'string' ? this.linesById.get(id) : undefined
          return {
            ...d,
            context: { format: 'mol', version: this.version!, ...d.context },
            ...(!d.sourceLocation && line !== undefined
              ? { sourceLocation: { line, column: 1 } }
              : {})
          }
        })
      )
      if (!result.ok || hasErrors(this.diagnostics)) return { diagnostics: this.diagnostics }
      return { structure: result.value, diagnostics: this.diagnostics }
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error
      return { diagnostics: this.diagnostics }
    }
  }
}

export function parseMolStructure(text: string, options?: MolParseOptions): ParseResult {
  if (typeof text !== 'string')
    return { diagnostics: [molDiagnostic('MOL_INPUT', 'Molfile input must be text.')] }
  if (options && options.format !== 'mol')
    return { diagnostics: [molDiagnostic('MOL_OPTIONS', 'MOL parser requires format mol.')] }
  return new MolReader(text).read()
}
