import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const sdk = join(root, 'packages/alchemion')
const output = join(root, 'apps/demo/public/generated')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const inputs = {}
async function source(path) {
  const bytes = await readFile(path)
  inputs[relative(root, path).replaceAll('\\', '/')] = sha256(bytes)
  return bytes.toString('utf8')
}
const scientific = JSON.parse(await source(join(sdk, 'SCIENTIFIC_DATA_MANIFEST.json')))
const vdw = JSON.parse(await source(join(sdk, 'VDW_DATA_MANIFEST.json')))
const formats = JSON.parse(await source(join(sdk, 'dist/FORMAT_DATA_MANIFEST.json')))
for (const manifest of [scientific, vdw])
  for (const [path, hash] of Object.entries(manifest.outputs))
    if (sha256(await readFile(resolve(root, path))) !== hash)
      throw new Error(`Scientific output differs from its manifest: ${path}`)
for (const [path, hash] of [
  ['src/formats/cif/unicode-case-fold.json', formats.unicode.distributedMappingSha256],
  ['src/formats/cif/UNICODE-LICENSE.txt', formats.unicode.licenseSha256],
  ['src/formats/mol/reference-isotopes.json', formats.ctfileReferenceMasses.distributedTableSha256],
  ['src/formats/mol/RDKIT_LICENSE.txt', formats.ctfileReferenceMasses.licenseSha256],
  ['src/core/data/VDW_LICENSE.txt', vdw.sources.LICENSE.sha256]
])
  if (sha256(await readFile(join(sdk, path))) !== hash)
    throw new Error(`Distributed data or licence differs from its manifest: ${path}`)
await source(join(root, 'apps/demo/src/samples.ts'))
const three = resolve(dirname(fileURLToPath(import.meta.resolve('three'))), '..')
const threeManifest = JSON.parse(await readFile(join(three, 'package.json'), 'utf8'))
if (threeManifest.version !== '0.186.1') throw new Error('Unexpected Three version in demo assets.')
const notices = [
  'Alchemion demo — offline licence and scientific data notices',
  'Built-in CIF/MOL examples are project-authored analytic structures under the project MIT licence; they are not experimental database records.',
  '\n=== Alchemion MIT licence ===\n',
  await source(join(sdk, 'LICENSE')),
  '\n=== Scientific data and format notices ===\n',
  await source(join(sdk, 'THIRD_PARTY_NOTICES.md')),
  '\n=== Three.js 0.186.1 full licence ===\n',
  await source(join(three, 'LICENSE'))
].join('\n')
const data = {
  schemaVersion: 1,
  samples: {
    source: 'apps/demo/src/samples.ts',
    author: 'Alchemion project',
    license: 'MIT',
    sha256: inputs['apps/demo/src/samples.ts']
  },
  manifests: { scientific, vdw, formats },
  sourceHashes: inputs
}
await mkdir(output, { recursive: true })
await writeFile(join(output, 'notices.txt'), notices)
await writeFile(join(output, 'data-manifests.json'), `${JSON.stringify(data, null, 2)}\n`)
await mkdir(join(root, '.tmp'), { recursive: true })
const outputs = {}
for (const file of ['notices.txt', 'data-manifests.json'])
  outputs[`apps/demo/public/generated/${file}`] = sha256(await readFile(join(output, file)))
await writeFile(
  join(root, '.tmp/demo-assets.json'),
  `${JSON.stringify({ inputs, outputs }, null, 2)}\n`
)
console.log('Verified scientific data hashes and generated offline demo notices/manifests.')
