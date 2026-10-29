import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, cp, readdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createServer, build as viteBuild } from 'vite'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.env.npm_execpath
const browserFlags = process.argv.filter((arg) => arg.startsWith('--project='))
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
    run(['exec', 'playwright', 'test', '--grep', grep, ...browserFlags], root, { M1_BASE_URL: url })
  )
}

async function packaged() {
  const consumer = await mkdtemp(join(tmpdir(), 'alchemion-m1-consumer-'))
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
  await cp(join(root, 'tests/host'), consumer, { recursive: true })
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
  const files = await readdir(join(consumer, 'node_modules/alchemion/dist'), { recursive: true })
  if (files.some((file) => /\.cjs$|__tests__|test-data/.test(file))) {
    throw new Error('Development or CJS files leaked into the tarball.')
  }
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
      join(consumer, 'node_modules/vite/bin/vite.js'),
      'build',
      '--base',
      './'
    ],
    consumer
  )
  const assets = await readdir(join(consumer, 'dist'), { recursive: true })
  if (!assets.some((name) => /atom-worker-.*\.js$/.test(name))) {
    throw new Error('Nested module Worker missing from the consumer production build.')
  }
  // Serve only the consumer build. No workspace aliases or development server fallback.
  await host(join(consumer, 'dist'), (url) =>
    run(['exec', 'playwright', 'test', '--grep', '@package', ...browserFlags], root, {
      M1_BASE_URL: url
    })
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
        () => document.querySelector('#demo-status')?.textContent === 'completed'
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
    ...(m1
      ? [
          'packages/alchemion/src/formats/parsers/cif-parser/__tests__/index.test.ts',
          'packages/alchemion/src/formats/parsers/cif-parser/__tests__/cif-document-parser.test.ts'
        ]
      : [])
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
      if (!process.argv.includes('--prepared')) await sdk()
      await browser()
      break
    case 'package':
      if (!process.argv.includes('--prepared')) await sdk()
      await packaged()
      break
    case 'check':
      await check(false)
      break
    case 'check:m1':
      await check(true)
      break
    case 'bench': {
      await sdk()
      const { measure } = await import('./bench.mjs')
      await host(join(root, 'tests/host'), measure)
      break
    }
    default:
      throw new Error(`Unknown task: ${task}`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
