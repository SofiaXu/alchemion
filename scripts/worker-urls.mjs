import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'

const distribution = fileURLToPath(new URL('../packages/alchemion/dist', import.meta.url))
const symmetry = fileURLToPath(
  new URL('../packages/alchemion/src/viewer/runtime/spglib', import.meta.url)
)
// Vite library mode wraps worker URLs in another URL and string coercion. A downstream
// bundler needs the native static constructor to discover nested Worker assets.
const wrappedURL =
  /new URL\(\s*(?:\/\*\s*@vite-ignore\s*\*\/\s*)?(?:["']{2}\s*\+\s*)?new URL\((['"])([^'"]+)\1,\s*import\.meta\.url\)\.href,\s*(?:["']{2}\s*\+\s*)?import\.meta\.url\s*\)/g
let normalized = 0
const workerAssets = new Set()
for (const name of await readdir(distribution, { recursive: true })) {
  if (!name.endsWith('.js')) continue
  const file = join(distribution, name)
  const source = await readFile(file, 'utf8')
  const output = source.replace(wrappedURL, (_match, _quote, asset) => {
    normalized++
    return `new URL(${JSON.stringify(asset)}, import.meta.url)`
  })
  if (output !== source) await writeFile(file, output)
  for (const match of output.matchAll(
    /new Worker\(\s*new URL\((['"])([^'"]+)\1,\s*import\.meta\.url\)/g
  )) {
    const asset = resolve(dirname(file), match[2])
    const local = relative(distribution, asset)
    if (local.startsWith('..') || isAbsolute(local) || !(await stat(asset)).isFile())
      throw new Error(`Missing or nonlocal module Worker asset: ${name} -> ${match[2]}`)
    workerAssets.add(local)
  }
}
if (
  !workerAssets.size ||
  ![...workerAssets].some((asset) => /computation-worker-.*\.js$/.test(asset))
)
  throw new Error('The declared computation Worker must have a static, existing module resource.')
console.log(`Verified ${workerAssets.size} module Worker resources; normalized ${normalized} URLs.`)

const manifestText = await readFile(join(symmetry, 'manifest.json'), 'utf8')
const manifest = JSON.parse(manifestText)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const licenses = join(distribution, 'spglib-notices')
await mkdir(licenses, { recursive: true })
for (const name of ['LICENSE.txt', 'TOOLCHAIN_LICENSES.txt']) {
  const bytes = await readFile(join(symmetry, name))
  if (sha256(bytes) !== manifest.files[name]) throw new Error(`spglib notice hash differs: ${name}`)
  await writeFile(join(licenses, name), bytes)
}
await writeFile(join(licenses, 'manifest.json'), manifestText)
const assets = (await readdir(join(distribution, 'assets'))).filter((name) =>
  /^spglib-.+\.wasm$/.test(name)
)
if (
  !(
    await Promise.all(
      assets.map(
        async (name) =>
          sha256(await readFile(join(distribution, 'assets', name))) ===
          manifest.files['spglib.wasm']
      )
    )
  ).some(Boolean)
)
  throw new Error('The compiled SDK is missing its pinned spglib WASM asset.')
