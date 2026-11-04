import type {
  Diagnostic,
  JsonValue,
  MolecularAtom,
  SourceBond,
  StructureSnapshot
} from '../../core/types'
import type { MolWriteOptions, WriteResult } from '../contracts'
import { hasErrors, inheritedLossDiagnostics, lossDiagnostic } from '../loss'
import { molDiagnostic, orderNumber, parityReferences, permutationIsOdd } from './common'
import type { MolVersion } from './common'
import { asMolecularSnapshot, finiteMolecule } from './finite'

const radicalNumber = { singlet: 1, doublet: 2, triplet: 3 } as const
const annotation = (
  metadata: Readonly<Record<string, JsonValue>> | undefined
): { header?: string; comment?: string } => {
  const value = metadata?.alchemionMol
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Readonly<Record<string, JsonValue>>
  return {
    ...(typeof record.header === 'string' ? { header: record.header } : {}),
    ...(typeof record.comment === 'string' ? { comment: record.comment } : {})
  }
}
const numberText = (value: number): string => (Object.is(value, -0) ? '0' : String(value))
const field = (value: number, width = 3): string => String(value).padStart(width)

function v3000Lines(payload: string): string[] {
  const lines: string[] = []
  // Continuations concatenate exactly: do not inject a space into a split number or quoted token.
  while (payload.length > 73) {
    lines.push(`M  V30 ${payload.slice(0, 72)}-`)
    payload = payload.slice(72)
  }
  lines.push(`M  V30 ${payload}`)
  return lines
}

/** Supported CTfile markers only; cis/trans is not a wedge/hash code. */
function stereoNumber(bond: SourceBond, version: MolVersion): number | undefined {
  if (!bond.stereo) return 0
  if (bond.order === 'single') {
    if (bond.stereo === 'up') return 1
    if (bond.stereo === 'down') return version === 'V2000' ? 6 : 3
    if (bond.stereo === 'either') return version === 'V2000' ? 4 : 2
  }
  if (bond.order === 'double' && bond.stereo === 'either') return version === 'V2000' ? 3 : 2
  return undefined
}

