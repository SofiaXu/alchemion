import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { expect, test } from 'vitest'
import { parseCalculationResult } from '../..'

const fixture = (name: string) =>
  gunzipSync(
    readFileSync(
      new URL(`../../../../../../tests/fixtures/calculation/${name}.gz`, import.meta.url)
    )
  ).toString('utf8')

const geometry = 'Author fixture\n1\n2 0 0\n1 3 0\n0 0 4\nLi\n1\nDirect\n0 0 0\n'

test('real oblique CHGCAR follows the independent electron integral, voxel order and augmentation length', () => {
  const parsed = parseCalculationResult(fixture('CHGCAR.nospin'), {
    format: 'chgcar',
    name: 'CHGCAR'
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics))
  expect(parsed.value.termination).toBe('unknown')
  expect(parsed.value.convergence).toBe('unknown')
  expect(parsed.value.sources[0].sha256).toBe(
    'b58e1fb93dedfa746c3f5d1efe033a0560938b375adddd6ff40ef932a73a3c3a'
  )
  const grid = parsed.value.data[0]
  if (grid?.kind !== 'grid') throw new Error('Expected the electron density grid')
  expect(grid.unit).toBe('1/Å³')
  expect(grid.grid.dimensions).toEqual([32, 32, 32])
  expect(grid.grid.steps[1][0]).toBeCloseTo(-0.987305 / 32, 14)
  expect(grid.grid.values[0]).toBeCloseTo(0.02186884536231703, 12)
  expect(grid.grid.values[32]).toBeCloseTo(0.022153281960362467, 12)
  expect(grid.grid.values[1024]).toBeCloseTo(0.022153244511662097, 12)
  let densitySum = 0
  for (const value of grid.grid.values) densitySum += value
  const electrons = (densitySum * 20.148362761266316) / 32 ** 3
  expect(electrons).toBeCloseTo(0.9999999934509903, 10)
})

test('collinear channels have separate signed values and refuse truncated augmentation and oversized grids', () => {
  const raw = `${geometry}\n2 2 2\n24 48 72 96\n120 144 168 192\n`
  const parsed = parseCalculationResult(
    `${raw}augmentation occupancies 1 3\n0 1 0\n\n2 2 2\n-24 0 24 0 24 0 -24 0\n`,
    { format: 'chgcar' }
  )
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics))
  const [total, spin] = parsed.value.data
  if (total.kind !== 'grid' || spin.kind !== 'grid') throw new Error('Expected grid channels')
  expect(Array.from(total.grid.values)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  expect(Array.from(spin.grid.values)).toEqual([-1, 0, 1, 0, 1, 0, -1, 0])
  expect(spin.spin).toBe('up-down')
  expect(
    parseCalculationResult(`${raw}augmentation occupancies 1 3\n0 1\n`, { format: 'chgcar' })
  ).toMatchObject({ ok: false, diagnostics: [{ code: 'RESULT_GRID_TRUNCATED' }] })
  expect(
    parseCalculationResult(`${geometry}1000000 1000000 1000000\n`, { format: 'chg' })
  ).toMatchObject({ ok: false, diagnostics: [{ code: 'RESULT_GRID_BUDGET' }] })
})

test('LOCPOT retains eV and single-orbital Cube changes only geometric units and storage order', () => {
  const potential = parseCalculationResult(`${geometry}2 2 2\n-2 0 1 2 3 4 5 6\n`, {
    format: 'locpot'
  })
  if (!potential.ok) throw new Error(JSON.stringify(potential.diagnostics))
  expect(potential.value.data[0]).toMatchObject({
    unit: 'eV',
    grid: { values: Float64Array.from([-2, 0, 1, 2, 3, 4, 5, 6]) }
  })
  const orbital =
    'Title\nOUTER LOOP: X, MIDDLE LOOP: Y, INNER LOOP: Z\n-1 1 2 3\n2 1 0 0\n2 0 2 0\n2 0 0 1\n1 1 0 0 0\n1 7\n-3 2 0 1 3 -2 5 6\n'
  const cube = parseCalculationResult(orbital, {
    format: 'cube',
    quantity: 'wavefunction',
    unit: 'bohr^-3/2'
  })
  if (!cube.ok) throw new Error(JSON.stringify(cube.diagnostics))
  expect(cube.value.data[0]).toMatchObject({
    quantity: 'wavefunction',
    unit: 'bohr^-3/2',
    grid: {
      origin: [0.529177210903, 1.058354421806, expect.closeTo(1.587531632709)],
      values: Float64Array.from([-3, 3, 0, 5, 2, -2, 1, 6])
    }
  })
})
