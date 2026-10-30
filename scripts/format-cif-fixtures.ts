/** Export project-authored representative CIF inputs/outputs; independent tools own validation. */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  parseStructure,
  writeStructure,
  parseCifDocument,
  writeCifDocument
} from '../packages/alchemion/dist/formats.js'
import {
  referenceCases,
  cif2Document
} from '../packages/alchemion/src/formats/cif/__tests__/fixtures.ts'

const directory = resolve('.tmp/format-reference/cif')
await mkdir(resolve(directory, 'inputs'), { recursive: true })
await mkdir(resolve(directory, 'outputs'), { recursive: true })
const cases = []
for (const fixture of referenceCases) {
  const inputFile = `cif/inputs/${fixture.name}.cif`
  await writeFile(resolve(directory, 'inputs', `${fixture.name}.cif`), fixture.text)
  const parsed = parseStructure(fixture.text, { format: 'cif' })
  if (!parsed.structure) throw new Error(JSON.stringify(parsed.diagnostics))
  const outputFiles = []
  for (const version of ['1', '2']) {
    const output = writeStructure(parsed.structure, { format: 'cif', version })
    if (!output.text) throw new Error(JSON.stringify(output.diagnostics))
    const filename = `${fixture.name}-v${version}.cif`
    await writeFile(resolve(directory, 'outputs', filename), output.text)
    outputFiles.push(`cif/outputs/${filename}`)
  }
  cases.push({ name: fixture.name, inputFile, outputFiles, expected: fixture.expected })
}
await writeFile(resolve(directory, 'inputs', 'document-v2.cif'), cif2Document)
const document = parseCifDocument(cif2Document)
if (!document.document) throw new Error(JSON.stringify(document.diagnostics))
const writtenDocument = writeCifDocument(document.document)
if (!writtenDocument.text) throw new Error(JSON.stringify(writtenDocument.diagnostics))
await writeFile(resolve(directory, 'outputs', 'document-v2.cif'), writtenDocument.text)
await writeFile(
  resolve('.tmp/format-reference/cif-expected.json'),
  JSON.stringify(
    {
      provenance:
        'Project-authored analytical CIF fixtures; MIT. Expected values are arithmetic input truths, not production output.',
      cases,
      document: {
        inputFile: 'cif/inputs/document-v2.cif',
        outputFile: 'cif/outputs/document-v2.cif',
        expected: {
          block: 'Unicode_😀',
          prefixedText: ';embedded\ntext',
          tripleText: 'A multiline\nUnicode α value'
        }
      }
    },
    null,
    2
  ) + '\n'
)
console.log(`CIF independent-reference files: ${directory}`)
