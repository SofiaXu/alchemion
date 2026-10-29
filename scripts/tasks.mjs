import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, cp, readdir, stat, mkdir } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createHash } from 'node:crypto'
import { resolve, dirname, join, extname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createServer, build as viteBuild } from 'vite'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.env.npm_execpath
const args = process.argv.slice(3)
const phase = args.find((arg) => arg.startsWith('--phase='))?.slice(8) ?? 'm6'
const browserFlags = args.filter((arg) => arg.startsWith('--project='))
const browserGrep = args.find((arg) => arg.startsWith('--grep='))?.slice(7)
const isPrepared = args.includes('--prepared')
if (!pnpm) throw new Error('Use pnpm to invoke this task.')
if (!['m1', 'm4', 'm5', 'm6'].includes(phase))
  throw new Error(`Unsupported phase ${phase}; historical M2 reproduction is available in Git.`)

export function run(command, cwd = root, env = {}) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [pnpm, ...command], {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) done()
      else reject(new Error(`pnpm ${command.join(' ')} failed (${code ?? signal})`))
    })
  })
}
async function sdk() {
  await run(['--filter', 'alchemion', 'build:source'])
}
async function types() {
  await run(['exec', 'tsc', '-p', 'packages/alchemion/tsconfig.core.json'])
  await run(['exec', 'tsc', '-p', 'tsconfig.json'])
}

/** Built files only, including nested URLs; no development-server source fallback. */
export async function host(directory, action, port = 4174, mount = '/') {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2'
  }
  const server = createHttpServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      if (!path.startsWith(mount)) {
        response.writeHead(404).end()
        return
      }
      const file = resolve(directory, path.slice(mount.length) || 'index.html')
      const local = relative(directory, file)
      if (local.startsWith('..') || isAbsolute(local)) {
        response.writeHead(403).end()
        return
      }
      const data = await readFile(file)
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store'
      })
      response.end(data)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  try {
    return await action(`http://127.0.0.1:${port}${mount}`)
  } finally {
    server.closeAllConnections()
    await new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())))
  }
}
const config = (selected) =>
  selected === 'm1' ? 'playwright.config.ts' : `playwright.${selected}.config.ts`
