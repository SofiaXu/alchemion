import { chromium } from '@playwright/test'
import { build, createServer } from 'vite'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import os from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetRoot = join(root, '.tmp/bench/m2')
const args = process.argv.slice(2)
const option = (name, fallback) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const modes = ['space-filling', 'ball-and-stick']

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await files(path)))
    else result.push(path)
  }
  return result
}

async function candidateNames() {
  const names = []
  for (const name of ['three', 'babylon']) {
    try {
      await stat(join(root, `tests/renderer-selection/${name}.ts`))
      names.push(name)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return names
}

function sourceRevision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

async function sourceHash() {
  const paths = [
    ...(await files(join(root, 'tests/renderer-selection'))),
    join(root, 'scripts/renderer-selection.mjs'),
    join(root, 'pnpm-lock.yaml')
  ].sort()
  const hash = createHash('sha256')
  for (const path of paths) {
    hash.update(relative(root, path).replaceAll('\\', '/'))
    hash.update(await readFile(path))
  }
  return hash.digest('hex')
}

function windowsEnvironment() {
  if (process.platform !== 'win32') return {}
  const script = [
    '$ErrorActionPreference="Stop"',
    '$r=[ordered]@{',
    'gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)',
    'battery=@(Get-CimInstance Win32_Battery | Select-Object BatteryStatus,EstimatedChargeRemaining)',
    'power=(powercfg /getactivescheme | Out-String).Trim()',
    '}',
    '$r | ConvertTo-Json -Depth 4 -Compress'
  ].join('\n')
  return JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' })
  )
}

export async function artifacts() {
  const candidates = await candidateNames()
  const report = {
    sourceRevision: sourceRevision(),
    sourceHash: await sourceHash(),
    settings: {
      target: 'es2022',
      format: 'es',
      treeShaking: true,
      minifier: 'esbuild',
      gzipLevel: 9
    },
    candidates: {}
  }
  for (const candidate of candidates) {
    const entry = join(root, `tests/renderer-selection/consumer-${candidate}.ts`)
    const versions = {
      three: 'three',
      babylon: '@babylonjs/core'
    }
    const manifest = JSON.parse(
      await readFile(join(root, 'node_modules', versions[candidate], 'package.json'), 'utf8')
    )
    const ownSource = await readFile(join(root, `tests/renderer-selection/${candidate}.ts`), 'utf8')
    const result = {
      version: manifest.version,
      adapterFile: `tests/renderer-selection/${candidate}.ts`,
      effectiveLines: ownSource
        .split(/\r?\n/)
        .filter((line) => line.trim() && !/^\s*(\/\/|\/\*|\*)/.test(line)).length
    }
    for (const variant of ['raw', 'minified']) {
      const output = join(root, `.tmp/m2-consumers/${candidate}/${variant}`)
      const bundle = await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          target: 'es2022',
          outDir: output,
          emptyOutDir: true,
          minify: variant === 'raw' ? false : 'esbuild',
          sourcemap: false,
          lib: { entry, formats: ['es'], fileName: () => 'viewer.js' },
          rollupOptions: { treeshake: true }
        },
        worker: { format: 'es' }
      })
      const assets = []
      for (const path of await files(output)) {
        const content = await readFile(path)
        assets.push({
          file: relative(output, path).replaceAll('\\', '/'),
          bytes: content.length,
          gzipBytes: gzipSync(content, { level: 9 }).length
        })
      }
      const bundles = Array.isArray(bundle) ? bundle : [bundle]
      const modules = bundles
        .flatMap((item) => item.output ?? [])
        .filter((item) => item.type === 'chunk')
        .flatMap((item) => Object.keys(item.modules))
      result[variant] = {
        bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
        gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
        assets,
        includedModules: [...new Set(modules)]
          .map((path) => relative(root, path).replaceAll('\\', '/'))
          .sort()
      }
    }
    report.candidates[candidate] = result
  }
  await mkdir(assetRoot, { recursive: true })
  await writeFile(join(assetRoot, 'artifacts.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(
    JSON.stringify({
      event: 'artifacts',
      report: join(assetRoot, 'artifacts.json'),
      candidates: Object.fromEntries(
        Object.entries(report.candidates).map(([key, value]) => [
          key,
          {
            version: value.version,
            rawBytes: value.raw.bytes,
            minifiedBytes: value.minified.bytes,
            gzipBytes: value.minified.gzipBytes,
            effectiveLines: value.effectiveLines
          }
        ])
      )
    })
  )
  return report
}

