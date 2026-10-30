import { chromium } from '@playwright/test'
import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

/** Diagnostic run only: the regular performance gate remains unchanged. */
export async function prepareSourceEditProfile(packaged) {
  if (!packaged.consumer || !packaged.fixture || !packaged.archive)
    throw new Error('A frozen installed benchmark consumer is required.')
  const directory = join(packaged.consumer, 'source-edit-profile-dist')
  await build({
    configFile: false,
    root: packaged.fixture,
    base: './',
    logLevel: 'warn',
    build: { target: 'es2022', outDir: directory, emptyOutDir: true, minify: false },
    worker: { format: 'es' }
  })
  return directory
}

function cpuSummary(profile, sources) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  const parents = new Map()
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id)
  const symbols = new Map()
  const symbolEvidence = []
  for (const [scriptId, source] of sources) {
    for (const [marker, category] of [
      ['BOND_MOLECULAR_ENDPOINT', 'endpointLookup'],
      ['STRUCTURE_INPUT', 'validation'],
      ['Editing inputs must contain acyclic plain scientific data.', 'sourceCopyAndFreeze'],
      ['OCCUPANCY_DEFAULT', 'sourceCopyAndFreeze']
    ]) {
      const offset = source.indexOf(marker)
      if (offset < 0) continue
      const declaration = [...source.slice(0, offset).matchAll(/\bfunction\s+([\w$]+)\s*\(/g)].at(
        -1
      )
      if (!declaration) continue
      symbols.set(`${scriptId}:${declaration[1]}`, category)
      symbolEvidence.push({ scriptId, symbol: declaration[1], marker, category })
    }
  }
  const totals = { endpointLookup: 0, validation: 0, sourceCopyAndFreeze: 0, other: 0, idle: 0 }
  const functions = new Map()
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    let id = profile.samples[i]
    const milliseconds = (profile.timeDeltas[i] ?? 0) / 1000
    const stack = [],
      categories = []
    while (id !== undefined) {
      const node = nodes.get(id)
      if (!node) break
      stack.push(node.callFrame.functionName)
      categories.push(symbols.get(`${node.callFrame.scriptId}:${node.callFrame.functionName}`))
      id = parents.get(id)
    }
    const names = stack.join(' ')
    const category = /\(idle\)/.test(names)
      ? 'idle'
      : categories.includes('endpointLookup')
        ? 'endpointLookup'
        : categories.includes('validation')
          ? 'validation'
          : categories.includes('sourceCopyAndFreeze')
            ? 'sourceCopyAndFreeze'
            : 'other'
    totals[category] += milliseconds
    const name = stack[0] || '(anonymous)'
    functions.set(name, (functions.get(name) ?? 0) + milliseconds)
  }
  return {
    estimatedCpuMs: totals,
    symbolEvidence,
    topSelf: [...functions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([functionName, milliseconds]) => ({ functionName, milliseconds })),
    note: 'Sampling estimates, not instrumented wall durations. Categories are exclusive; endpoint lookup takes precedence over its validation caller. sourceCopyAndFreeze includes the known copy routine and createStructureSnapshot outside validation; cloning outside these frames remains other. Worker and main-thread CPU can overlap.'
  }
}

async function profileSources(profile, send) {
  await send('Debugger.enable')
  const sources = new Map()
  for (const scriptId of new Set(profile.nodes.map((node) => node.callFrame.scriptId))) {
    if (scriptId === '0') continue
    try {
      const { scriptSource } = await send('Debugger.getScriptSource', { scriptId })
      sources.set(scriptId, scriptSource)
    } catch {
      // Native/builtin frames do not necessarily have a retrievable script.
    }
  }
  return sources
}

async function workerProfiler(browserSession, targetId) {
  const { sessionId } = await browserSession.send('Target.attachToTarget', { targetId })
  let sequence = 0
  const pending = new Map()
  const receive = ({ sessionId: source, message }) => {
    if (source !== sessionId) return
    const reply = JSON.parse(message)
    const promise = pending.get(reply.id)
    if (!promise) return
    pending.delete(reply.id)
    if (reply.error) promise.reject(new Error(reply.error.message))
    else promise.resolve(reply.result)
  }
  browserSession.on('Target.receivedMessageFromTarget', receive)
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      void browserSession
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params })
        })
        .catch(reject)
    })
  await send('Profiler.enable')
  await send('Profiler.setSamplingInterval', { interval: 1000 })
  return {
    start: () => send('Profiler.start'),
    async stop() {
      try {
        const { profile } = await send('Profiler.stop')
        return { profile, sources: await profileSources(profile, send) }
      } finally {
        browserSession.off('Target.receivedMessageFromTarget', receive)
        await browserSession.send('Target.detachFromTarget', { sessionId })
      }
    }
  }
}

