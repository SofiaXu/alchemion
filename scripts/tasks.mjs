import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, cp, readdir, stat } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createServer, build as viteBuild } from 'vite'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.env.npm_execpath
const browserFlags = process.argv.filter((arg) => arg.startsWith('--project='))
const browserGrep = process.argv.find((arg) => arg.startsWith('--grep='))?.slice('--grep='.length)
const phaseM2 = process.argv.includes('--phase=m2')
const phaseM4 = process.argv.includes('--phase=m4')
const phaseM5 = process.argv.includes('--phase=m5')
const isPrepared = process.argv.includes('--prepared')
if (!pnpm) throw new Error('Use pnpm to invoke this task.')

export function run(args, cwd = root, env = {}) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [pnpm, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) done()
      else reject(new Error(`pnpm ${args.join(' ')} failed (${code ?? signal})`))
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

export async function host(directory, action, port = 4174) {
  const server = await createServer({
    configFile: false,
    root: directory,
    server: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'warn'
  })
  await server.listen()
  try {
    return await action(`http://127.0.0.1:${port}`)
  } finally {
    await server.close()
  }
}

async function browser(directory = join(root, 'tests/host'), grep = '@workspace') {
  const output = join(root, '.tmp/workspace-host')
  await viteBuild({
    configFile: false,
    root: directory,
    base: './',
    build: { outDir: output, emptyOutDir: true }
  })
  await host(output, (url) =>
    run(['exec', 'playwright', 'test', '--grep', browserGrep ?? grep, ...browserFlags], root, {
      M1_BASE_URL: url
    })
  )
}

async function comparisonHost() {
  const output = join(root, '.tmp/m2-host')
  await viteBuild({
    configFile: false,
    root: join(root, 'tests/renderer-selection/host'),
    base: './',
    define: {
      'import.meta.env.M2_FUNCTIONAL_SOFTWARE': JSON.stringify(
        process.env.M2_FUNCTIONAL_SOFTWARE === '1' ||
          (process.env.CI && process.platform === 'linux') ||
          false
      )
    },
    build: { target: 'es2022', outDir: output, emptyOutDir: true },
    worker: { format: 'es' }
  })
  return output
}

async function comparisonBrowser() {
  const output = await comparisonHost()
  await host(
    output,
    (url) =>
      run(
        [
          'exec',
          'playwright',
          'test',
          '--config=playwright.m2.config.ts',
          ...(browserGrep ? ['--grep', browserGrep] : []),
          ...browserFlags
        ],
        root,
        {
          M2_BASE_URL: url
        }
      ),
    4175
  )
}

async function runtimeBrowser() {
  const output = join(root, '.tmp/m4-host')
  await viteBuild({
    configFile: false,
    root: join(root, 'tests/m4'),
    base: './',
    build: { target: 'es2022', outDir: output, emptyOutDir: true },
    worker: { format: 'es' }
  })
  await host(
    output,
    (url) =>
      run(
        [
          'exec',
          'playwright',
          'test',
          '--config=playwright.m4.config.ts',
          '--grep',
          browserGrep ?? '@workspace',
          ...browserFlags
        ],
        root,
        { M4_BASE_URL: url }
      ),
    4176
  )
}

async function viewerHost() {
  const output = join(root, '.tmp/m5-host')
  await viteBuild({
    configFile: false,
    root: join(root, 'tests/m5'),
    base: './',
    build: { target: 'es2022', outDir: output, emptyOutDir: true },
    worker: { format: 'es' }
  })
  return output
}

async function viewerBrowser() {
  const output = await viewerHost()
  await host(
    output,
    (url) =>
      run(
        [
          'exec',
          'playwright',
          'test',
          '--config=playwright.m5.config.ts',
          '--grep',
          browserGrep ?? '@workspace',
          ...browserFlags
        ],
        root,
        { M5_BASE_URL: url }
      ),
    4177
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
      if (match[1].startsWith('.')) {
        const base = resolve(dirname(path), match[1])
        const next = await stat(`${base}.d.ts`).then(
          () => `${base}.d.ts`,
          () => join(base, 'index.d.ts')
        )
        await visit(next)
      }
    }
  }
  for (const entry of ['core', 'formats', 'viewer'])
    await visit(join(directory, 'dist/types', entry, 'index.d.ts'))
}

