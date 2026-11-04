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
const worktree = process.argv.includes('--worktree')
const incremental = worktree
  ? [
      ...new Set(
        [
          ...execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', 'HEAD'], {
            encoding: 'utf8'
          })
            .trim()
            .split('\n'),
          ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
            encoding: 'utf8'
          })
            .trim()
            .split('\n')
        ].filter(Boolean)
      )
    ]
  : changedSince(incrementalBase)
const harness = incremental.some((file) =>
  ['scripts/ci-changes.mjs', 'scripts/pnpm.mjs', '.github/workflows/ci.yml'].includes(file)
)
const base = worktree ? 'WORKTREE' : harness ? deliveryBase : incrementalBase
const changed = worktree ? incremental : harness ? changedSince(base) : incremental
const has = (pattern) => changed.some((file) => pattern.test(file))
const sdk = has(/^packages\/alchemion\//) || has(/^scripts\/(worker-urls|format-data)\.mjs$/)
const tasks = has(/^scripts\/(tasks|pnpm)\.mjs$/)
const tooling = has(
  /^(package\.json|pnpm-(lock|workspace)\.yaml|\.node-version|tsconfig.*|eslint\.config\.mjs|vitest\.config\.ts)$/
)
const shared = tasks || tooling || harness || has(/^tests\/shared\//)
const modelingPaths = [
  /^(?:docs\/|README\.md$|apps\/demo\/)/,
  /^packages\/alchemion\/(?:THIRD_PARTY_NOTICES\.md$|src\/(?:core\/|viewer\/(?:index\.ts$|runtime\/)))/,
  /^packages\/alchemion\/src\/formats\/(?:index\.ts$|poscar\/|cif\/(?:structure\.ts$|__tests__\/structure\.test\.ts$)|mol\/(?:finite\.ts$|writer\.ts$))/,
  /^tests\/(?:consumer\/|fixtures\/crystals\/|demo\.spec\.ts$|package\.spec\.ts$)/,
  /^scripts\/(?:ci-changes\.mjs$|tasks\.mjs$|worker-urls\.mjs$|demo-assets\.mjs$|spglib-wasm\/)/
]
const modelingDelivery =
  !tooling &&
  has(
    /^packages\/alchemion\/src\/(?:core\/(?:construction|surface|packing|defects|nano|molecular|polymer)\.ts|viewer\/runtime\/(?:modeling-|spglib\/))/
  ) &&
  changed.every((file) => modelingPaths.some((pattern) => pattern.test(file)))
// A known feature delivery gets explicit cases; unknown/shared scientific edits
// retain the existing conservative routing. Entry-only additions follow the
// implementation files in the same delivery rather than every format suite.
const featureDelivery =
  !tooling &&
  has(
    /^packages\/alchemion\/(?:vite\.config\.ts|src\/(core\/(supercell|coordination)\.ts|formats\/poscar\/reader\.ts|viewer\/backend\/capture\.ts))$/
  ) &&
  changed.every((file) =>
    /^(docs\/|README\.md$|packages\/alchemion\/vite\.config\.ts$|packages\/alchemion\/src\/(core\/(supercell|coordination|derivation|structure|symmetry|bonds|index)\.ts$|core\/editing\/|core\/__tests__\/|formats\/(contracts|index)\.ts$|formats\/poscar\/|viewer\/)|apps\/demo\/|tests\/(viewer|runtime|consumer|shared)\/|tests\/(viewer|runtime|demo|package)\.spec\.ts$|scripts\/(ci-changes|tasks|viewer-bench|source-edit-profile|format-reference|format-mol-fixtures|format-poscar-fixtures)\.(mjs|py)$|\.github\/workflows\/ci\.yml$)/.test(
      file
    )
  )
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
    runtime_grep: modelingDelivery
      ? '@features|public sync/worker scientific tasks agree'
      : featureDelivery
        ? '@features'
        : '@workspace',
    viewer_grep:
      modelingDelivery || featureDelivery
        ? '@features|derived-instance edits, selection retention'
        : '@workspace',
    demo_grep: modelingDelivery
      ? '@modeling|@real-crystals'
      : featureDelivery
        ? '@features'
        : '@demo',
    package_grep: modelingDelivery ? '@modeling' : featureDelivery ? '@features' : '@package',
    dev_smoke: demo && !featureDelivery && !modelingDelivery,
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
        (featureDelivery || modelingDelivery) && section.includes('.')
          ? 'packages/alchemion/src/formats/poscar'
          : section.includes('.')
            ? 'packages/alchemion/src/formats'
            : `packages/alchemion/src/formats/${section}`
      )
    }
    if (
      file === `${core}derivation.ts` ||
      file === `${core}bonds.ts` ||
      file === `${core}symmetry.ts`
    ) {
      for (const name of [
        'derivation',
        'bonds',
        ...(file.endsWith('symmetry.ts') ? ['structure'] : [])
      ])
        tests.add(`${core}__tests__/${name}.test.ts`)
    } else if (
      file.startsWith(`${core}data/vdw`) ||
      file === `${core}data/VDW_LICENSE.txt` ||
      file === `${core}data/index.ts` ||
      file === `${core}data/types.ts`
    )
      tests.add(`${core}__tests__/vdw.test.ts`)
    else if (file.startsWith(`${core}data/`)) {
      for (const name of ['data', 'bonds']) tests.add(`${core}__tests__/${name}.test.ts`)
    } else if (modelingDelivery && file === `${core}types.ts`)
      tests.add(`${core}__tests__/structure.test.ts`)
    else if (file === `${core}math.ts` || file === `${core}types.ts`)
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
    else if (
      /^packages\/alchemion\/src\/viewer\//.test(file) &&
      !(
        modelingDelivery && /^packages\/alchemion\/src\/viewer\/(?:index\.ts$|runtime\/)/.test(file)
      )
    )
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
