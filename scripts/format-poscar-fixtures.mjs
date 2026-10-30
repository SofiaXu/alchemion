import { access, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStructure, writeStructure } from '../packages/alchemion/dist/formats.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, '.tmp/format-reference')
// Authored arithmetic, independent of the SDK's cell/coordinate implementation.
const basis = [
  [2, 0, 0],
  [1, 3, 0],
  [0.4, 0.7, 4]
]
const doubled = [
  [4, 0, 0],
  [2, 6, 0],
  [0.8, 1.4, 8]
]
const componentScaled = [
  [4, 0, 0],
  [2, 9, 0],
  [0.8, 2.1, 16]
]
const fractional = [
  [0.25, 0.5, 0.75],
  [1.25, -0.25, 0.5]
]
const specifications = [
  ['direct', '1', 'Direct', ['0.25 0.5 0.75', '1.25 -0.25 0.5'], basis],
  ['positive-cartesian', '2', 'Cartesian', ['1.3 2.025 3', '2.45 -0.4 2'], doubled],
  ['negative-volume', '-192', 'Cartesian', ['1.3 2.025 3', '2.45 -0.4 2'], doubled],
  ['component-cartesian', '2 3 4', 'Cartesian', ['1.3 2.025 3', '2.45 -0.4 2'], componentScaled],
  ['component-direct', '2 3 4', 'Direct', ['0.25 0.5 0.75', '1.25 -0.25 0.5'], componentScaled]
]
const manifestName = 'poscar-import-expected.json'
const files = new Map()
const cases = []
for (const [name, scaling, mode, coordinates, expectedBasis] of specifications) {
  const inputName = `poscar-import-${name}.vasp`
  const outputName = `poscar-import-${name}-output.vasp`
  const text = [
    `Authored POSCAR ${name}`,
    scaling,
    '2 0 0',
    '1 3 0',
    '0.4 0.7 4',
    'C O',
    '1 1',
    mode,
    ...coordinates,
    ''
  ].join('\n')
  const parsed = parseStructure(text, { format: 'poscar' })
  if (parsed.structure?.kind !== 'periodic') throw new Error(JSON.stringify(parsed.diagnostics))
  const written = writeStructure(parsed.structure, { format: 'poscar' })
  if (!written.text) throw new Error(JSON.stringify(written.diagnostics))
  const expected = { basis: expectedBasis, fractional, species: ['C', 'O'] }
  cases.push({
    file: inputName,
    ...expected,
    sdkParsed: {
      basis: parsed.structure.cell.basis,
      fractional: parsed.structure.atoms.map((atom) => atom.fractional),
      species: parsed.structure.atoms.map((atom) => atom.element)
    }
  })
  cases.push({ file: outputName, ...expected })
  files.set(inputName, text)
  files.set(outputName, written.text)
}
files.set(
  manifestName,
  JSON.stringify(
    {
      provenance:
        'Authored oblique basis and positions: volume 24; -192 implies scale 2. Cartesian inputs are explicit arithmetic A*f. Three factors scale x/y/z components, not lattice columns. Expected values are not generated with SDK mathematical functions.',
      cases
    },
    null,
    2
  ) + '\n'
)
for (const name of files.keys())
  if (
    await access(resolve(output, name)).then(
      () => true,
      () => false
    )
  )
    throw new Error(`Refusing to overwrite an existing reference artifact: ${name}`)
await mkdir(output, { recursive: true })
for (const [name, text] of files) await writeFile(resolve(output, name), text)
console.log(
  `Created ${cases.length} POSCAR input/output references and ${manifestName} in ${output}`
)
