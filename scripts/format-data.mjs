import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const sdk = fileURLToPath(new URL('../packages/alchemion/', import.meta.url))
const hash = async (path) =>
  createHash('sha256')
    .update(await readFile(`${sdk}${path}`))
    .digest('hex')
const unicode = JSON.parse(await readFile(`${sdk}src/formats/cif/unicode-source.json`, 'utf8'))
const mol = JSON.parse(await readFile(`${sdk}src/formats/mol/reference-isotopes.json`, 'utf8'))
const manifest = {
  schemaVersion: 1,
  unicode: {
    ...unicode,
    distributedMappingSha256: await hash('src/formats/cif/unicode-case-fold.json')
  },
  ctfileReferenceMasses: {
    version: mol.version,
    sourceURL: mol.sourceURL,
    sourceSha256: mol.sha256,
    licenseURL: mol.licenseURL,
    licenseSha256: mol.licenseSha256,
    purpose: mol.purpose,
    distributedTableSha256: await hash('src/formats/mol/reference-isotopes.json')
  }
}
if ((await hash('src/formats/cif/UNICODE-LICENSE.txt')) !== unicode.licenseSha256)
  throw new Error('Unicode licence bytes do not match the recorded source.')
if ((await hash('src/formats/mol/RDKIT_LICENSE.txt')) !== mol.licenseSha256)
  throw new Error('RDKit licence bytes do not match the recorded source.')
await writeFile(`${sdk}dist/FORMAT_DATA_MANIFEST.json`, `${JSON.stringify(manifest, null, 2)}\n`)
