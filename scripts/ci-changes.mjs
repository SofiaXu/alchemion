import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pnpmCommand } from './pnpm.mjs'

const incrementalBase = process.env.CHANGE_BASE || 'HEAD^'
const deliveryBase = process.env.PR_BASE || incrementalBase
// Deleted files affect routing even though they cannot be passed to lint.
const changedSince = (base) =>
  execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', base, 'HEAD'], {
    encoding: 'utf8'
  })
    .trim()
    .split('\n')
    .filter(Boolean)
const incremental = changedSince(incrementalBase)
const harness = incremental.some((file) =>
  ['scripts/ci-changes.mjs', 'scripts/pnpm.mjs', '.github/workflows/ci.yml'].includes(file)
)
const base = harness ? deliveryBase : incrementalBase
const changed = harness ? changedSince(base) : incremental
const has = (pattern) => changed.some((file) => pattern.test(file))
const sdk = has(/^packages\/alchemion\//) || has(/^scripts\/(worker-urls|format-data)\.mjs$/)
const tasks = has(/^scripts\/(tasks|pnpm)\.mjs$/)
const tooling = has(
  /^(package\.json|pnpm-(lock|workspace)\.yaml|\.node-version|tsconfig.*|eslint\.config\.mjs|vitest\.config\.ts)$/
)
const shared = tasks || tooling || harness || has(/^tests\/shared\//)
const runtime =
  shared ||
  has(/^packages\/alchemion\/src\/(core|formats|viewer\/runtime)\//) ||
  has(/^(tests\/runtime\/|tests\/runtime\.spec\.ts|playwright\.runtime\.config\.ts$)/)
const viewer =
  shared ||
  has(/^packages\/alchemion\/src\/(viewer|core)\//) ||
  has(/^(tests\/viewer\/|tests\/viewer\.spec\.ts|playwright\.viewer\.config\.ts$)/)
const demo =
  sdk ||
  shared ||
  has(/^(apps\/demo\/|scripts\/demo-assets\.mjs|tests\/demo\.spec\.ts|playwright\.config\.ts$)/)
const pkg =
  sdk ||
  shared ||
  has(/^(tests\/consumer\/|tests\/package\.spec\.ts|playwright\.package\.config\.ts$)/)
const reason = harness
  ? 'Changed CI routing requires checking the delivery diff rather than only its harness fix.'
  : 'Tests selected from changed subsystems, including deleted paths.'
const run = (command) => {
  const result = spawnSync(...pnpmCommand(command), { stdio: 'inherit' })
  if (result.status !== 0)
    throw new Error(`pnpm ${command.join(' ')} failed (${result.status ?? result.signal})`)
}
const walk = (directory) =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(directory, entry.name))
          : [join(directory, entry.name).replaceAll('\\', '/')]
      )
    : []
if (process.argv.includes('--scope')) {
  const outputs = {
    sdk: sdk || demo || pkg || viewer || runtime,
    runtime,
    demo,
    package: pkg,
    viewer,
    base
  }
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join('')
    )
  console.log(JSON.stringify({ base, incrementalBase, deliveryBase, reason, changed, ...outputs }))
} else if (process.argv.includes('--unit')) {
  const tests = new Set(changed.filter((file) => file.endsWith('.test.ts')))
  const addDirectory = (directory) => {
    for (const file of walk(directory)) if (file.endsWith('.test.ts')) tests.add(file)
  }
  const core = 'packages/alchemion/src/core/'
  if (tooling) addDirectory('packages/alchemion/src')
  for (const file of changed) {
    if (file.startsWith('packages/alchemion/src/formats/')) {
      const section = file.split('/')[4]
      addDirectory(
        section.includes('.')
          ? 'packages/alchemion/src/formats'
          : `packages/alchemion/src/formats/${section}`
      )
    }
    if (file === `${core}derivation.ts` || file === `${core}bonds.ts`) {
      for (const name of ['derivation', 'bonds']) tests.add(`${core}__tests__/${name}.test.ts`)
    } else if (
      file.startsWith(`${core}data/vdw`) ||
      file === `${core}data/VDW_LICENSE.txt` ||
      file === `${core}data/index.ts` ||
      file === `${core}data/types.ts`
    )
      tests.add(`${core}__tests__/vdw.test.ts`)
    else if (file.startsWith(`${core}data/`)) {
      for (const name of ['data', 'bonds']) tests.add(`${core}__tests__/${name}.test.ts`)
    } else if (file === `${core}math.ts` || file === `${core}types.ts`)
      addDirectory(`${core}__tests__`)
    else if (file.startsWith(`${core}editing/`)) addDirectory(`${core}editing/__tests__`)
    else if (file.startsWith(core) && /^[\w-]+\.ts$/.test(file.slice(core.length))) {
      const test = `${core}__tests__/${file.slice(core.length, -3)}.test.ts`
      if (existsSync(test)) tests.add(test)
    }
    if (file === 'packages/alchemion/src/viewer/runtime/controller.ts')
      tests.add('packages/alchemion/src/viewer/runtime/__tests__/controller.test.ts')
    else if (
      /^packages\/alchemion\/src\/viewer\/runtime\/(runtime|protocol|task|computation-worker)\.ts$/.test(
        file
      )
    )
      addDirectory('packages/alchemion/src/viewer/runtime/__tests__')
    else if (/^packages\/alchemion\/src\/viewer\//.test(file))
      addDirectory('packages/alchemion/src/viewer/__tests__')
  }
  const selected = [...tests].filter((file) => existsSync(file)).sort()
  console.log(JSON.stringify({ reason, tests: selected }))
  if (selected.length)
    run(['exec', 'vitest', 'run', ...selected, `--maxWorkers=${process.env.TEST_WORKERS ?? 4}`])
} else if (process.argv.includes('--checks')) {
  const present = changed.filter((file) => existsSync(file))
  const code = present.filter((file) => /\.(ts|mjs)$/.test(file))
  const formatted = present.filter((file) => /\.(ts|mjs|json|ya?ml|md|html|css|scss)$/.test(file))
  if (code.length) run(['exec', 'eslint', ...code])
  if (formatted.length) run(['exec', 'prettier', '--check', ...formatted])
  run(['docs:check'])
} else throw new Error('Unknown CI mode.')
