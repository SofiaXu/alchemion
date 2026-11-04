import {
  CALCULATION_LIMITS,
  matchResultFrame,
  type CalculationData,
  type ResultFrame,
  type VibrationMode
} from '../../core/calculation'
import { cartesianToFractional, createCell } from '../../core/cell'
import { getElement } from '../../core/data'
import { determinant, dot, multiplyMatrixVector, norm, subtract, transpose } from '../../core/math'
import type { Cell, Diagnostic, Matrix3, PeriodicStructureSnapshot, Vec3 } from '../../core/types'
import {
  ResultLines,
  type CalculationParseOptions,
  type ParsedCalculation,
  vaspNumber,
  vector,
  words
} from './common'

function vectors(input: ResultLines, count: number, columns: number) {
  if (!count || count > CALCULATION_LIMITS.atomFrames)
    return input.fail('RESULT_OUTCAR_ATOMS', 'OUTCAR requires a known and supported atom count.')
  const rows: number[][] = []
  for (let i = 0; i < count; i++) {
    const row = words(input.next() ?? '').map(vaspNumber)
    if (row.length !== columns || row.some((value) => !Number.isFinite(value)))
      return input.fail(
        'RESULT_OUTCAR_VECTOR',
        'Expected finite OUTCAR geometry or vector components.'
      )
    rows.push(row)
  }
  return rows
}

const triple = (values: readonly number[], index = 0): Vec3 => [
  values[index],
  values[index + 1],
  values[index + 2]
]

function geometry(
  input: ResultLines,
  cell: Cell | undefined,
  elements: readonly string[],
  coordinates: readonly Vec3[],
  cartesian: boolean
): PeriodicStructureSnapshot {
  if (!cell || !elements.length || elements.length !== coordinates.length)
    return input.fail(
      'RESULT_OUTCAR_GEOMETRY',
      'OUTCAR positions require cell and element records for the same frame.'
    )
  return {
    kind: 'periodic',
    cell,
    atoms: coordinates.map((coordinate, index) => {
      const position = cartesian ? cartesianToFractional(cell, coordinate) : undefined
      if (position && !position.ok)
        return input.fail(
          'RESULT_OUTCAR_GEOMETRY',
          'Cannot convert OUTCAR Cartesian positions to the cell basis.'
        )
      return {
        id: `vasp:atom:${index + 1}`,
        element: elements[index],
        fractional: position?.value ?? coordinate
      }
    }),
    bonds: []
  }
}

function projected(input: ResultLines, count: number): number[] {
  const header = input.nonempty() ?? ''
  const columns = words(header)
  if (
    !/^\s*# of ion\b/i.test(header) ||
    columns.at(-1)?.toLowerCase() !== 'tot' ||
    !/^\s*-+\s*$/.test(input.next() ?? '')
  )
    return input.fail(
      'RESULT_OUTCAR_PROJECTION',
      'Expected the LORBIT ion projection table with a tot column.'
    )
  return vectors(input, count, columns.length - 2).map((row, index) => {
    if (row[0] !== index + 1)
      input.fail(
        'RESULT_OUTCAR_PROJECTION',
        'Projection ion indices must match the file atom order.'
      )
    return row[row.length - 1]
  })
}

function spinBasis(input: ResultLines): Matrix3 {
  if (!/^\s*-+\s*$/.test(input.nonempty() ?? ''))
    return input.fail(
      'RESULT_OUTCAR_SPIN_BASIS',
      'Expected the printed SAXIS transformation matrix.'
    )
  const rows: Vec3[] = []
  for (let i = 0; i < 3; i++) {
    const fields = words(input.next() ?? '')
    const row = vector([fields[0] ?? '', fields[2] ?? '', fields[4] ?? ''])
    if (!row || fields[1] !== 'm_x' || fields[3] !== 'm_y' || fields[5] !== 'm_z')
      return input.fail('RESULT_OUTCAR_SPIN_BASIS', 'Expected ordered SAXIS spinor components.')
    rows.push(row)
  }
  const transform = transpose([rows[0], rows[1], rows[2]])
  if (
    Math.abs(determinant(transform) - 1) > 2e-5 ||
    rows.some(
      (row, i) =>
        Math.abs(norm(row) - 1) > 2e-5 ||
        rows.slice(0, i).some((other) => Math.abs(dot(row, other)) > 2e-5)
    )
  )
    return input.fail(
      'RESULT_OUTCAR_SPIN_BASIS',
      'The printed SAXIS matrix must be a proper rotation.'
    )
  return transform
}

