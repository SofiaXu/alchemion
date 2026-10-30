import { validateStructure } from '../../core'
import type { Diagnostic, StructureSnapshot } from '../../core/types'
import type { PoscarWriteOptions, WriteResult } from '../contracts'
import { hasErrors, inheritedLossDiagnostics, lossDiagnostic } from '../loss'

export { parsePoscarStructure } from './reader'

export function writePoscarStructure(
  snapshot: StructureSnapshot,
  options: PoscarWriteOptions
): WriteResult {
  const diagnostics: Diagnostic[] = [...validateStructure(snapshot)]
  if (hasErrors(diagnostics)) return { diagnostics }
  const hard = (code: string, message: string, context?: Diagnostic['context']) =>
    diagnostics.push({
      severity: 'error',
      code,
      message,
      context: { format: 'poscar', ...context }
    })
  if (snapshot.kind !== 'periodic') {
    hard(
      'POSCAR_PERIODIC_REQUIRED',
      'POSCAR output requires a periodic structure with a valid cell.'
    )
    return { diagnostics }
  }
  if (snapshot.atoms.length === 0)
    hard('POSCAR_EMPTY', 'An empty structure cannot be exported as POSCAR.')
  for (const atom of snapshot.atoms)
    if (
      atom.occupancy !== undefined &&
      (atom.occupancy.kind !== 'known' || atom.occupancy.value !== 1)
    )
      hard('POSCAR_OCCUPANCY', 'POSCAR requires a known full occupancy for every source atom.', {
        atomId: atom.id
      })
  if (hasErrors(diagnostics)) return { diagnostics }
  const allowLoss = options.allowLoss === true
  diagnostics.push(...inheritedLossDiagnostics(snapshot, allowLoss, 'poscar'))
  const loss = (code: string, message: string, context?: Diagnostic['context']) =>
    diagnostics.push(lossDiagnostic(code, message, allowLoss, { format: 'poscar', ...context }))
  if (snapshot.symmetry !== undefined)
    loss(
      'POSCAR_SYMMETRY_LOSS',
      'POSCAR does not record the explicit symmetry or space-group identity of the source.'
    )
  if (snapshot.cell.parameterUncertainties !== undefined)
    loss('POSCAR_CELL_UNCERTAINTY_LOSS', 'POSCAR cannot record cell parameter uncertainties.')
  for (const bond of snapshot.bonds)
    loss('POSCAR_BOND_LOSS', 'POSCAR cannot record explicit source bonds.', { bondId: bond.id })
  for (const atom of snapshot.atoms) {
    for (const [property, code] of [
      ['label', 'POSCAR_LABEL_LOSS'],
      ['isotope', 'POSCAR_ISOTOPE_LOSS'],
      ['formalCharge', 'POSCAR_CHARGE_LOSS'],
      ['oxidationState', 'POSCAR_OXIDATION_LOSS'],
      ['radical', 'POSCAR_RADICAL_LOSS'],
      ['atomMap', 'POSCAR_ATOM_MAP_LOSS'],
      ['displacementU', 'POSCAR_DISPLACEMENT_LOSS'],
      ['coordinateUncertainties', 'POSCAR_COORDINATE_UNCERTAINTY_LOSS'],
      ['stereoParity', 'POSCAR_PARITY_LOSS']
    ] as const)
      if (atom[property] !== undefined)
        loss(code, `POSCAR cannot record the source atom's ${property}.`, { atomId: atom.id })
    if (atom.occupancy?.kind === 'known' && atom.occupancy.standardUncertainty !== undefined)
      loss(
        'POSCAR_OCCUPANCY_UNCERTAINTY_LOSS',
        'POSCAR cannot record occupancy measurement uncertainty.',
        { atomId: atom.id }
      )
  }
  const rawTitle = snapshot.title ?? 'Alchemion'
  const title = rawTitle.split(/\r\n?|\n/)[0].slice(0, 40)
  if (title !== rawTitle)
    diagnostics.push({
      severity: 'warning',
      code: 'POSCAR_TITLE_TRUNCATED',
      message: 'The POSCAR comment is limited to one line of forty characters.',
      context: { format: 'poscar' }
    })
  const metadata = snapshot.metadata?.alchemionMol
  if (metadata && typeof metadata === 'object')
    diagnostics.push({
      severity: 'warning',
      code: 'POSCAR_COMMENT_LOSS',
      message: 'Molecular header annotations are omitted from POSCAR.',
      context: { format: 'poscar' }
    })
  if (hasErrors(diagnostics)) return { diagnostics }
  const groups = new Map<string, (typeof snapshot.atoms)[number][]>()
  for (const atom of snapshot.atoms) {
    const group = groups.get(atom.element)
    if (group) group.push(atom)
    else groups.set(atom.element, [atom])
  }
  const lines = [
    title,
    '1.0',
    ...snapshot.cell.basis.map((vector) => vector.map(String).join(' ')),
    [...groups.keys()].join(' '),
    [...groups.values()].map((atoms) => atoms.length).join(' '),
    'Direct'
  ]
  for (const atoms of groups.values())
    for (const atom of atoms) lines.push(atom.fractional.map(String).join(' '))
  return { text: `${lines.join('\n')}\n`, diagnostics }
}
