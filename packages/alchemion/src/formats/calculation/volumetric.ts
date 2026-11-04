import { CALCULATION_LIMITS, type CalculationData } from '../../core/calculation'
import { cellVolume } from '../../core/cell'
import { ELEMENTS } from '../../core/data'
import { scale } from '../../core/math'
import { createStructureSnapshot } from '../../core/structure'
import type { Matrix3, MolecularAtom, Vec3 } from '../../core/types'
import { parsePoscarGeometry } from '../poscar/reader'
import {
  ResultLines,
  type CalculationParseOptions,
  type ParsedCalculation,
  vaspNumber,
  vector,
  words
} from './common'

function dimensions(line: string, input: ResultLines): Vec3 {
  const dims = vector(words(line))
  if (!dims || dims.some((size) => !Number.isSafeInteger(size) || size < 2))
    return input.fail(
      'RESULT_GRID_DIMENSIONS',
      'Provide three integer grid dimensions of at least two samples.'
    )
  return dims
}

function gridSize(dims: Vec3, input: ResultLines): number {
  const size = dims[0] * dims[1] * dims[2]
  if (size > CALCULATION_LIMITS.gridSamples)
    return input.fail('RESULT_GRID_BUDGET', 'The grid exceeds the sample budget.')
  return size
}

/** Stop exactly at the stated record length. A following block starts on a fresh line. */
function readSamples(
  input: ResultLines,
  count: number,
  consume?: (value: number, index: number) => void
) {
  let index = 0
  while (index < count) {
    const line = input.nonempty()
    if (line === undefined)
      input.fail(
        'RESULT_GRID_TRUNCATED',
        'A grid or augmentation block ended before its declared length.'
      )
    for (const token of line.matchAll(/\S+/g)) {
      const value = vaspNumber(token[0])
      if (index === count || !Number.isFinite(value))
        input.fail(
          'RESULT_GRID_RECORD',
          'Expected a finite grid sample within the declared record length.'
        )
      consume?.(value, index)
      index++
    }
  }
}

const origin: Vec3 = [0, 0, 0]

export function parseVaspGrid(
  text: string,
  format: 'chg' | 'chgcar' | 'locpot'
): ParsedCalculation {
  const input = new ResultLines(text)
  const header = parsePoscarGeometry(() => input.next(), CALCULATION_LIMITS.atomFrames)
  const structure = header.structure
  if (!structure) return { frames: [], data: [], diagnostics: header.diagnostics }
  const volume = cellVolume(structure.cell)
  if (!volume.ok) return { frames: [], data: [], diagnostics: volume.diagnostics }
  const gridLine = input.nonempty()
  if (gridLine === undefined)
    return input.fail('RESULT_GRID_TRUNCATED', 'Missing FFT grid dimensions.')
  const dims = dimensions(gridLine, input)
  const size = gridSize(dims, input)
  const [a, b, c] = structure.cell.basis
  const steps: Matrix3 = [scale(a, 1 / dims[0]), scale(b, 1 / dims[1]), scale(c, 1 / dims[2])]
  const frameId = 'structure'
  const data: CalculationData[] = []
  const potential = format === 'locpot'
  const divisor = potential ? 1 : volume.value

  let line: string | undefined
  do {
    if ((data.length + 1) * size > CALCULATION_LIMITS.gridSamples)
      input.fail('RESULT_GRID_BUDGET', 'The combined channels exceed the grid sample budget.')
    const values = new Float64Array(size)
    readSamples(input, size, (value, index) => {
      values[index] = value / divisor
    })
    const spin = data.length > 0
    data.push({
      id: potential ? 'potential' : spin ? 'spin-density' : 'density',
      frameId,
      kind: 'grid',
      quantity: potential ? 'local-potential' : spin ? 'spin-density' : 'electron-density',
      unit: potential ? 'eV' : '1/Å³',
      method: potential ? 'VASP LOCPOT' : `VASP ${format.toUpperCase()}`,
      ...(spin ? { spin: 'up-down' } : {}),
      grid: { origin, steps, dimensions: dims, periodic: [true, true, true], values }
    })

    line = input.nonempty()
    while (line !== undefined && /^\s*augmentation occupancies/i.test(line)) {
      const declaration = /^\s*augmentation occupancies\s+(\d+)\s+(\d+)\s*$/i.exec(line)
      const atom = Number(declaration?.[1])
      const length = Number(declaration?.[2])
      if (
        format !== 'chgcar' ||
        !declaration ||
        atom < 1 ||
        atom > structure.atoms.length ||
        !Number.isSafeInteger(length) ||
        length > CALCULATION_LIMITS.gridSamples
      )
        input.fail('RESULT_AUGMENTATION', 'Unsupported CHGCAR augmentation block declaration.')
      readSamples(input, length)
      line = input.nonempty()
    }
    if (line !== undefined) {
      if (potential || data.length === 2)
        input.fail('RESULT_GRID_CHANNELS', 'This VASP grid channel layout is unsupported.')
      const next = dimensions(line, input)
      if (next.some((value, axis) => value !== dims[axis]))
        input.fail('RESULT_GRID_CHANNELS', 'The spin grid must match the total density dimensions.')
    }
  } while (line !== undefined)
  return {
    frames: [{ id: frameId, structure }],
    data,
    diagnostics: header.diagnostics,
    program: { name: 'VASP' }
  }
}

