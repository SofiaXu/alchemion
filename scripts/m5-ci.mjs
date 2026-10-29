import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Invoke through pnpm')
const base = process.env.M5_BASE || 'HEAD^'
const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD'], {
  encoding: 'utf8'
})
  .trim()
  .split('\n')
  .filter(Boolean)
const run = (args) => {
  const result = spawnSync(process.execPath, [pnpm, ...args], { stdio: 'inherit' })
  if (result.status !== 0)
    throw new Error(`pnpm ${args.join(' ')} failed (${result.status ?? result.signal})`)
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
  const code = changed.some((file) => !file.endsWith('.md') && !file.startsWith('docs/'))
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\nbase=${base}\n`)
  console.log(JSON.stringify({ base, code, changed }))
} else if (process.argv.includes('--unit')) {
  const tests = new Set(changed.filter((file) => file.endsWith('.test.ts')))
  for (const file of changed) {
    const core = 'packages/alchemion/src/core/'
    if (file.startsWith('packages/alchemion/src/formats/')) {
      const directory = file.split('/')[4].endsWith('.ts')
        ? 'packages/alchemion/src/formats'
        : file.split('/').slice(0, 5).join('/')
      for (const path of walk(directory)) if (path.endsWith('.test.ts')) tests.add(path)
    }
    if (file === `${core}derivation.ts` || file === `${core}bonds.ts`) {
      for (const name of ['derivation', 'bonds']) tests.add(`${core}__tests__/${name}.test.ts`)
    } else if (
      file.startsWith(`${core}data/vdw`) ||
      file === `${core}data/VDW_LICENSE.txt` ||
      file === `${core}data/index.ts` ||
      file === `${core}data/types.ts`
    ) {
      tests.add(`${core}__tests__/vdw.test.ts`)
    } else if (file.startsWith(`${core}data/`)) {
      for (const name of ['data', 'bonds']) tests.add(`${core}__tests__/${name}.test.ts`)
    } else if (file === `${core}math.ts` || file === `${core}types.ts`) {
      for (const path of walk(`${core}__tests__`)) if (path.endsWith('.test.ts')) tests.add(path)
    } else if (file.startsWith(`${core}editing/`)) {
      for (const path of walk(`${core}editing/__tests__`))
        if (path.endsWith('.test.ts')) tests.add(path)
    } else if (file.startsWith(core) && /^\w[\w-]*\.ts$/.test(file.slice(core.length))) {
      const test = `${core}__tests__/${file.slice(core.length, -3)}.test.ts`
      if (existsSync(test)) tests.add(test)
    }
    if (file === 'packages/alchemion/src/viewer/runtime/controller.ts')
      tests.add('packages/alchemion/src/viewer/runtime/__tests__/controller.test.ts')
    else if (/^packages\/alchemion\/src\/viewer\/runtime\/(runtime|protocol|task)\.ts$/.test(file))
      for (const path of walk('packages/alchemion/src/viewer/runtime/__tests__'))
        if (path.endsWith('.test.ts')) tests.add(path)
  }
  const selected = [...tests].filter((file) => existsSync(file)).sort()
  console.log(
    JSON.stringify({
      reason:
        'Changed scientific data/derivation and viewer/controller behavior only; unchanged M3/M4 suites excluded',
      tests: selected
    })
  )
  if (selected.length) run(['exec', 'vitest', 'run', ...selected, '--maxWorkers=4'])
} else if (process.argv.includes('--checks')) {
  const code = changed.filter((file) => /\.(ts|mjs)$/.test(file))
  const format = changed.filter((file) => /\.(ts|mjs|json|yaml|yml|md|html|css|scss)$/.test(file))
  if (code.length) run(['exec', 'eslint', ...code])
  if (format.length) run(['exec', 'prettier', '--check', ...format])
  run(['docs:check'])
} else throw new Error(`Unknown mode in ${resolve('scripts/m5-ci.mjs')}`)
