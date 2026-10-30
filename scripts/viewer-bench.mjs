import { chromium } from '@playwright/test'
import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import os from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, '.tmp/bench/viewer')
const args = process.argv.slice(2)
const option = (name, fallback) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}
const released = (counts) =>
  counts &&
  ['gpuObjects', 'workers', 'rafs', 'observers', 'listeners', 'canvases'].every(
    (key) => counts[key] === 0
  )
async function files(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    paths.push(...(entry.isDirectory() ? await files(path) : [path]))
  }
  return paths
}
async function sourceHash() {
  const hash = createHash('sha256')
  for (const path of [
    ...(await files(join(root, 'packages/alchemion/src'))),
    ...(await files(join(root, 'tests/viewer'))),
    join(root, 'tests/shared/resources.ts'),
    join(root, 'scripts/viewer-bench.mjs'),
    join(root, 'pnpm-lock.yaml')
  ].sort()) {
    hash.update(relative(root, path).replaceAll('\\', '/'))
    hash.update(await readFile(path))
  }
  return hash.digest('hex')
}
function hardware() {
  if (process.platform !== 'win32') return {}
  return JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$ErrorActionPreference='Stop'
$r=[ordered]@{gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion);battery=@(Get-CimInstance Win32_Battery | Select-Object BatteryStatus,EstimatedChargeRemaining);power=(powercfg /getactivescheme | Out-String).Trim()}
$r | ConvertTo-Json -Depth 4 -Compress`
      ],
      { encoding: 'utf8' }
    )
  )
}
async function assets(consumer, fixture) {
  const sdk = []
  const sdkDirectory = join(consumer, 'node_modules/alchemion')
  for (const path of await files(join(sdkDirectory, 'dist'))) {
    const content = await readFile(path)
    sdk.push({
      file: relative(sdkDirectory, path).replaceAll('\\', '/'),
      bytes: content.length,
      gzipBytes: gzipSync(content, { level: 9 }).length
    })
  }
  const variants = {
    sdk: {
      assets: sdk,
      bytes: sdk.reduce((sum, asset) => sum + asset.bytes, 0),
      gzipBytes: sdk.reduce((sum, asset) => sum + asset.gzipBytes, 0)
    },
    note: 'SDK assets report actual installed package contents. Consumer variants include the acceptance host; the separate Three chunk and module Worker assets show runtime dependency cost.'
  }
  for (const variant of ['raw', 'minified']) {
    const directory = join(output, 'artifacts', variant)
    const result = await build({
      configFile: false,
      root: fixture,
      base: './',
      logLevel: 'warn',
      build: {
        target: 'es2022',
        outDir: directory,
        emptyOutDir: true,
        minify: variant === 'raw' ? false : 'oxc',
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }]
            }
          }
        }
      },
      worker: { format: 'es' }
    })
    const assets = []
    for (const path of await files(directory)) {
      const content = await readFile(path)
      assets.push({
        file: relative(directory, path).replaceAll('\\', '/'),
        bytes: content.length,
        gzipBytes: gzipSync(content, { level: 9 }).length
      })
    }
    const chunks = (Array.isArray(result) ? result : [result])
      .flatMap((bundle) => bundle.output ?? [])
      .filter((chunk) => chunk.type === 'chunk')
    variants[variant] = {
      assets,
      bytes: assets.reduce((sum, a) => sum + a.bytes, 0),
      gzipBytes: assets.reduce((sum, a) => sum + a.gzipBytes, 0),
      engine: assets.filter((a) => /three-.*\.js$/.test(a.file)),
      workers: assets.filter((a) => /computation-worker-.*\.js$/.test(a.file)),
      modules: [...new Set(chunks.flatMap((chunk) => Object.keys(chunk.modules)))]
        .map((path) => relative(consumer, path).replaceAll('\\', '/'))
        .sort()
    }
  }
  await writeFile(join(output, 'artifacts.json'), JSON.stringify(variants, null, 2) + '\n')
  return variants
}
async function clicks(page, count = 200) {
  const targets = await page.evaluate((n) => window.viewerHarness.benchTargets(n), count),
    times = [],
    results = []
  let pending
  await page.exposeBinding('__viewerSelection', (_source, result) => {
    if (pending) {
      const current = pending
      pending = undefined
      current.resolve({ ...result, latencyMs: performance.now() - current.start })
    }
  })
  for (const target of targets) {
    await page.mouse.move(target.x, target.y)
    let timer
    try {
      const receive = new Promise((resolve, reject) => {
        pending = { start: performance.now(), resolve }
        timer = setTimeout(
          () => reject(new Error('A benchmark click did not produce selection feedback')),
          5000
        )
      })
      await page.mouse.down()
      await page.mouse.up()
      const selected = await receive
      const correct =
        selected.selection?.kind === 'atom' &&
        selected.selection.instance.sourceAtomId === target.sourceId
      times.push(selected.latencyMs)
      results.push({
        expected: target.sourceId,
        actual: selected.selection,
        correct,
        latencyMs: selected.latencyMs
      })
    } finally {
      clearTimeout(timer)
      pending = undefined
    }
  }
  return {
    times,
    results,
    correct: results.length === count && results.every((r) => r.correct),
    p95Ms: percentile(times, 0.95)
  }
}
async function sample(url, mode, round, common) {
  const id = `${mode}-r${round}`,
    path = join(output, `${id}.json`),
    result = { id, mode, round, ...common, startedAt: new Date().toISOString() }
  let browser
  try {
    browser = await chromium.launch({
      channel: 'chromium',
      headless: true,
      args: ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
    })
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.location().url?.endsWith('/favicon.ico'))
        errors.push(message.text())
    })
    await page.goto(url)
    await page.waitForFunction(() => !!window.viewerHarness)
    result.browser = browser.version()
    result.load = await page.evaluate((mode) => window.viewerHarness.benchLoad(mode), mode)
    if (!result.load.render) throw new Error('Production renderer timing was not emitted')
    if (/SwiftShader|llvmpipe|software|Basic Render/i.test(result.load.webgl.renderer))
      throw new Error(`Hardware GPU is required; got ${result.load.webgl.renderer}`)
    const session = await browser.newBrowserCDPSession()
    result.systemGpu = (await session.send('SystemInfo.getInfo')).gpu
    await page.screenshot({ path: join(output, `${id}.png`) })
    const interaction = await page.evaluate(() => window.viewerHarness.interact(10000, 60000))
    result.interaction = {
      ...interaction,
      medianFps: 1000 / percentile(interaction.times, 0.5),
      frameTimeP95Ms: percentile(interaction.times, 0.95)
    }
    result.clicks = await clicks(page)
    result.updates = await page.evaluate(() => window.viewerHarness.updates(100))
    result.updates.p95Ms = percentile(result.updates.times, 0.95)
    result.updates.endToEndP95Ms = percentile(result.updates.endToEndTimes, 0.95)
    result.updateProbe = await page.evaluate(() => window.viewerHarness.updateProbe())
    result.disposed = await page.evaluate(() => window.viewerHarness.dispose())
    result.lifecycle = await page.evaluate(
      (mode) => window.viewerHarness.lifecycle(20, true, mode),
      mode
    )
    result.errors = errors
    result.gates = {
      count:
        result.load.atoms === 10000 &&
        result.load.sourceBonds === 20000 &&
        result.load.render.detail.atoms === 10000 &&
        result.load.render.detail.bonds === (mode === 'ball-and-stick' ? 20000 : 0),
      firstFrame: result.load.render.duration <= 5000,
      interaction: result.interaction.medianFps >= 30,
      picking:
        result.clicks.correct && result.clicks.times.length === 200 && result.clicks.p95Ms <= 100,
      updates:
        result.updates.correct &&
        result.updateProbe.correct &&
        result.updates.times.length === 100 &&
        result.updates.dirtyAtomCounts.every((n) => n === 100) &&
        result.updates.p95Ms <= 100,
      lifecycle:
        result.lifecycle.length === 20 &&
        result.lifecycle.every((entry) => released(entry.after)) &&
        released(result.disposed),
      browserErrors: errors.length === 0 && result.load.webgl.error === 0
    }
    result.passed = Object.values(result.gates).every(Boolean)
    result.status = 'measured'
    result.completedAt = new Date().toISOString()
  } catch (error) {
    result.status = 'failed'
    result.error = error.stack ?? String(error)
  } finally {
    await browser?.close()
    await writeFile(path, JSON.stringify(result, null, 2) + '\n')
  }
  console.log(
    JSON.stringify({
      event: 'viewer-run',
      id,
      status: result.status,
      firstFrameMs: result.load?.render?.duration,
      medianFps: result.interaction?.medianFps,
      pickP95Ms: result.clicks?.p95Ms,
      updateP95Ms: result.updates?.p95Ms,
      gates: result.gates,
      error: result.error,
      file: path
    })
  )
  return result
}
export async function measure(url, packaged) {
  await mkdir(output, { recursive: true })
  const lockPath = join(root, '.tmp/bench/formal-viewer.lock'),
    lock = await open(lockPath, 'wx')
  await lock.writeFile(String(process.pid))
  try {
    const common = {
      sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8'
      }).trim(),
      sourceHash: await sourceHash(),
      tarballSha256: createHash('sha256')
        .update(await readFile(packaged.archive))
        .digest('hex'),
      node: process.version,
      os: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
      logicalProcessors: os.cpus().length,
      totalMemory: os.totalmem(),
      hardware: hardware(),
      parallelism: 1,
      purpose: 'T-PERF-01 formal viewer via isolated installed tarball',
      fixture: {
        sourceCount: 10000,
        displayCount: 10000,
        bonds: 20000,
        expansion:
          'identity only; deterministic legal molecular source, not a smaller-source symmetry expansion'
      }
    }
    if (!args.includes('--skip-artifacts')) await assets(packaged.consumer, packaged.fixture)
    if (args.includes('--artifacts-only')) return
    const mode = option('mode', 'all'),
      round = option('round', 'all')
    if (
      !['all', 'space-filling', 'ball-and-stick'].includes(mode) ||
      !['all', '1', '2', '3'].includes(round)
    )
      throw new Error('Invalid mode or round filter')
    const results = []
    for (let r = 1; r <= 3; r++)
      for (const display of ['space-filling', 'ball-and-stick']) {
        if ((round !== 'all' && String(r) !== round) || (mode !== 'all' && display !== mode))
          continue
        const id = `${display}-r${r}`
        if (args.includes('--resume')) {
          try {
            const existing = JSON.parse(await readFile(join(output, `${id}.json`), 'utf8'))
            if (
              existing.sourceHash !== common.sourceHash ||
              existing.tarballSha256 !== common.tarballSha256
            )
              throw new Error(
                'Source or packaged input changed; archive previous evidence before resuming'
              )
            if (existing.status === 'measured' && existing.passed) {
              results.push(existing)
              continue
            }
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
        }
        results.push(await sample(url, display, r, common))
      }
    await writeFile(
      join(output, 'runs.json'),
      JSON.stringify(
        { ...common, runs: results.map(({ id, status, passed }) => ({ id, status, passed })) },
        null,
        2
      ) + '\n'
    )
    if (results.some((result) => result.status !== 'measured' || !result.passed))
      throw new Error('Performance gates failed; inspect saved results')
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}
