import { chromium } from '@playwright/test'
import { build, createServer } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// CDP reads browser event-listener registrations without patching global objects.
async function globalListeners(session) {
  const result = {}
  try {
    for (const name of ['window', 'document', 'navigator']) {
      const object = await session.send('Runtime.evaluate', {
        expression: name,
        objectGroup: 'm2-listeners'
      })
      const { listeners } = await session.send('DOMDebugger.getEventListeners', {
        objectId: object.result.objectId
      })
      const counts = {}
      for (const listener of listeners) {
        const key = [
          listener.type,
          listener.useCapture,
          listener.passive,
          listener.once,
          listener.scriptId,
          listener.lineNumber,
          listener.columnNumber
        ].join(':')
        counts[key] = (counts[key] ?? 0) + 1
      }
      result[name] = Object.fromEntries(
        Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
      )
    }
  } finally {
    await session.send('Runtime.releaseObjectGroup', { objectGroup: 'm2-listeners' })
  }
  return result
}

export async function auditResources() {
  const requestedRef =
    process.argv.find((arg) => arg.startsWith('--source-ref='))?.slice('--source-ref='.length) ??
    'HEAD'
  const revision = execFileSync('git', ['rev-parse', '--verify', `${requestedRef}^{commit}`], {
    cwd: root,
    encoding: 'utf8'
  }).trim()
  const directory = join(root, `.tmp/m2-resource-audit-${revision.slice(0, 7)}`)
  const paths = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', revision, '--', 'tests/renderer-selection'],
    { cwd: root, encoding: 'utf8' }
  )
    .trim()
    .split(/\r?\n/)
  for (const path of paths) {
    const target = resolve(directory, path)
    if (!target.startsWith(directory + '\\') && !target.startsWith(directory + '/'))
      throw new Error('Invalid audit source path.')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, execFileSync('git', ['show', `${revision}:${path}`], { cwd: root }))
  }
  const originalManifest = JSON.parse(
    execFileSync('git', ['show', `${revision}:package.json`], { cwd: root, encoding: 'utf8' })
  )
  const dependencies = Object.fromEntries(
    ['three', '@babylonjs/core']
      .filter((name) => originalManifest.devDependencies[name])
      .map((name) => [name, originalManifest.devDependencies[name]])
  )
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies })
  )
  // A scratch consumer installs exact archived candidates; the current SDK's
  // dependencies and the final selected-backend tree are left unchanged.
  execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      'install',
      '--ignore-workspace',
      '--prod=false',
      '--prefer-offline',
      '--fetch-retries=1'
    ],
    { cwd: directory, env: process.env, stdio: 'inherit' }
  )
  const output = join(directory, 'dist')
  await build({
    configFile: false,
    root: join(directory, 'tests/renderer-selection/host'),
    base: './',
    logLevel: 'warn',
    build: { target: 'es2022', outDir: output, emptyOutDir: true },
    worker: { format: 'es' }
  })
  const server = await createServer({
    configFile: false,
    root: output,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 4177, strictPort: true }
  })
  const results = {
    purpose: 'Supplemental global-listener ownership audit; no performance resampling',
    sourceRevision: revision,
    dependencies,
    cases: []
  }
  let browser
  try {
    await server.listen()
    browser = await chromium.launch({
      channel: 'chromium',
      args: ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
    })
    results.browser = browser.version()
    const candidates = ['three', 'babylon'].filter((name) =>
      paths.includes(`tests/renderer-selection/${name}.ts`)
    )
    for (const candidate of candidates) {
      for (const mode of ['space-filling', 'ball-and-stick']) {
        const page = await browser.newPage({
          viewport: { width: 1920, height: 1080 },
          deviceScaleFactor: 1
        })
        const session = await page.context().newCDPSession(page)
        await page.goto('http://127.0.0.1:4177')
        await page.waitForFunction(() => !!window.m2)
        const baseline = await globalListeners(session)
        const record = { candidate, mode, baseline, rounds: [] }
        for (let round = 1; round <= 20; round++) {
          const loaded = await page.evaluate(
            ({ candidate, mode }) => window.m2.load(candidate, mode),
            { candidate, mode }
          )
          const during = await globalListeners(session)
          const local = await page.evaluate(() => window.m2.dispose())
          const after = await globalListeners(session)
          const passed = JSON.stringify(after) === JSON.stringify(baseline)
          record.rounds.push({
            round,
            fixtureHash: loaded.fixture.hash,
            during,
            local,
            after,
            passed
          })
          if (!passed)
            throw new Error(`Global event listeners accumulated: ${candidate}/${mode}/${round}`)
        }
        results.cases.push(record)
        await session.detach()
        await page.close()
        console.log(
          JSON.stringify({ event: 'global-resources', candidate, mode, rounds: 20, passed: true })
        )
      }
    }
    results.passed =
      results.cases.length > 0 &&
      results.cases.every(
        (item) => item.rounds.length === 20 && item.rounds.every((round) => round.passed)
      )
  } finally {
    await browser?.close()
    await server.close()
    await mkdir(join(root, '.tmp/bench/m2'), { recursive: true })
    await writeFile(
      join(root, '.tmp/bench/m2/global-resources.json'),
      JSON.stringify(results, null, 2) + '\n'
    )
  }
}
