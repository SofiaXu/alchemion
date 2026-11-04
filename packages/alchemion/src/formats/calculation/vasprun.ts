import { SaxesParser } from 'saxes'
import {
  CALCULATION_LIMITS,
  type CalculationData,
  type FermiReference,
  type ResultFrame
} from '../../core/calculation'
import { getElement } from '../../core/data'
import type { PeriodicStructureSnapshot, Vec3 } from '../../core/types'
import {
  CalculationParseError,
  type CalculationParseOptions,
  type ParsedCalculation,
  vaspNumber,
  vector,
  words
} from './common'

interface XmlNode {
  name: string
  attributes: Record<string, string>
  children: XmlNode[]
  text: string
  line: number
}
const children = (node: XmlNode | undefined, name: string) =>
  node?.children.filter((child) => child.name === name) ?? []
const child = (node: XmlNode | undefined, name: string, named?: string) =>
  node?.children.find(
    (entry) => entry.name === name && (named === undefined || entry.attributes.name === named)
  )
const last = (node: XmlNode | undefined, name: string) => children(node, name).at(-1)
const scalar = (node: XmlNode | undefined, name: string) =>
  vaspNumber(child(node, 'i', name)?.text.trim() ?? '')
const fail = (node: XmlNode | undefined, code: string, message: string): never => {
  throw new CalculationParseError(code, message, node?.line ?? 1)
}

function rows(node: XmlNode | undefined, name = 'v'): Vec3[] {
  return children(node, name).map((entry) => {
    const row = vector(words(entry.text))
    return row ?? fail(entry, 'RESULT_XML_VECTOR', 'Expected three finite components.')
  })
}

function geometry(node: XmlNode, elements: readonly string[]): PeriodicStructureSnapshot {
  const basis = rows(child(child(node, 'crystal'), 'varray', 'basis'))
  const positions = rows(child(node, 'varray', 'positions'))
  if (basis.length !== 3 || !elements.length || positions.length !== elements.length)
    fail(
      node,
      'RESULT_XML_GEOMETRY',
      'Structure basis or fractional coordinate count does not match atominfo.'
    )
  return {
    kind: 'periodic',
    cell: { basis: [basis[0], basis[1], basis[2]] },
    atoms: positions.map((fractional, index) => ({
      id: `vasp:atom:${index + 1}`,
      element: elements[index],
      fractional
    })),
    bonds: []
  }
}

function sameVector(a: Vec3, b: Vec3) {
  return a.every((value, axis) => Math.abs(value - b[axis]) <= 1e-7)
}

function sameGeometry(a: PeriodicStructureSnapshot, b: PeriodicStructureSnapshot) {
  return (
    a.cell.basis.every((value, axis) => sameVector(value, b.cell.basis[axis])) &&
    a.atoms.every((atom, index) => sameVector(atom.fractional, b.atoms[index].fractional))
  )
}

function energyTable(node: XmlNode | undefined): number[][] {
  return children(node, 'r').map((entry) => {
    const row = words(entry.text).map(vaspNumber)
    if (!row.length || row.some((value) => !Number.isFinite(value)))
      fail(entry, 'RESULT_XML_ELECTRONIC', 'Expected a finite electronic structure row.')
    return row
  })
}

function kPath(node: XmlNode | undefined, options: CalculationParseOptions) {
  const points = rows(child(node, 'varray', 'kpointlist'))
  const generation = child(node, 'generation')
  const divisions = scalar(generation, 'divisions')
  const lineMode = generation?.attributes.param === 'listgenerated'
  const explicit = options.path
  if (
    explicit !== undefined &&
    (!Array.isArray(explicit) ||
      explicit.length !== points.length ||
      explicit.some(
        (entry) =>
          !entry ||
          typeof entry !== 'object' ||
          (entry.label !== undefined && (typeof entry.label !== 'string' || !entry.label.trim())) ||
          (entry.breakBefore !== undefined && typeof entry.breakBefore !== 'boolean')
      ))
  )
    fail(node, 'RESULT_XML_KPATH', 'K-path labels and boundaries must match every file k-point.')
  if (!explicit && !lineMode) return []
  if (lineMode && (!Number.isSafeInteger(divisions) || divisions < 2 || points.length % divisions))
    fail(node, 'RESULT_XML_KPATH', 'Line-mode k-points must match the file subdivision count.')
  return points.map((fractional, index) => {
    const entry = explicit?.[index]
    const discontinuity =
      lineMode && index > 0 && index % divisions === 0 && !sameVector(fractional, points[index - 1])
    return {
      fractional,
      ...(entry?.label ? { label: entry.label } : {}),
      ...(index > 0 && (entry?.breakBefore ?? discontinuity) ? { breakBefore: true } : {})
    }
  })
}