async function playwright(url, selected, grep, extraEnv = {}) {
  await run(
    [
      'exec',
      'playwright',
      'test',
      `--config=${config(selected)}`,
      '--grep',
      browserGrep ?? grep,
      ...browserFlags
    ],
    root,
    { [`${selected.toUpperCase()}_BASE_URL`]: url, ...extraEnv }
  )
}
async function buildHost(selected) {
  const directory = selected === 'm1' ? 'tests/host' : `tests/${selected}`
  const output = join(root, `.tmp/${selected}-host`)
  await viteBuild({
    configFile: false,
    root: join(root, directory),
    base: './',
    build: { target: 'es2022', outDir: output, emptyOutDir: true },
    worker: { format: 'es' }
  })
  return output
}
async function browser(selected = phase, preparedDemo = false) {
  if (selected === 'm6') {
    if (!preparedDemo) await run(['--filter', '@alchemion/demo', 'build'])
    await host(join(root, 'apps/demo/dist'), (url) => playwright(url, selected, '@demo'), 4178)
    return
  }
  const output = await buildHost(selected)
  await host(
    output,
    (url) => playwright(url, selected, '@workspace'),
    selected === 'm5' ? 4177 : selected === 'm4' ? 4176 : 4174
  )
}
async function verifyPublicTypes(directory) {
  const seen = new Set()
  const visit = async (path) => {
    if (seen.has(path)) return
    seen.add(path)
    const source = await readFile(path, 'utf8')
    if (/(?:from\s*|import\s*\()['"](?:three(?:\/|['"])|@babylonjs\/)/.test(source))
      throw new Error(`Engine type leaked through a public declaration: ${path}`)
    for (const match of source.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue
      const base = resolve(dirname(path), match[1])
      const next = await stat(`${base}.d.ts`).then(
        () => `${base}.d.ts`,
        () => join(base, 'index.d.ts')
      )
      const local = relative(join(directory, 'dist/types'), next)
      if (local.startsWith('..') || isAbsolute(local))
        throw new Error('Public declaration escaped its package.')
      await visit(next)
    }
  }
  for (const entry of ['core', 'formats', 'viewer'])
    await visit(join(directory, 'dist/types', entry, 'index.d.ts'))
}
const digest = (data) => createHash('sha256').update(data).digest('hex')
async function inspectPackage(directory, selected) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const expected = Object.fromEntries(
    ['core', 'formats', 'viewer'].map((entry) => [
      `./${entry}`,
      { types: `./dist/types/${entry}/index.d.ts`, import: `./dist/${entry}.js` }
    ])
  )
  if (JSON.stringify(manifest.exports) !== JSON.stringify(expected) || manifest.type !== 'module')
    throw new Error('Unexpected SDK exports or module type.')
  if (
    manifest.dependencies?.three !== '0.186.1' ||
    Object.keys(manifest.dependencies ?? {}).some((name) => name.startsWith('@babylonjs/'))
  )
    throw new Error('The SDK must declare the selected Three backend.')
  await verifyPublicTypes(directory)
  const files = await readdir(join(directory, 'dist'), { recursive: true })
  if (files.some((file) => /\.cjs$|__tests__|test-data|renderer-selection/.test(file)))
    throw new Error('Development or CJS files leaked into the tarball.')
  const hashes = {}
  for (const name of [
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'SCIENTIFIC_DATA_MANIFEST.json',
    'VDW_DATA_MANIFEST.json',
    'dist/FORMAT_DATA_MANIFEST.json'
  ]) {
    const installed = await readFile(join(directory, name))
    if (!installed.equals(await readFile(join(root, 'packages/alchemion', name))))
      throw new Error(`Packaged notice or manifest differs: ${name}`)
    hashes[name] = digest(installed)
    if (name.endsWith('.json')) JSON.parse(installed.toString('utf8'))
  }
  if (selected === 'm6') {
    const actual = (await readdir(directory)).sort()
    const allowed = [
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'SCIENTIFIC_DATA_MANIFEST.json',
      'VDW_DATA_MANIFEST.json',
      'dist',
      'package.json'
    ].sort()
    if (JSON.stringify(actual) !== JSON.stringify(allowed))
      throw new Error(`Unexpected package root: ${actual.join(', ')}`)
  }
  return { exports: manifest.exports, version: manifest.version, hashes, distFiles: files.sort() }
}
async function packaged(benchmarkOnly = false, selected = phase) {
  const consumer = await mkdtemp(join(tmpdir(), `alchemion-${selected}-consumer-`))
  await run(['pack', '--pack-destination', consumer], join(root, 'packages/alchemion'))
  const archive = (await readdir(consumer)).find((name) => name.endsWith('.tgz'))
  if (!archive) throw new Error('pnpm pack did not produce a tarball.')
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'alchemion-isolated-consumer',
      private: true,
      type: 'module',
      dependencies: { alchemion: `file:./${archive}` },
      devDependencies: { typescript: '5.9.3', vite: '7.3.5' }
    })
  )
  await writeFile(join(consumer, '.npmrc'), 'link-workspace-packages=false\n')
  let fixture = consumer
  if (selected === 'm6' && !benchmarkOnly) {
    fixture = join(consumer, 'host/consumer-m6')
    await cp(join(root, 'tests/consumer-m6'), fixture, { recursive: true })
    await mkdir(join(consumer, 'host/m5'), { recursive: true })
    await cp(join(root, 'tests/m5/resources.ts'), join(consumer, 'host/m5/resources.ts'))
  } else {
    await cp(
      join(
        root,
        benchmarkOnly ? 'tests/m5' : selected === 'm1' ? 'tests/host' : `tests/consumer-${selected}`
      ),
      consumer,
      { recursive: true }
    )
    if (benchmarkOnly)
      for (const file of ['core-only.ts', 'tsconfig.core-only.json'])
        await cp(join(root, 'tests/consumer-m5', file), join(consumer, file))
  }
  await run(
    [
      'install',
      '--prod=false',
      '--ignore-workspace',
      '--prefer-offline',
      '--fetch-timeout=30000',
      '--fetch-retries=1'
    ],
    consumer
  )
  const inspection = await inspectPackage(join(consumer, 'node_modules/alchemion'), selected)
  for (const [name, version] of [
    ['typescript', '5.9.3'],
    ['vite', '7.3.5']
  ]) {
    const installed = JSON.parse(
      await readFile(join(consumer, 'node_modules', name, 'package.json'))
    )
    if (installed.version !== version) throw new Error(`Unexpected consumer tool: ${name}`)
  }
  await run(
    [
      'exec',
      process.execPath,
      join(consumer, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--lib',
      'ES2022,DOM',
      join(fixture, 'main.ts')
    ],
    fixture
  )
  await run(
    [
      'exec',
      process.execPath,
      join(consumer, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(fixture, 'tsconfig.core-only.json')
    ],
    fixture
  )
  await run(
    [
      'exec',
      process.execPath,
      join(consumer, 'node_modules/vite/bin/vite.js'),
      'build',
      fixture,
      '--base',
      './',
      '--outDir',
      join(consumer, 'dist')
    ],
    fixture
  )
  const assets = await readdir(join(consumer, 'dist'), { recursive: true })
  if (!assets.some((name) => /computation-worker-.*\.js$/.test(name)))
    throw new Error('Required module Worker missing from the consumer production build.')
  const evidence = {
    consumer,
    archive: join(consumer, archive),
    tarballSha256: digest(await readFile(join(consumer, archive))),
    ...inspection
  }
  await mkdir(join(root, '.tmp'), { recursive: true })
  await writeFile(
    join(root, `.tmp/${selected}-package-inspection${benchmarkOnly ? '-bench' : ''}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`
  )
  if (benchmarkOnly) return { ...evidence, output: join(consumer, 'dist') }
  await host(
    join(consumer, 'dist'),
    (url) =>
      playwright(url, selected, '@package', {
        M6_REPORT_KIND: process.env.M6_REPORT_KIND ?? 'package'
      }),
    4179,
    selected === 'm6' ? '/installed/nested/' : '/'
  )
  console.log(`Isolated tarball consumer: ${consumer}`)
}
async function dev() {
  if (!isPrepared) await sdk()
  await run(['exec', process.execPath, join(root, 'scripts/demo-assets.mjs')])
  const watcher = await viteBuild({
    root: join(root, 'packages/alchemion'),
    build: { watch: {}, emptyOutDir: false }
  })
  const declarations = spawn(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '-p',
      'packages/alchemion/tsconfig.declarations.json',
      '--watch'
    ],
    { cwd: root, stdio: 'inherit' }
  )
  const server = await createServer({
    root: join(root, 'apps/demo'),
    server: { host: '127.0.0.1', port: 4180, strictPort: true }
  })
  await server.listen()
  server.printUrls()
  const stop = async () => {
    await watcher.close()
    declarations.kill()
    await server.close()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  if (args.includes('--smoke')) {
    try {
      await run(
        [
          'exec',
          'playwright',
          'test',
          '--config=playwright.m6.config.ts',
          '--grep',
          '@dev',
          '--project=chromium'
        ],
        root,
        { M6_BASE_URL: server.resolvedUrls.local[0], M6_REPORT_KIND: 'dev' }
      )
    } finally {
      await stop()
    }
  }
}
async function check(m1) {
  await run(['format:check'])
  await run(['lint'])
  await sdk()
  await run(['--filter', '@alchemion/demo', 'build'])
  await types()
  await run(['docs:check'])
  await run([
    'exec',
    'vitest',
    'run',
    ...(m1 ? ['packages/alchemion/src/formats/cif/__tests__'] : [])
  ])
  await browser(m1 ? 'm1' : 'm6', !m1)
  await packaged(false, m1 ? 'm1' : 'm6')
}
try {
  switch (process.argv[2]) {
    case 'dev':
      await dev()
      break
    case 'build':
      await sdk()
      await run(['--filter', '@alchemion/demo', 'build'])
      break
    case 'typecheck':
      await sdk()
      await types()
      break
    case 'browser':
      if (!isPrepared) await sdk()
      await browser()
      break
    case 'package':
      if (!isPrepared) await sdk()
      await packaged()
      break
    case 'check':
      await check(false)
      break
    case 'check:m1':
      await check(true)
      break
    case 'bench': {
      if (!isPrepared) await sdk()
      if (args.includes('--smoke')) {
        const { measure } = await import('./bench.mjs')
        await host(await buildHost('m1'), measure)
      } else {
        if (!['m5', 'm6'].includes(phase))
          throw new Error('Formal benchmark phase must be m5 or m6.')
        const consumer = await packaged(true)
        const { measure } = await import('./m5-bench.mjs')
        await host(consumer.output, (url) => measure(url, consumer), 4177)
      }
      break
    }
    default:
      throw new Error(`Unknown task: ${process.argv[2]}`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
