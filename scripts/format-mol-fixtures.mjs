import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCell, parseSymmetryOperation } from '../packages/alchemion/dist/core.js'
import { writeStructure } from '../packages/alchemion/dist/formats.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, '.tmp/format-reference')
const names = [
  'mol-v2000.mol',
  'mol-v3000.mol',
  'mol-input-v2000.mol',
  'mol-input-v3000.mol',
  'finite.mol',
  'POSCAR',
  'expected.json'
]
for (const name of names) {
  const exists = await access(resolve(output, name)).then(
    () => true,
    () => false
  )
  if (exists) throw new Error(`Refusing to overwrite an existing reference artifact: ${name}`)
}
const endpoint = (sourceAtomId, symmetryOperationId = 'identity', shift = 0) => ({
  sourceAtomId,
  symmetryOperationId,
  integerCellOffset: [shift, 0, 0]
})
const value = (result) => {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const molecule = {
  kind: 'molecular',
  title: 'Alchemion authored tetrahedron and radicals',
  atoms: [
    {
      id: 'center',
      element: 'C',
      cartesian: [0, 0, 0],
      isotope: 13,
      formalCharge: 1,
      atomMap: 71,
      stereoParity: { parity: 'odd', referenceAtoms: ['f', 'cl', 'br', 'h'] }
    },
    { id: 'f', element: 'F', cartesian: [1, 0, 0] },
    { id: 'cl', element: 'Cl', cartesian: [0, 1, 0] },
    { id: 'br', element: 'Br', cartesian: [-1, 0, 0] },
    { id: 'h', element: 'H', cartesian: [0, -1, 0] },
    { id: 'singlet', element: 'C', cartesian: [3, 0, 0], radical: 'singlet' },
    { id: 'doublet', element: 'C', cartesian: [5, 0, 0], radical: 'doublet' },
    { id: 'triplet', element: 'C', cartesian: [7, 0, 0], radical: 'triplet' }
  ],
  bonds: ['f', 'cl', 'br', 'h'].map((id, i) => ({
    id: `bond-${id}`,
    order: 'single',
    endpoints: [endpoint('center'), endpoint(id)],
    ...(i === 0 ? { stereo: 'up' } : {})
  })),
  stereoAbsolute: true
}
const atomExpected = (atom, i) => ({
  fileAtomNumber: i + 1,
  element: atom.element,
  cartesian: atom.cartesian,
  formalCharge: atom.formalCharge ?? 0,
  isotope: atom.isotope ?? 0,
  radical: atom.radical ?? null,
  atomMap: atom.atomMap ?? 0,
  ...(atom.stereoParity ? { parityCode: 1 } : {})
})
const baseAtoms = molecule.atoms.map(atomExpected)
const baseBonds = [
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5]
].map((atoms, i) => ({ atoms, order: 'single', stereo: i === 0 ? 'up' : null }))
const expected = {
  schemaVersion: 1,
  provenance:
    'Project-authored analytical inputs. Expected values are declared from these inputs; no production reader or derivation generates the expectations.',
  molecules: [],
  poscar: {}
}
const files = new Map()
for (const [name, version] of [
  ['mol-v2000.mol', 'V2000'],
  ['mol-v3000.mol', 'V3000']
]) {
  const result = writeStructure(molecule, { format: 'mol', version })
  if (!result.text) throw new Error(JSON.stringify(result.diagnostics))
  files.set(name, result.text)
  expected.molecules.push({
    file: name,
    atoms: baseAtoms,
    bonds: baseBonds,
    stereoAbsolute: true,
    source: 'SDK writer from explicit authored snapshot'
  })
}
for (const version of ['v2000', 'v3000']) {
  const name = `mol-input-${version}.mol`
  files.set(
    name,
    await readFile(
      resolve(
        root,
        `packages/alchemion/src/formats/mol/__tests__/fixtures/properties-${version}.mol`
      ),
      'utf8'
    )
  )
  expected.molecules.push({
    file: name,
    atoms: [
      ...baseAtoms.map((atom, i) =>
        i === 0 ? { ...atom, parityCode: version === 'v2000' ? 1 : 2 } : atom
      ),
      {
        fileAtomNumber: 9,
        element: 'C',
        cartesian: [9, 0, 0],
        formalCharge: 0,
        isotope: 0,
        radical: null,
        atomMap: 0
      },
      {
        fileAtomNumber: 10,
        element: 'C',
        cartesian: [10, 0, 0],
        formalCharge: 0,
        isotope: 0,
        radical: null,
        atomMap: 0
      },
      {
        fileAtomNumber: 11,
        element: 'C',
        cartesian: [12, 0, 0],
        formalCharge: 0,
        isotope: 0,
        radical: null,
        atomMap: 0
      },
      {
        fileAtomNumber: 12,
        element: 'N',
        cartesian: [13, 0, 0],
        formalCharge: 0,
        isotope: 0,
        radical: null,
        atomMap: 0
      }
    ],
    bonds: [
      ...baseBonds,
      { atoms: [9, 10], order: 'double', stereo: 'either' },
      { atoms: [11, 12], order: 'triple', stereo: null }
    ],
    stereoAbsolute: true,
    source:
      'Hand-authored standards fixture; V3000 uses noncontinuous record IDs and a mid-token continuation'
  })
}
const periodic = {
  kind: 'periodic',
  cell: value(createCell({ a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 })),
  symmetry: { operations: [value(parseSymmetryOperation('x,y,z', 'id'))] },
  atoms: [{ id: 'p', element: 'C', fractional: [1.25, 0, 0] }],
  bonds: [
    { id: 'chain', order: 'single', endpoints: [endpoint('p', 'id'), endpoint('p', 'id', 1)] }
  ]
}
const finite = writeStructure(periodic, {
  format: 'mol',
  allowLoss: true,
  finite: { kind: 'instances', endpoints: [endpoint('p', 'id'), endpoint('p', 'id', 1)] }
})
if (!finite.text) throw new Error(JSON.stringify(finite.diagnostics))
files.set('finite.mol', finite.text)
expected.molecules.push({
  file: 'finite.mol',
  atoms: [
    {
      fileAtomNumber: 1,
      element: 'C',
      cartesian: [2.5, 0, 0],
      formalCharge: 0,
      isotope: 0,
      radical: null,
      atomMap: 0
    },
    {
      fileAtomNumber: 2,
      element: 'C',
      cartesian: [4.5, 0, 0],
      formalCharge: 0,
      isotope: 0,
      radical: null,
      atomMap: 0
    }
  ],
  bonds: [{ atoms: [1, 2], order: 'single', stereo: null }],
  stereoAbsolute: false,
  mapping: finite.atomMapping,
  lossCodes: finite.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.code),
  source: 'Explicit two-image crop of an analytical periodic chain'
})
const oblique = {
  kind: 'periodic',
  title: 'Alchemion authored oblique cell',
  cell: {
    basis: [
      [2, 0, 0],
      [1, 3, 0],
      [0.4, 0.7, 4]
    ]
  },
  atoms: [
    { id: 'o1', element: 'O', fractional: [1.25, -0.25, 0.5] },
    { id: 'c', element: 'C', fractional: [0.25, 0.5, 0.75] },
    { id: 'o2', element: 'O', fractional: [0.1, 0.2, 0.3] }
  ],
  bonds: []
}
const poscar = writeStructure(oblique, { format: 'poscar' })
if (!poscar.text) throw new Error(JSON.stringify(poscar.diagnostics))
files.set('POSCAR', poscar.text)
expected.poscar = {
  file: 'POSCAR',
  basis: [
    [2, 0, 0],
    [1, 3, 0],
    [0.4, 0.7, 4]
  ],
  species: ['O', 'O', 'C'],
  counts: [2, 1],
  fractional: [
    [1.25, -0.25, 0.5],
    [0.1, 0.2, 0.3],
    [0.25, 0.5, 0.75]
  ],
  source: 'Explicit analytical oblique basis; interleaved O/C/O input requires O/O/C output'
}
await mkdir(output, { recursive: true })
for (const [name, text] of files) await writeFile(resolve(output, name), text)
await writeFile(resolve(output, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`)
console.log(`Created ${files.size} authored format artifacts and expected.json once in ${output}`)