function readBands(
  node: XmlNode | undefined,
  points: ReturnType<typeof kPath>,
  frameId: string,
  fermi?: FermiReference
): CalculationData | undefined {
  if (!node || !points.length) return undefined
  const spins = children(child(child(node, 'array'), 'set'), 'set')
  const bands = spins.flatMap((spin, spinIndex) => {
    const tables = children(spin, 'set').map(energyTable)
    const width = tables[0]?.length ?? 0
    if (
      tables.length !== points.length ||
      !width ||
      tables.some((table) => table.length !== width || table.some((row) => row.length !== 2))
    )
      fail(
        spin,
        'RESULT_XML_BANDS',
        'Eigenvalues must describe identical bands for every k-point and spin.'
      )
    return Array.from({ length: width }, (_, band) => ({
      band: band + 1,
      ...(spins.length > 1 ? { spin: `spin-${spinIndex + 1}` } : {}),
      energies: tables.map((table) => table[band][0])
    }))
  })
  if (!bands.length)
    fail(node, 'RESULT_XML_BANDS', 'The eigenvalue array has no spin or k-point sets.')
  return {
    id: 'bands',
    frameId,
    kind: 'bands',
    quantity: 'band-energy',
    unit: 'eV',
    points,
    bands,
    ...(fermi ? { fermi } : {})
  }
}

function readDos(
  node: XmlNode | undefined,
  frameId: string,
  atomCount: number,
  fermi?: FermiReference
): CalculationData | undefined {
  if (!node) return undefined
  const total = child(child(node, 'total'), 'array')
  if (!total) return undefined
  const spins = children(child(total, 'set'), 'set')
  const energies = energyTable(spins[0]).map((row) => row[0])
  if (
    !energies.length ||
    energies.some((value, index) => index > 0 && value <= energies[index - 1])
  )
    fail(total, 'RESULT_XML_DOS', 'Expected a strictly increasing DOS energy grid.')
  const channel = (
    spin: XmlNode,
    index: number,
    fields: readonly string[],
    title: string,
    spinCount: number
  ) => {
    const table = energyTable(spin)
    if (
      table.length !== energies.length ||
      table.some(
        (row, i) => row.length !== fields.length + 1 || Math.abs(row[0] - energies[i]) > 1e-6
      )
    )
      fail(spin, 'RESULT_XML_DOS', 'DOS channel rows must align with the shared energy grid.')
    return fields.flatMap((field, column) =>
      field === 'integrated'
        ? []
        : [
            {
              label: title ? `${title}: ${field}` : field,
              ...(spinCount > 1 ? { spin: `spin-${index + 1}` } : {}),
              values: table.map((row) => row[column + 1])
            }
          ]
    )
  }
  const fields = (array: XmlNode) => {
    const entries = children(array, 'field').map((entry) => entry.text.trim())
    if (entries[0] !== 'energy' || entries.length < 2 || entries.some((entry) => !entry))
      fail(array, 'RESULT_XML_DOS', 'DOS field names must begin with energy.')
    return entries.slice(1)
  }
  const totalFields = fields(total)
  const series = spins.flatMap((spin, index) => channel(spin, index, totalFields, '', spins.length))
  const partial = child(child(node, 'partial'), 'array')
  if (partial) {
    const projectedFields = fields(partial)
    const ions = children(child(partial, 'set'), 'set')
    if (ions.length !== atomCount)
      fail(partial, 'RESULT_XML_DOS', 'Projected DOS ion count disagrees with atominfo.')
    for (const [index, ion] of ions.entries()) {
      const projectedSpins = children(ion, 'set')
      if (projectedSpins.length !== spins.length)
        fail(ion, 'RESULT_XML_DOS', 'Projected DOS spin count disagrees with total DOS.')
      for (const [spinIndex, spin] of projectedSpins.entries())
        series.push(...channel(spin, spinIndex, projectedFields, `Ion ${index + 1}`, spins.length))
    }
  }
  return {
    id: 'dos',
    frameId,
    kind: 'dos',
    quantity: 'density-of-states',
    unit: 'states/eV',
    energies,
    series,
    ...(fermi ? { fermi } : {})
  }
}