function rotationFromSaxis(axis: Vec3 | undefined): Matrix3 | undefined {
  if (!axis || norm(axis) === 0) return undefined
  const [x, y, z] = axis
  const alpha = Math.atan2(y, x)
  const beta = Math.atan2(Math.hypot(x, y), z)
  const ca = Math.cos(alpha),
    sa = Math.sin(alpha),
    cb = Math.cos(beta),
    sb = Math.sin(beta)
  return [
    [ca * cb, sa * cb, -sb],
    [-sa, ca, 0],
    [ca * sb, sa * sb, cb]
  ]
}

function close(a: Vec3, b: Vec3) {
  return norm(subtract(a, b)) <= 2e-5
}

export function parseOutcar(text: string, options: CalculationParseOptions): ParsedCalculation {
  const input = new ResultLines(text)
  const species: string[] = []
  const frames: ResultFrame[] = []
  const data: CalculationData[] = []
  const diagnostics: Diagnostic[] = []
  let version: string | undefined
  let termination: ParsedCalculation['termination'] = 'unknown'
  let convergence: ParsedCalculation['convergence'] = 'unknown'
  let elements: string[] = []
  let cell: Cell | undefined
  let initial: PeriodicStructureSnapshot | undefined
  let initialFrameId: string | undefined
  let lastFrame: ResultFrame | undefined
  let forces: Vec3[] = []
  let step = 0
  let ionicIteration = 0
  let geometryIteration = 0
  let spin = 0
  let lorbit = 0
  let noncollinear = false
  let axes: Matrix3 | undefined
  let saxis: Vec3 | undefined
  let modes: VibrationMode[] = []
  const modeIds = new Set<string>()
  let modeGeometry: PeriodicStructureSnapshot | undefined
  let massWeighted: boolean | undefined
  let masses: number[] | undefined
  let counts: number[] = []
  const projections = new Map<string, number[]>()
  const warn = (code: string, message: string) => {
    diagnostics.push({
      severity: 'warning',
      code,
      message,
      sourceLocation: { line: input.line, column: 1 }
    })
  }
  let record: string | undefined
  while ((record = input.next()) !== undefined) {
    const line = record.trim()
    if (!line) continue
    const iteration = /^-+\s*Iteration\s+(\d+)\s*\(/i.exec(line)
    if (iteration) ionicIteration = Number(iteration[1])
    const vasp = /^vasp\.([\w.-]+)/i.exec(line)
    if (vasp) version = vasp[1]
    const atom = /^VRHFIN\s*=\s*([A-Z][a-z]?)\s*:/.exec(line)
    if (atom) species.push(atom[1])
    const ions = /^ions per type\s*=\s*(.+)$/i.exec(line)
    if (ions) {
      counts = words(ions[1]).map(Number)
      const total = counts.reduce((sum, value) => sum + value, 0)
      if (
        counts.length !== species.length ||
        counts.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
        total > CALCULATION_LIMITS.atomFrames ||
        species.some((element) => !getElement(element))
      )
        return input.fail(
          'RESULT_OUTCAR_ATOMS',
          'OUTCAR ion counts must match the known VRHFIN element records.'
        )
      elements = counts.flatMap((count, index) => Array<string>(count).fill(species[index]))
    }
    const ispin = /^ISPIN\s*=\s*(\d+)/i.exec(line)
    if (ispin) spin = Number(ispin[1])
    const projection = /^LORBIT\s*=\s*(\d+)/i.exec(line)
    if (projection) lorbit = Number(projection[1])
    if (/^(LNONCOLLINEAR|LSORBIT)\s*=\s*T\b/i.test(line)) noncollinear = true
    const axis = /^SAXIS\s*=\s*(.+)/i.exec(line)
    if (axis) saxis = vector(words(axis[1]).slice(0, 3))
    if (/^transformation matrix from SAXIS to cartesian coordinates/i.test(line))
      axes = spinBasis(input)
    if (/^Mass of Ions in am/i.test(line)) {
      const found = /^\s*POMASS\s*=\s*(.+)$/.exec(input.next() ?? '')
      const table = words(found?.[1] ?? '').map(vaspNumber)
      if (
        table.length === counts.length &&
        table.every((mass) => Number.isFinite(mass) && mass > 0)
      )
        masses = counts.flatMap((count, index) => Array<number>(count).fill(table[index]))
    }
    if (/^direct lattice vectors\s+reciprocal lattice vectors$/i.test(line)) {
      const rows = vectors(input, 3, 6)
      const created = createCell({ basis: [triple(rows[0]), triple(rows[1]), triple(rows[2])] })
      if (!created.ok) return { frames: [], data: [], diagnostics: created.diagnostics }
      cell = created.value
    }
    if (/^position of ions in fractional coordinates\s+\(direct lattice\)/i.test(line)) {
      const positions = vectors(input, elements.length, 3).map((row) => triple(row))
      initial = geometry(input, cell, elements, positions, false)
      initialFrameId = 'initial'
    }
    if (/^POSITION\s+TOTAL-FORCE\s+\(eV\/Angst\)/i.test(line)) {
      if (!/^\s*-+\s*$/.test(input.next() ?? ''))
        return input.fail('RESULT_OUTCAR_FORCES', 'Expected the OUTCAR force table separator.')
      const rows = vectors(input, elements.length, 6)
      lastFrame = {
        id: `step:${++step}`,
        structure: geometry(
          input,
          cell,
          elements,
          rows.map((row) => triple(row)),
          true
        ),
        step
      }
      forces = rows.map((row) => triple(row, 3))
      geometryIteration = ionicIteration
      projections.clear()
    }
    const property = /^(total charge|magnetization \(([xyz])\))$/i.exec(line)
    if (property && lastFrame && lorbit >= 10 && geometryIteration === ionicIteration)
      projections.set(property[2]?.toLowerCase() ?? 'charge', projected(input, elements.length))
    const energy = /^free\s+energy\s+TOTEN\s*=\s*(\S+)/i.exec(line)
    if (
      energy &&
      lastFrame &&
      geometryIteration === ionicIteration &&
      Number.isFinite(vaspNumber(energy[1]))
    )
      lastFrame = {
        ...lastFrame,
        energyEv: vaspNumber(energy[1]),
        energyKind: 'VASP free energy (TOTEN)'
      }
    if (/General timing and accounting informations? for this job/i.test(line))
      termination = 'completed'
    if (/^reached required accuracy\b/i.test(line)) convergence = 'converged'
    const adjusted = /^Eigenvectors after division by SQRT\(mass\)/i.test(line)
    const dynamical = /^Eigenvectors and eigenvalues of the dynamical matrix/i.test(line)
    // VASP repeats the dynamical-matrix heading inside its mass-adjusted section.
    if (adjusted || (dynamical && massWeighted !== false)) {
      massWeighted = !adjusted
      modes = []
      modeIds.clear()
      modeGeometry = undefined
    }
    const eigen = /^(\d+)\s+f(\/i)?\s*=\s*(\S+)\s+THz\b/i.exec(line)
    if (eigen && massWeighted !== undefined) {
      if ((modes.length + 1) * elements.length > CALCULATION_LIMITS.atomFrames)
        return input.fail('RESULT_OUTCAR_MODES', 'The mode vector budget was exceeded.')
      if (!/^\s*X\s+Y\s+Z\s+dx\s+dy\s+dz\s*$/i.test(input.nonempty() ?? ''))
        return input.fail(
          'RESULT_OUTCAR_MODES',
          'Expected Cartesian positions and eigenvector components.'
        )
      const rows = vectors(input, elements.length, 6)
      const positions = rows.map((row) => triple(row))
      const structure = geometry(input, cell, elements, positions, true)
      const freq = Math.abs(vaspNumber(eigen[3]))
      if (
        !Number.isFinite(freq) ||
        modeIds.has(eigen[1]) ||
        (modeGeometry &&
          structure.atoms.some(
            (atom, index) => !close(atom.fractional, modeGeometry!.atoms[index].fractional)
          ))
      )
        return input.fail(
          'RESULT_OUTCAR_MODES',
          'Modes must have finite unique frequencies and the same reference geometry.'
        )
      modeGeometry ??= structure
      modeIds.add(eigen[1])
      modes.push({
        id: eigen[1],
        frequencyThz: freq,
        imaginary: !!eigen[2],
        q: [0, 0, 0],
        real: rows.map((row) => triple(row, 3)),
        ...(massWeighted && masses ? { masses } : {})
      })
    }
  }
  if (initial) frames.push({ id: 'initial', structure: initial })
  if (lastFrame) {
    const frameId = lastFrame.id
    frames.push(lastFrame)
    data.push({
      id: 'forces',
      frameId,
      kind: 'atomic',
      quantity: 'force',
      unit: 'eV/Å',
      vector: 'polar',
      values: forces
    })
    const charge = projections.get('charge')
    const x = projections.get('x'),
      y = projections.get('y'),
      z = projections.get('z')
    const method = `VASP LORBIT=${lorbit}`
    if (charge)
      data.push({
        id: 'projected-charge',
        frameId,
        kind: 'atomic',
        quantity: 'projected-electron-population',
        unit: 'e',
        method,
        values: charge
      })
    if (x && y && z) {
      const transform = axes ?? rotationFromSaxis(saxis)
      if (transform)
        data.push({
          id: 'magnetic-moment',
          frameId,
          kind: 'atomic',
          quantity: 'magnetic-moment',
          unit: 'μB',
          method,
          vector: 'axial',
          values: x.map((value, index) =>
            multiplyMatrixVector(transform, [value, y[index], z[index]])
          )
        })
      else
        warn(
          'RESULT_OUTCAR_SPIN_BASIS',
          'Three spinor components are present without a verifiable SAXIS basis.'
        )
    } else if (x && !y && !z && !noncollinear && spin === 2)
      data.push({
        id: 'magnetic-moment',
        frameId,
        kind: 'atomic',
        quantity: 'collinear-magnetic-moment',
        unit: 'μB',
        method,
        direction: [0, 0, 1],
        values: x
      })
    else if (x || y || z)
      warn(
        'RESULT_OUTCAR_SPIN_CHANNELS',
        'Magnetic projection channels are incomplete or their basis is unknown.'
      )
  }
  if (modeGeometry && modes.length) {
    if (massWeighted && !masses)
      return input.fail(
        'RESULT_OUTCAR_MODE_MASSES',
        'Mass-weighted OUTCAR eigenvectors require the calculation masses.'
      )
    frames.push({ id: 'mode-reference', structure: modeGeometry })
    data.push({
      id: 'vibrations',
      frameId: 'mode-reference',
      kind: 'vibration',
      quantity: 'vibrational-mode',
      unit: 'THz',
      method: massWeighted
        ? 'VASP dynamical matrix (mass-weighted)'
        : 'VASP dynamical matrix (mass-adjusted)',
      modes
    })
  }
  if (!frames.length)
    return input.fail('RESULT_OUTCAR_GEOMETRY', 'No supported OUTCAR structure record was found.')
  const reference = options.reference
  if (
    reference &&
    !frames.some(({ structure }) =>
      matchResultFrame(
        structure,
        reference,
        reference.atoms.map((atom) => atom.id)
      )
    )
  )
    return input.fail(
      'RESULT_OUTCAR_REFERENCE',
      'OUTCAR geometry, cell or element order does not match the supplied reference.'
    )
  return {
    frames,
    data,
    initialFrameId,
    termination,
    convergence,
    diagnostics,
    program: { name: 'VASP', ...(version ? { version } : {}) }
  }
}