export async function profileSourceEdit(url, packaged) {
  const label = option('profile-label', '')
  if (label && !/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid profile label.')
  const directory = join(root, '.tmp/feature-directions/profile', label)
  await mkdir(directory, { recursive: true })
  const count = Number(option('profile-samples', '3'))
  const mode = option('mode', 'ball-and-stick')
  if (!Number.isSafeInteger(count) || count < 1 || count > 10)
    throw new Error('Diagnostic profile samples must be an integer from 1 to 10.')
  if (!['space-filling', 'ball-and-stick'].includes(mode)) throw new Error('Invalid profile mode.')
  const lockPath = join(root, '.tmp/bench/formal-viewer.lock')
  await mkdir(dirname(lockPath), { recursive: true })
  let browser
  const result = {
    purpose: 'Source-edit CPU attribution only; not a T-PERF-01 performance gate',
    startedAt: new Date().toISOString(),
    sourceRevision:
      packaged.sourceRevision ??
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceInputManifest: packaged.sourceInputManifest,
    sourceInputManifestSha256: packaged.sourceInputManifestSha256,
    sourceHash: packaged.sourceInputManifest ? undefined : await sourceHash(),
    collectorSha256: createHash('sha256')
      .update(await readFile(fileURLToPath(import.meta.url)))
      .digest('hex'),
    samplingIntervalMicroseconds: 1000,
    tarballSha256: createHash('sha256')
      .update(await readFile(packaged.archive))
      .digest('hex'),
    consumer: packaged.consumer,
    fixture: {
      sourceAtoms: 10000,
      sourceBonds: 20000,
      identityOnly: true,
      updates: count,
      atomsPerUpdate: 100,
      updateSequence:
        'The existing updates(1) harness is called each pass: the same deterministic hundred source IDs translate again. This is diagnostic sampling, not the formal hundred-update distribution.'
    },
    sampleReason: `${count} consecutive existing hundred-atom updates diagnose source-edit CPU attribution. No interaction, picking, lifecycle or full performance suite is run.`,
    node: process.version,
    os: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    hardware: hardware(),
    parallelism: 1,
    mode
  }
  const lock = await open(lockPath, 'wx')
  try {
    if (packaged.tarballSha256 && packaged.tarballSha256 !== result.tarballSha256)
      throw new Error('The frozen tarball SHA no longer matches its manifest.')
    const fixture = await import(pathToFileURL(join(packaged.fixture, 'fixtures.ts')).href)
    result.fixture.sourceSha256 = createHash('sha256')
      .update(JSON.stringify(fixture.benchmark()))
      .digest('hex')
    result.fixture.optionsSha256 = createHash('sha256')
      .update(JSON.stringify(fixture.BENCH_OPTIONS))
      .digest('hex')
    browser = await chromium.launch({
      channel: 'chromium',
      headless: true,
      args: ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
    })
    result.browser = browser.version()
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      const Original = window.Worker
      const spans = []
      window.__sourceEditWorkerSpans = spans
      window.__sourceEditRenderSpans = []
      const observer = new window.PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (entry.name === 'alchemion:render')
            window.__sourceEditRenderSpans.push({
              start: entry.startTime,
              end: entry.startTime + entry.duration,
              duration: entry.duration
            })
      })
      observer.observe({ entryTypes: ['measure'] })
      window.__stopSourceEditObserver = () => observer.disconnect()
      window.Worker = class extends Original {
        constructor(...args) {
          super(...args)
          const requests = new Map()
          const originalPost = this.postMessage.bind(this)
          this.postMessage = (message, ...rest) => {
            if (message?.kind === 'compute') {
              const span = {
                requestId: message.requestId,
                documentId: message.documentId,
                revision: message.revision,
                task: message.task?.kind,
                start: performance.now()
              }
              requests.set(message.requestId, span)
              spans.push(span)
            }
            return originalPost(message, ...rest)
          }
          const receive = ({ data }) => {
            const span = requests.get(data?.requestId)
            if (span) {
              span.end = performance.now()
              span.kind = data.kind
              requests.delete(data.requestId)
            }
          }
          this.addEventListener('message', receive)
          const terminate = this.terminate.bind(this)
          this.terminate = () => {
            this.removeEventListener('message', receive)
            terminate()
          }
        }
      }
    })
    await page.goto(url)
    await page.waitForFunction(() => !!window.viewerHarness)
    const loaded = await page.evaluate((display) => window.viewerHarness.benchLoad(display), mode)
    result.load = {
      ...loaded,
      render: loaded.render
        ? {
            duration: loaded.render.duration,
            detail: { atoms: loaded.render.detail.atoms, bonds: loaded.render.detail.bonds }
          }
        : undefined
    }
    if (result.load.atoms !== 10000 || result.load.sourceBonds !== 20000)
      throw new Error('Diagnostic fixture differs from the formal 10k/20k source.')
    const session = await page.context().newCDPSession(page)
    const browserSession = await browser.newBrowserCDPSession()
    const targets = (await browserSession.send('Target.getTargets')).targetInfos.filter(
      (target) => target.type === 'worker' && target.url.includes('computation-worker')
    )
    const workers = []
    for (const target of targets)
      workers.push(await workerProfiler(browserSession, target.targetId))
    if (workers.length !== 1)
      throw new Error(`Expected one computation worker; got ${workers.length}.`)
    await session.send('Profiler.enable')
    await session.send('Profiler.setSamplingInterval', { interval: 1000 })
    await page.evaluate(() => {
      window.__sourceEditWorkerSpans.length = 0
      window.__sourceEditRenderSpans.length = 0
      performance.clearMeasures('alchemion:render')
    })
    await session.send('Profiler.start')
    for (const worker of workers) await worker.start()
    const timeline = []
    for (let i = 0; i < count; i++) {
      const update = await page.evaluate(async () => {
        const start = performance.now()
        const value = await window.viewerHarness.updates(1)
        return { start, end: performance.now(), ...value }
      })
      timeline.push(update)
    }
    const main = (await session.send('Profiler.stop')).profile
    const mainSources = await profileSources(main, (method, params) => session.send(method, params))
    const workerEvidence = await workers[0].stop()
    const worker = workerEvidence.profile
    await writeFile(join(directory, 'main.cpuprofile'), JSON.stringify(main))
    await writeFile(join(directory, 'worker.cpuprofile'), JSON.stringify(worker))
    result.timeline = timeline
    result.workerRoundTrips = await page.evaluate(() => window.__sourceEditWorkerSpans)
    result.fullFrameSpans = await page.evaluate(() => window.__sourceEditRenderSpans)
    result.wallWindows = timeline.map((entry, index) => {
      const compute = result.workerRoundTrips[index],
        frame = result.fullFrameSpans[index]
      if (!compute?.end || !frame) return { complete: false }
      return {
        complete: true,
        harnessWindowMs: entry.end - entry.start,
        sourceEditEndToEndMs: entry.endToEndTimes[0],
        prepareAndCommitMs: compute.start - entry.start,
        workerRoundTripMs: compute.end - compute.start,
        replyToRendererMs: frame.start - compute.end,
        rendererMs: frame.duration,
        afterFrameAndVerificationMs: entry.end - frame.end
      }
    })
    result.mainThread = cpuSummary(main, mainSources)
    result.worker = cpuSummary(worker, workerEvidence.sources)
    result.correct =
      timeline.every((entry) => entry.correct && entry.dirtyAtomCounts.every((n) => n === 100)) &&
      result.wallWindows.every((entry) => entry.complete)
    result.errors = errors
    result.disposed = await page.evaluate(() => window.viewerHarness.dispose())
    await page.evaluate(() => window.__stopSourceEditObserver())
    result.status =
      result.correct && errors.length === 0 && released(result.disposed) ? 'measured' : 'failed'
    result.limits =
      'Profiler overhead is included. Worker round trips include transfer/queue/compute; raw worker CPU profile separates computation estimates. Renderer timings retain their existing prepared-snapshot-to-complete-frame boundary. This diagnostic does not establish p95 or a performance pass.'
  } catch (error) {
    result.status = 'failed'
    result.error = error.stack ?? String(error)
  } finally {
    await browser?.close()
    await lock.close()
    await unlink(lockPath)
    result.completedAt = new Date().toISOString()
    await writeFile(join(directory, 'source-edit.json'), JSON.stringify(result, null, 2) + '\n')
  }
  console.log(
    JSON.stringify({
      event: 'source-edit-profile',
      status: result.status,
      mainThread: result.mainThread,
      worker: result.worker,
      file: join(directory, 'source-edit.json'),
      error: result.error
    })
  )
  if (result.status !== 'measured')
    throw new Error('Source-edit diagnostic failed; inspect its saved report.')
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