async function verifyConsumers(candidates) {
  const results = {}
  for (const candidate of candidates) {
    const directory = join(root, `.tmp/m2-consumers/${candidate}/minified`)
    await writeFile(
      join(directory, 'index.html'),
      '<!doctype html><meta charset="utf-8"><main id="comparison"></main>' +
        '<script type="module">import {ready} from "./viewer.js"; await ready; window.consumerReady=true;</script>'
    )
    const server = await createServer({
      configFile: false,
      root: directory,
      server: { host: '127.0.0.1', port: 4176, strictPort: true },
      logLevel: 'warn'
    })
    let browser
    try {
      await server.listen()
      browser = await chromium.launch({
        channel: 'chromium',
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
      await page.goto('http://127.0.0.1:4176')
      await page.waitForFunction(() => window.consumerReady === true)
      const load = await page.evaluate((name) => window.m2.load(name, 'ball-and-stick'), candidate)
      const visibility = await page.evaluate(() => window.m2.visibility())
      const worker = await page.evaluate(() => window.m2.workerSmoke())
      const released = await page.evaluate(() => window.m2.dispose())
      if (errors.length) throw new Error(errors.join('\n'))
      results[candidate] = {
        browser: browser.version(),
        load,
        visibility,
        worker,
        released,
        errors
      }
    } finally {
      await browser?.close()
      await server.close()
    }
  }
  await writeFile(join(assetRoot, 'consumers.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(
    JSON.stringify({ event: 'consumers', candidates: Object.keys(results), status: 'passed' })
  )
}

async function clickSamples(page, count) {
  const targets = await page.evaluate((n) => window.m2.targets(n), count)
  const times = []
  const results = []
  let pending
  await page.exposeBinding('__m2Selection', (_source, result) => {
    if (!pending) return
    const current = pending
    pending = undefined
    current.done({ ...result, latencyMs: performance.now() - current.start })
  })
  for (const target of targets) {
    await page.mouse.move(target.x, target.y)
    let timer
    try {
      const received = new Promise((done, reject) => {
        timer = setTimeout(
          () => reject(new Error('Pointer selection did not settle within 5 seconds.')),
          5000
        )
        pending = { start: performance.now(), done }
      })
      await page.mouse.down()
      await page.mouse.up()
      const result = await received
      const correct =
        result.pick?.kind === target.expected.kind &&
        result.pick?.instanceId === target.expected.instanceId &&
        result.pick?.sourceId === target.expected.sourceId &&
        result.pick?.index === target.expected.index
      times.push(result.latencyMs)
      results.push({
        expected: target.expected,
        actual: result.pick,
        correct,
        latencyMs: result.latencyMs
      })
    } finally {
      clearTimeout(timer)
      pending = undefined
    }
  }
  return {
    times,
    results,
    correct: results.length === count && results.every((result) => result.correct),
    p95Ms: percentile(times, 0.95)
  }
}

async function sample(url, candidate, mode, round, common) {
  const id = `${candidate}-${mode}-r${round}`
  const path = join(assetRoot, `${id}.json`)
  const launch = {
    channel: 'chromium',
    headless: true,
    args: ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
  }
  const result = {
    id,
    candidate,
    mode,
    round,
    startedAt: new Date().toISOString(),
    ...common,
    launch
  }
  let browser
  try {
    browser = await chromium.launch(launch)
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
    await page.waitForFunction(() => !!window.m2)
    result.browser = browser.version()
    result.load = await page.evaluate(({ candidate, mode }) => window.m2.load(candidate, mode), {
      candidate,
      mode
    })
    if (
      result.load.environment.synchronization &&
      result.load.environment.synchronization !== 'fence'
    )
      throw new Error('Hardware performance sampling requires the asynchronous fence path.')
    result.webgl = await page.evaluate(() => {
      const gl = document.querySelector('#comparison canvas').getContext('webgl2')
      const extension = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        renderer: extension
          ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        vendor: extension
          ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR),
        attributes: gl.getContextAttributes(),
        error: gl.getError()
      }
    })
    if (/SwiftShader|llvmpipe|software|Basic Render/i.test(result.webgl.renderer))
      throw new Error(`Hardware GPU required; got ${result.webgl.renderer}`)
    const session = await browser.newBrowserCDPSession()
    result.systemGpu = (await session.send('SystemInfo.getInfo')).gpu
    result.quality = await page.evaluate(() => window.m2.info())
    result.visibility = await page.evaluate(() => window.m2.visibility())
    await page.screenshot({ path: join(assetRoot, `${id}.png`) })
    result.interaction = await page.evaluate(() => window.m2.interact(10000, 60000))
    result.clicks = await clickSamples(page, 200)
    result.updates = await page.evaluate(() => window.m2.updates(100))
    result.updates.p95Ms = percentile(result.updates.times, 0.95)
    result.disposed = await page.evaluate(() => window.m2.dispose())
    result.lifecycle = await page.evaluate(
      ({ candidate, mode }) => window.m2.lifecycle(candidate, mode, 20),
      { candidate, mode }
    )
    result.errors = errors
    const released = (counts) =>
      counts &&
      ['gpuObjects', 'workers', 'rafs', 'observers', 'listeners', 'pending', 'canvases'].every(
        (name) => counts[name] === 0
      )
    result.gates = {
      firstFrame: result.load.firstFrameMs <= 5000,
      interaction: result.interaction.medianFps >= 30,
      picking:
        result.clicks.correct && result.clicks.times.length === 200 && result.clicks.p95Ms <= 100,
      updates:
        result.updates.correct &&
        result.updates.times.length === 100 &&
        result.updates.dirtyAtomCounts.every((count) => count === 100) &&
        result.updates.p95Ms <= 100,
      lifecycle:
        result.lifecycle.length === 20 &&
        result.lifecycle.every((entry) => released(entry.after)) &&
        released(result.disposed),
      browserErrors: errors.length === 0 && result.webgl.error === 0
    }
    result.passed = Object.values(result.gates).every(Boolean)
    result.completedAt = new Date().toISOString()
    result.status = 'measured'
  } catch (error) {
    result.status = 'failed'
    result.error = error.stack ?? String(error)
  } finally {
    await browser?.close()
    await writeFile(path, JSON.stringify(result, null, 2) + '\n')
  }
  console.log(
    JSON.stringify({
      event: 'run',
      id,
      status: result.status,
      firstFrameMs: result.load?.firstFrameMs,
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

export async function measure(url) {
  await mkdir(assetRoot, { recursive: true })
  const lockPath = join(root, '.tmp/bench/m2.lock')
  const lock = await open(lockPath, 'wx')
  await lock.writeFile(String(process.pid))
  try {
    if (args.includes('--artifacts-only')) {
      const report = await artifacts()
      await verifyConsumers(Object.keys(report.candidates))
      return
    }
    const available = await candidateNames()
    const selected = option('candidate', 'all')
    const candidates =
      selected === 'all' ? available : available.filter((name) => name === selected)
    if (!candidates.length) throw new Error(`Unavailable candidate: ${selected}`)
    const selectedMode = option('mode', 'all')
    const chosenModes =
      selectedMode === 'all' ? modes : modes.filter((mode) => mode === selectedMode)
    if (!chosenModes.length) throw new Error(`Unknown mode: ${selectedMode}`)
    const common = {
      sourceRevision: sourceRevision(),
      sourceHash: await sourceHash(),
      node: process.version,
      os: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
      logicalProcessors: os.cpus().length,
      totalMemory: os.totalmem(),
      hardware: windowsEnvironment(),
      parallelism: 1,
      purpose:
        'T-PERF-01 M2 same-device comparison; correctness is separately verified in three browsers'
    }
    // Artifact compilation finishes before GPU sampling starts.
    if (!args.includes('--skip-artifacts')) {
      const report = await artifacts()
      await verifyConsumers(Object.keys(report.candidates))
    }
    const results = []
    const requestedRound = option('round', 'all')
    if (!['all', '1', '2', '3'].includes(requestedRound))
      throw new Error(`Unknown round: ${requestedRound}`)
    for (let round = 1; round <= 3; round++) {
      if (requestedRound !== 'all' && String(round) !== requestedRound) continue
      const order = round === 2 ? [...candidates].reverse() : candidates
      for (const mode of chosenModes) {
        for (const candidate of order) {
          const id = `${candidate}-${mode}-r${round}`
          if (args.includes('--resume')) {
            try {
              const existing = JSON.parse(await readFile(join(assetRoot, `${id}.json`), 'utf8'))
              if (existing.sourceHash !== common.sourceHash)
                throw new Error(`Source changed; move prior evidence before restarting ${id}.`)
              if (existing.status === 'measured') {
                results.push(existing)
                console.log(JSON.stringify({ event: 'resume', id }))
                continue
              }
            } catch (error) {
              if (error.code !== 'ENOENT') throw error
            }
          }
          results.push(await sample(url, candidate, mode, round, common))
        }
      }
    }
    await writeFile(
      join(assetRoot, 'runs.json'),
      JSON.stringify(
        { ...common, runs: results.map((result) => ({ id: result.id, status: result.status })) },
        null,
        2
      ) + '\n'
    )
    if (results.some((result) => result.status === 'failed'))
      throw new Error('M2 sampling has failures; inspect the saved per-run evidence.')
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}
