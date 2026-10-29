import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const distribution = fileURLToPath(new URL('../packages/alchemion/dist', import.meta.url))
// Vite library mode wraps worker URLs in a string concatenation. A downstream
// bundler needs the native static constructor to discover nested Worker assets.
const wrappedURL =
  /new URL\(\s*(?:\/\*\s*@vite-ignore\s*\*\/\s*)?["']{2}\s*\+\s*new URL\((['"])([^'"]+)\1,\s*import\.meta\.url\)\.href,\s*import\.meta\.url\s*\)/g
let normalized = 0
for (const name of await readdir(distribution, { recursive: true })) {
  if (!name.endsWith('.js')) continue
  const file = join(distribution, name)
  const source = await readFile(file, 'utf8')
  const output = source.replace(wrappedURL, (_match, _quote, asset) => {
    normalized++
    return `new URL(${JSON.stringify(asset)}, import.meta.url)`
  })
  if (output !== source) await writeFile(file, output)
}
const valid = process.argv.includes('--watch')
  ? normalized >= 1 && normalized <= 2
  : normalized === 2
if (!valid)
  throw new Error(
    `Expected two module Worker URLs (or one cached watch update), found ${normalized}.`
  )
console.log(`Normalized ${normalized} static module Worker URLs for downstream bundlers.`)