export function writeMolStructure(
  snapshot: StructureSnapshot,
  options: MolWriteOptions
): WriteResult {
  const version = options.version ?? 'V3000',
    allowLoss = options.allowLoss === true
  if (version !== 'V2000' && version !== 'V3000')
    return {
      diagnostics: [molDiagnostic('MOL_VERSION', 'MOL output version must be V2000 or V3000.')]
    }
  const finite = finiteMolecule(snapshot, options.finite, allowLoss)
  const diagnostics: Diagnostic[] = [...finite.diagnostics]
  if (hasErrors(diagnostics)) return { diagnostics }
  diagnostics.push(...inheritedLossDiagnostics(snapshot, allowLoss, 'mol'))
  const molecule = asMolecularSnapshot(snapshot, finite)
  const loss = (code: string, message: string, context?: Diagnostic['context']) =>
    diagnostics.push(
      lossDiagnostic(code, message, allowLoss, { format: 'mol', version, ...context })
    )
  const hard = (code: string, message: string, context?: Diagnostic['context']) =>
    diagnostics.push(molDiagnostic(code, message, version, context))
  if (
    snapshot.metadata?.alchemionModeling &&
    typeof snapshot.metadata.alchemionModeling === 'object' &&
    'kind' in snapshot.metadata.alchemionModeling &&
    snapshot.metadata.alchemionModeling.kind === 'polymer'
  )
    loss(
      'MOL_POLYMER_RECIPE_LOSS',
      'Molfile stores the expanded structure without its polymer recipe.'
    )
  if (version === 'V2000' && (molecule.atoms.length > 999 || molecule.bonds.length > 999))
    hard('MOL_V2000_COUNT_LIMIT', 'V2000 cannot represent more than 999 atoms or 999 bonds.')
  const atomNumbers = new Map(molecule.atoms.map((atom, i) => [atom.id, i + 1]))
  const elements = new Map(molecule.atoms.map((atom) => [atom.id, atom.element]))
  const atomParities = new Map<string, number>()
  const coordinates = new Map<string, readonly string[]>()
  for (const atom of molecule.atoms) {
    const context = { atomId: atom.id }
    if (atom.label !== undefined)
      loss(
        'MOL_ATOM_LABEL_LOSS',
        'Atom labels cannot be represented in the declared basic molfile subset.',
        context
      )
    if (atom.occupancy && (atom.occupancy.kind !== 'known' || atom.occupancy.value !== 1))
      loss(
        'MOL_OCCUPANCY_LOSS',
        'Molfile cannot represent partial, unknown or not-applicable occupancy.',
        context
      )
    if (atom.occupancy?.kind === 'known' && atom.occupancy.standardUncertainty !== undefined)
      loss(
        'MOL_OCCUPANCY_UNCERTAINTY_LOSS',
        'Molfile cannot represent occupancy uncertainty.',
        context
      )
    for (const [property, code] of [
      ['oxidationState', 'MOL_OXIDATION_LOSS'],
      ['displacementU', 'MOL_DISPLACEMENT_LOSS'],
      ['coordinateUncertainties', 'MOL_COORDINATE_UNCERTAINTY_LOSS']
    ] as const)
      if (atom[property] !== undefined) loss(code, `Molfile cannot represent ${property}.`, context)
    if (atom.formalCharge !== undefined && Math.abs(atom.formalCharge) > 15)
      hard(
        'MOL_CHARGE_RANGE',
        'The declared CTfile subset supports formal charges from -15 through +15.',
        context
      )
    if (version === 'V2000' && atom.atomMap !== undefined && atom.atomMap > 999)
      hard('MOL_V2000_ATOM_MAP_LIMIT', 'V2000 atom mapping must fit a three-column field.', context)
    if (version === 'V2000' && atom.isotope !== undefined && atom.isotope > 999)
      hard(
        'MOL_V2000_ISOTOPE_LIMIT',
        'V2000 isotope mass numbers must fit a three-column field.',
        context
      )
    if (atom.stereoParity) {
      const references = parityReferences(atom.id, molecule.bonds, atomNumbers, elements)
      if (
        references.length !== 4 ||
        atom.stereoParity.referenceAtoms.length !== 4 ||
        references.some((id) => !atom.stereoParity!.referenceAtoms.includes(id))
      )
        hard(
          'MOL_PARITY_REFERENCES',
          'Atom parity references do not match the tetrahedral molecular neighbors.',
          context
        )
      else {
        let parity =
          atom.stereoParity.parity === 'odd' ? 1 : atom.stereoParity.parity === 'even' ? 2 : 3
        if (parity !== 3 && permutationIsOdd(atom.stereoParity.referenceAtoms, references))
          parity = 3 - parity
        atomParities.set(atom.id, parity)
      }
    }
    if (version === 'V2000') {
      const values = atom.cartesian.map((x) => x.toFixed(4))
      if (values.some((x) => x.length > 10))
        hard(
          'MOL_V2000_COORDINATE_LIMIT',
          'V2000 coordinate magnitude exceeds its fixed-width representation.',
          context
        )
      else if (
        values.some(
          (x, i) =>
            Math.abs(Number(x) - atom.cartesian[i]) > 1e-9 + 1e-10 * Math.abs(atom.cartesian[i])
        )
      )
        loss(
          'MOL_V2000_COORDINATE_PRECISION_LOSS',
          'V2000 coordinates require rounding to four decimal places.',
          context
        )
      coordinates.set(
        atom.id,
        values.map((x) => x.padStart(10))
      )
    } else coordinates.set(atom.id, atom.cartesian.map(numberText))
  }
  const markers = new Map<string, number>(),
    pairs = new Set<string>()
  for (const bond of molecule.bonds) {
    const pair = JSON.stringify(bond.endpoints.map((e) => e.sourceAtomId).sort())
    if (pairs.has(pair))
      hard(
        'MOL_DUPLICATE_BOND',
        'Multiple source bonds for the same molecular atom pair cannot be written.',
        { bondId: bond.id }
      )
    pairs.add(pair)
    const marker = stereoNumber(bond, version)
    if (marker === undefined) {
      loss(
        'MOL_BOND_STEREO_LOSS',
        'This bond stereo property has no equivalent basic CTfile marker.',
        { bondId: bond.id }
      )
      markers.set(bond.id, 0)
    } else markers.set(bond.id, marker)
  }
  const annotations = annotation(snapshot.metadata)
  const oneLine = (text: string, label: string): string => {
    if (/[\r\n]/.test(text))
      diagnostics.push({
        severity: 'warning',
        code: 'MOL_ANNOTATION_LINES_LOSS',
        message: `Only the first line of ${label} can be represented in a molfile header.`,
        context: { format: 'mol', version, field: label }
      })
    return text.split(/\r\n?|\n/)[0]
  }
  const header =
    annotations.header === undefined
      ? `${'  Alchemion'.padEnd(20)}${molecule.atoms.every((a) => a.cartesian[2] === 0) ? '2D' : '3D'}`
      : oneLine(annotations.header, 'program header')
  const lines = [
    oneLine(molecule.title ?? '', 'title'),
    header,
    oneLine(annotations.comment ?? '', 'comment')
  ]
  if (hasErrors(diagnostics)) return { diagnostics }
  if (version === 'V3000') {
    lines.push('  0  0  0     0  0            999 V3000')
    const payloads = [
      'BEGIN CTAB',
      `COUNTS ${molecule.atoms.length} ${molecule.bonds.length} 0 0 ${Number(molecule.stereoAbsolute === true)}`,
      'BEGIN ATOM'
    ]
    molecule.atoms.forEach((atom, i) => {
      let payload = `${i + 1} ${atom.element} ${coordinates.get(atom.id)!.join(' ')} ${atom.atomMap ?? 0}`
      if (atom.formalCharge) payload += ` CHG=${atom.formalCharge}`
      if (atom.isotope !== undefined) payload += ` MASS=${atom.isotope}`
      if (atom.radical) payload += ` RAD=${radicalNumber[atom.radical]}`
      if (atomParities.has(atom.id)) payload += ` CFG=${atomParities.get(atom.id)}`
      payloads.push(payload)
    })
    payloads.push('END ATOM')
    if (molecule.bonds.length) {
      payloads.push('BEGIN BOND')
      molecule.bonds.forEach((bond, i) => {
        let payload = `${i + 1} ${orderNumber(bond.order)} ${atomNumbers.get(bond.endpoints[0].sourceAtomId)} ${atomNumbers.get(bond.endpoints[1].sourceAtomId)}`
        if (markers.get(bond.id)) payload += ` CFG=${markers.get(bond.id)}`
        payloads.push(payload)
      })
      payloads.push('END BOND')
    }
    payloads.push('END CTAB')
    lines.push(...payloads.flatMap(v3000Lines), 'M  END')
  } else {
    lines.push(
      `${field(molecule.atoms.length)}${field(molecule.bonds.length)}  0  0${field(Number(molecule.stereoAbsolute === true))}  0  0  0  0  0999 V2000`
    )
    for (const atom of molecule.atoms) {
      lines.push(
        `${coordinates.get(atom.id)!.join('')} ${atom.element.padEnd(3)} 0  0${field(atomParities.get(atom.id) ?? 0)}  0  0  0  0  0  0${field(atom.atomMap ?? 0)}  0  0`
      )
    }
    for (const bond of molecule.bonds) {
      lines.push(
        `${field(atomNumbers.get(bond.endpoints[0].sourceAtomId)!)}${field(atomNumbers.get(bond.endpoints[1].sourceAtomId)!)}${field(orderNumber(bond.order))}${field(markers.get(bond.id)!)}  0  0  0`
      )
    }
    const properties: readonly [string, (atom: MolecularAtom) => number | undefined][] = [
      ['CHG', (atom) => atom.formalCharge || undefined],
      ['RAD', (atom) => (atom.radical ? radicalNumber[atom.radical] : undefined)],
      ['ISO', (atom) => atom.isotope]
    ]
    for (const [name, read] of properties) {
      const entries = molecule.atoms.flatMap((atom, i) => {
        const value = read(atom)
        return value === undefined ? [] : [[i + 1, value] as const]
      })
      for (let i = 0; i < entries.length; i += 8) {
        const chunk = entries.slice(i, i + 8)
        lines.push(
          `M  ${name}${field(chunk.length)}${chunk.map(([n, value]) => `${field(n, 4)}${field(value, 4)}`).join('')}`
        )
      }
    }
    lines.push('M  END')
  }
  return { text: `${lines.join('\n')}\n`, diagnostics, atomMapping: finite.atomMapping }
}
