import { CALCULATION_LIMITS, type ResultFrame } from '../../core/calculation'
import type { PeriodicAtom } from '../../core/types'
import { parsePoscarGeometry } from '../poscar/reader'
import { ResultLines, type ParsedCalculation, vector, words } from './common'

export function parseXdatcar(text: string): ParsedCalculation {
  const input = new ResultLines(text)
  const head = Array.from({ length: 7 }, () => input.next())
  const configuration = /^\s*Direct\s+configuration\s*=\s*(\d+)\s*$/i
  const first = configuration.exec(input.nonempty() ?? '')
  if (!first || !Number.isSafeInteger(Number(first[1])))
    return input.fail('RESULT_XDATCAR_FRAME', 'Expected a numbered Direct configuration.')
  const geometry = [...head, 'Direct']
  let index = 0
  const initial = parsePoscarGeometry(
    () => (index < geometry.length ? geometry[index++] : input.next()),
    CALCULATION_LIMITS.atomFrames
  )
  const structure = initial.structure
  if (!structure) return { frames: [], data: [], diagnostics: initial.diagnostics }
  const frames: ResultFrame[] = [
    { id: `step:${Number(first[1])}`, structure, step: Number(first[1]) }
  ]
  const atoms = structure.atoms
  let line: string | undefined
  while ((line = input.nonempty()) !== undefined) {
    const match = configuration.exec(line)
    const step = Number(match?.[1])
    if (!Number.isSafeInteger(step) || step <= frames[frames.length - 1].step!)
      return input.fail(
        'RESULT_XDATCAR_FRAME',
        'Configuration numbers must increase in a fixed-cell XDATCAR.'
      )
    if (
      frames.length >= CALCULATION_LIMITS.frames ||
      (frames.length + 1) * atoms.length > CALCULATION_LIMITS.atomFrames
    )
      return input.fail(
        'RESULT_TRAJECTORY_BUDGET',
        'The trajectory exceeds the frame or atom-frame budget.'
      )
    const coordinates: PeriodicAtom[] = []
    for (const atom of atoms) {
      const fractional = vector(words(input.next() ?? ''))
      if (!fractional)
        return input.fail(
          'RESULT_XDATCAR_POSITION',
          'Expected a finite Direct coordinate for every atom.'
        )
      coordinates.push({ ...atom, fractional })
    }
    frames.push({ id: `step:${step}`, step, structure: { ...structure, atoms: coordinates } })
  }
  return { frames, data: [], program: { name: 'VASP' }, diagnostics: initial.diagnostics }
}