const topSections = new Set([
  'generator',
  'kpoints',
  'parameters',
  'atominfo',
  'structure',
  'calculation'
])
function take(
  tag: string,
  attributes: Record<string, string>,
  parent?: XmlNode,
  grandparent?: XmlNode
) {
  if (!parent) return false
  if (parent.name === 'modeling')
    return (
      topSections.has(tag) &&
      (tag !== 'structure' || ['initialpos', 'finalpos'].includes(attributes.name))
    )
  if (parent.name === 'calculation')
    return (
      ['structure', 'energy', 'eigenvalues', 'dos'].includes(tag) ||
      (tag === 'varray' && attributes.name === 'forces')
    )
  if (parent.name === 'atominfo' && tag === 'array') return attributes.name === 'atoms'
  if (parent.name === 'kpoints' && tag === 'varray') return attributes.name === 'kpointlist'
  if (parent.name === 'crystal' && tag === 'varray') return attributes.name === 'basis'
  if (parent.name === 'structure' && tag === 'varray') return attributes.name === 'positions'
  if (grandparent?.name === 'calculation' && parent.name === 'energy')
    return tag === 'i' && attributes.name === 'e_fr_energy'
  return true
}

export function parseVasprun(text: string, options: CalculationParseOptions): ParsedCalculation {
  const parser = new SaxesParser({ xmlns: false })
  const stack: (XmlNode | undefined)[] = []
  const frames: ResultFrame[] = []
  const data: CalculationData[] = []
  let elements: string[] = []
  let version: string | undefined
  let kpoints: XmlNode | undefined
  let electronic: { frameId: string; eigenvalues?: XmlNode; dos?: XmlNode } | undefined
  let initial: PeriodicStructureSnapshot | undefined
  let final: PeriodicStructureSnapshot | undefined
  let lastStep: PeriodicStructureSnapshot | undefined
  let potim = Number.NaN
  let molecularDynamics = false
  let mdStartsAtInitial = false
  let atomFrames = 0
  let selectedNodes = 0
  let steps = 0

  function addFrame(frame: ResultFrame) {
    atomFrames += frame.structure.atoms.length
    if (frames.length >= CALCULATION_LIMITS.frames || atomFrames > CALCULATION_LIMITS.atomFrames)
      throw new CalculationParseError(
        'RESULT_TRAJECTORY_BUDGET',
        'The trajectory exceeds the frame or atom-frame budget.',
        parser.line
      )
    frames.push(frame)
  }

  parser.on('doctype', () => {
    throw new CalculationParseError(
      'RESULT_XML_DOCTYPE',
      'VASP XML document type declarations are unsupported.',
      parser.line
    )
  })
  parser.on('error', (error) => {
    throw new CalculationParseError('RESULT_XML_SYNTAX', error.message, parser.line)
  })
  parser.on('opentag', ({ name, attributes }) => {
    const parent = stack.at(-1)
    if ((!stack.length && name !== 'modeling') || stack.length >= 128)
      throw new CalculationParseError(
        'RESULT_XML_ROOT',
        'Expected a bounded VASP modeling document.',
        parser.line
      )
    const keep = !stack.length || take(name, attributes, parent, stack.at(-2))
    if (!keep) {
      stack.push(undefined)
      return
    }
    if (++selectedNodes > 4_000_000)
      throw new CalculationParseError(
        'RESULT_XML_BUDGET',
        'The file exceeds the XML record budget.',
        parser.line
      )
    const node = { name, attributes, children: [], text: '', line: parser.line }
    if (parent && parent.name !== 'modeling') parent.children.push(node)
    stack.push(node)
  })
  parser.on('text', (value) => {
    const node = stack.at(-1)
    if (node && !node.children.length) node.text += value
  })
  parser.on('closetag', () => {
    const node = stack.pop()
    if (!node) return
    if (node.name === 'i' && stack[1]?.name === 'parameters') {
      if (node.attributes.name === 'POTIM') potim = vaspNumber(node.text.trim())
      if (node.attributes.name === 'IBRION') molecularDynamics = vaspNumber(node.text.trim()) === 0
    }
    if (stack.length !== 1) return
    switch (node.name) {
      case 'generator':
        version = child(node, 'i', 'version')?.text.trim()
        break
      case 'kpoints':
        kpoints = node
        break
      case 'atominfo':
        elements = children(child(child(node, 'array', 'atoms'), 'set'), 'rc').map((row) => {
          const element = child(row, 'c')?.text.trim()
          return element && getElement(element)
            ? element
            : fail(
                row,
                'RESULT_XML_ELEMENT',
                'VASP atominfo requires a known element for each ion.'
              )
        })
        break
      case 'structure':
        if (node.attributes.name === 'initialpos') {
          initial = geometry(node, elements)
          addFrame({
            id: 'initial',
            structure: initial,
            ...(molecularDynamics && potim > 0 ? { timeFs: 0 } : {})
          })
        } else final = geometry(node, elements)
        break
      case 'calculation': {
        const geometryNode = child(node, 'structure')
        const structure = geometryNode
          ? geometry(geometryNode, elements)
          : fail(node, 'RESULT_XML_GEOMETRY', 'Ionic step lacks associated structure geometry.')
        const id = `step:${++steps}`
        const energy = scalar(child(node, 'energy'), 'e_fr_energy')
        if (steps === 1) mdStartsAtInitial = !!initial && sameGeometry(initial, structure)
        addFrame({
          id,
          structure,
          step: steps,
          ...(molecularDynamics && potim > 0 && mdStartsAtInitial
            ? { timeFs: (steps - 1) * potim }
            : {}),
          ...(Number.isFinite(energy)
            ? { energyEv: energy, energyKind: 'VASP free energy (TOTEN)' }
            : {})
        })
        lastStep = structure
        const forceNode = child(node, 'varray', 'forces')
        if (forceNode) {
          const values = rows(forceNode)
          if (values.length !== elements.length)
            fail(forceNode, 'RESULT_XML_FORCES', 'Force record count disagrees with atominfo.')
          data.push({
            id: `forces:${steps}`,
            frameId: id,
            kind: 'atomic',
            quantity: 'force',
            unit: 'eV/Å',
            vector: 'polar',
            values
          })
        }
        const eigenvalues = last(node, 'eigenvalues'),
          dos = last(node, 'dos')
        if (eigenvalues || dos) electronic = { frameId: id, eigenvalues, dos }
        break
      }
    }
  })
  // Chunked writes keep the parser's own token lookahead bounded.
  for (let i = 0; i < text.length; i += 65_536) parser.write(text.slice(i, i + 65_536))
  parser.close()
  if (final && (!lastStep || !sameGeometry(final, lastStep)))
    addFrame({ id: 'final', structure: final })
  if (!frames.length)
    fail(
      undefined,
      'RESULT_XML_GEOMETRY',
      'No supported structure frames were found in vasprun.xml.'
    )
  if (electronic) {
    const energy = scalar(electronic.dos, 'efermi')
    const fermi = Number.isFinite(energy)
      ? { value: energy, source: `${options.name ?? 'vasprun.xml'} DOS efermi` }
      : undefined
    const bands = readBands(
      electronic.eigenvalues,
      kPath(kpoints, options),
      electronic.frameId,
      fermi
    )
    const dos = readDos(electronic.dos, electronic.frameId, elements.length, fermi)
    if (bands) data.push(bands)
    if (dos) data.push(dos)
  }
  return {
    frames,
    data,
    ...(initial ? { initialFrameId: 'initial' } : {}),
    program: { name: 'VASP', ...(version ? { version } : {}) }
  }
}