// CODATA 2018 Bohr radius in Å, used for Cube geometric coordinates and step vectors.
const bohrAngstrom = 0.529177210903

export function parseCube(text: string, options: CalculationParseOptions): ParsedCalculation {
  const input = new ResultLines(text)
  const title = input.next()
  const comment = input.next() ?? ''
  const { quantity, unit } = options
  if (!quantity?.trim() || !unit?.trim())
    return input.fail(
      'RESULT_CUBE_QUANTITY',
      'Choose a physical quantity and unit for Cube values.'
    )
  if (
    /OUTER LOOP:/i.test(comment) &&
    !/OUTER LOOP:\s*X,\s*MIDDLE LOOP:\s*Y,\s*INNER LOOP:\s*Z\b/i.test(comment)
  )
    input.fail('RESULT_CUBE_ORDER', 'Cube supports outer X, middle Y, inner Z ordering.')
  const head = words(input.next() ?? '')
  const signedCount = Number(head[0])
  const atomCount = Math.abs(signedCount)
  const cubeOrigin = vector(head.slice(1, 4))
  if (
    !Number.isSafeInteger(signedCount) ||
    atomCount > CALCULATION_LIMITS.atomFrames ||
    !cubeOrigin ||
    head.length < 4 ||
    head.length > 5 ||
    (head[4] && head[4] !== '1')
  )
    return input.fail(
      'RESULT_CUBE_HEADER',
      'Expected a Cube origin, supported atom count and one dataset.'
    )
  const axes = []
  const sizes = []
  for (let axis = 0; axis < 3; axis++) {
    const row = words(input.next() ?? '')
    const step = vector(row.slice(1))
    const size = Number(row[0])
    if (!step || !Number.isSafeInteger(size) || size < 2)
      return input.fail(
        'RESULT_CUBE_HEADER',
        'Expected a positive sample count and Bohr step vector.'
      )
    axes.push(scale(step, bohrAngstrom))
    sizes.push(size)
  }
  const dims: Vec3 = [sizes[0], sizes[1], sizes[2]]
  const size = gridSize(dims, input)
  const atoms: MolecularAtom[] = []
  for (let i = 0; i < atomCount; i++) {
    const row = words(input.next() ?? '')
    const element = ELEMENTS[Number(row[0]) - 1]
    const position = vector(row.slice(2))
    if (!element || !position || !Number.isFinite(vaspNumber(row[1])))
      return input.fail(
        'RESULT_CUBE_ATOM',
        'Expected an atomic number, nuclear charge and Bohr coordinates.'
      )
    atoms.push({
      id: `cube:atom:${i + 1}`,
      element: element.symbol,
      cartesian: scale(position, bohrAngstrom)
    })
  }
  if (signedCount < 0) {
    const dataset = words(input.nonempty() ?? '')
    if (dataset.length !== 2 || dataset[0] !== '1' || !/^\d+$/.test(dataset[1]))
      input.fail('RESULT_CUBE_CHANNELS', 'Only one Cube orbital dataset is supported.')
  }
  const structure = createStructureSnapshot({ kind: 'molecular', title, atoms, bonds: [] })
  if (!structure.ok) return { frames: [], data: [], diagnostics: structure.diagnostics }
  const values = new Float64Array(size)
  const [nx, ny, nz] = dims
  readSamples(input, size, (value, index) => {
    const x = Math.floor(index / (ny * nz))
    const y = Math.floor(index / nz) % ny
    const z = index % nz
    values[x + nx * (y + ny * z)] = value
  })
  if (input.nonempty() !== undefined)
    input.fail('RESULT_CUBE_CHANNELS', 'Unexpected data after the single Cube dataset.')
  return {
    frames: [{ id: 'structure', structure: structure.value }],
    data: [
      {
        id: 'field',
        frameId: 'structure',
        kind: 'grid',
        quantity,
        unit,
        grid: {
          origin: scale(cubeOrigin, bohrAngstrom),
          steps: [axes[0], axes[1], axes[2]],
          dimensions: dims,
          periodic: [false, false, false],
          values
        }
      }
    ]
  }
}