async function packaged(benchmarkOnly = false) {
  const consumer = await mkdtemp(
    join(
      tmpdir(),
      phaseM5
        ? 'alchemion-m5-consumer-'
        : phaseM4
          ? 'alchemion-m4-consumer-'
          : 'alchemion-m1-consumer-'
    )
  )
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
  // Ignore the parent workspace, its source paths and its node_modules layout.
  await writeFile(join(consumer, '.npmrc'), 'link-workspace-packages=false\n')
  await cp(
    join(
      root,
      phaseM5
        ? benchmarkOnly
          ? 'tests/m5'
          : 'tests/consumer-m5'
        : phaseM4
          ? 'tests/consumer-m4'
          : 'tests/host'
    ),
    consumer,
    { recursive: true }
  )
  if (benchmarkOnly)
    for (const file of ['core-only.ts', 'tsconfig.core-only.json'])
      await cp(join(root, 'tests/consumer-m5', file), join(consumer, file))
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
  const manifest = JSON.parse(await readFile(join(consumer, 'node_modules/alchemion/package.json')))
  if (Object.keys(manifest.exports).join(',') !== './core,./formats,./viewer') {
    throw new Error('Unexpected SDK exports.')
  }
  if (phaseM5) {
    if (
      manifest.dependencies?.three !== '0.186.1' ||
      Object.keys(manifest.dependencies ?? {}).some((name) => name.startsWith('@babylonjs/'))
    )
      throw new Error('The formal SDK must declare exactly the selected Three backend.')
    await verifyPublicTypes(join(consumer, 'node_modules/alchemion'))
  }
  const files = await readdir(join(consumer, 'node_modules/alchemion/dist'), { recursive: true })
  if (files.some((file) => /\.cjs$|__tests__|test-data/.test(file))) {
    throw new Error('Development or CJS files leaked into the tarball.')
  }
  for (const notice of ['THIRD_PARTY_NOTICES.md', 'SCIENTIFIC_DATA_MANIFEST.json']) {
    await readFile(join(consumer, 'node_modules/alchemion', notice), 'utf8')
  }
  if (phaseM4 || phaseM5)
    await readFile(join(consumer, 'node_modules/alchemion/dist/FORMAT_DATA_MANIFEST.json'), 'utf8')
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
      'main.ts'
    ],
    consumer
  )
  await run(
    [
      'exec',
      process.execPath,
      join(consumer, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.core-only.json'
    ],
    consumer
  )
  await run(
    [
      'exec',
      process.execPath,
      join(consumer, 'node_modules/vite/bin/vite.js'),
      'build',
      '--base',
      './'
    ],
    consumer
  )
  const assets = await readdir(join(consumer, 'dist'), { recursive: true })
  const expectedWorker = /computation-worker-.*\.js$/
  if (!assets.some((name) => expectedWorker.test(name))) {
    throw new Error('Required module Worker missing from the consumer production build.')
  }
  if (benchmarkOnly)
    return { consumer, output: join(consumer, 'dist'), archive: join(consumer, archive) }
  // Serve only the consumer build. No workspace aliases or development server fallback.
  await host(join(consumer, 'dist'), (url) =>
    run(
      [
        'exec',
        'playwright',
        'test',
        ...(phaseM5
          ? ['--config=playwright.m5.config.ts']
          : phaseM4
            ? ['--config=playwright.m4.config.ts']
            : []),
        '--grep',
        browserGrep ?? '@package',
        ...browserFlags
      ],
      root,
      {
        [phaseM5 ? 'M5_BASE_URL' : phaseM4 ? 'M4_BASE_URL' : 'M1_BASE_URL']: url
      }
    )
  )
  console.log(`Isolated tarball consumer: ${consumer}`)
}

async function dev() {
  await sdk()
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
    server: { host: '127.0.0.1' }
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
  if (process.argv.includes('--smoke')) {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(server.resolvedUrls.local[0])
      await page.waitForFunction(
        () => document.querySelector('#demo-status')?.textContent === 'ready'
      )
      if (errors.length) throw new Error(errors.join('\n'))
      console.log('Clean dev entry: demo completed a real SDK Worker load.')
    } finally {
      await browser.close()
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
  await browser()
  await packaged()
}

const task = process.argv[2]
try {
  switch (task) {
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
      if (phaseM2) await comparisonBrowser()
      else {
        if (!isPrepared) await sdk()
        if (phaseM5) await viewerBrowser()
        else if (phaseM4) await runtimeBrowser()
        else await browser()
      }
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
      if (phaseM5) {
        if (!isPrepared) await sdk()
        const packagedViewer = await packaged(true)
        const { measure } = await import('./m5-bench.mjs')
        await host(packagedViewer.output, (url) => measure(url, packagedViewer), 4177)
      } else if (process.argv.includes('--renderer-selection')) {
        if (process.argv.includes('--resources-only')) {
          const { auditResources } = await import('./renderer-resources.mjs')
          await auditResources()
        } else {
          const output = await comparisonHost()
          const { measure } = await import('./renderer-selection.mjs')
          await host(output, measure, 4175)
        }
      } else {
        await sdk()
        const { measure } = await import('./bench.mjs')
        await host(join(root, 'tests/host'), measure)
      }
      break
    }
    default:
      throw new Error(`Unknown task: ${task}`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
