import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { expect, test } from 'vitest'
import { parseCalculationResult, parseNebImages } from '../..'
import type { PeriodicStructureSnapshot } from '../../../core/types'

const fixture = (name: string) =>
  gunzipSync(
    readFileSync(
      new URL(`../../../../../../tests/fixtures/calculation/${name}.gz`, import.meta.url)
    )
  ).toString('utf8')

test('real VASP band path is segmented and linked to the same frame and Fermi reference as DOS', () => {
  const parsed = parseCalculationResult(fixture('vasprun_Si_bands.xml'), { format: 'vasprun' })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics))
  expect(parsed.value.initialFrameId).toBe('initial')
  expect(parsed.value.frames.find((frame) => frame.step === 1)?.energyEv).toBe(-11.02606998)
  const bands = parsed.value.data.find((data) => data.kind === 'bands')
  const dos = parsed.value.data.find((data) => data.kind === 'dos')
  if (!bands || !dos) throw new Error('Expected bands and DOS')
  expect(bands.points).toHaveLength(160)
  expect(bands.points.flatMap((point, index) => (point.breakBefore ? [index] : []))).toEqual([144])
  expect(bands.bands[0].energies[0]).toBe(-6.1991)
  expect(bands.fermi?.value).toBe(5.85611255)
  expect(dos.frameId).toBe(bands.frameId)
  expect(dos.fermi).toEqual(bands.fermi)
  expect(dos.energies[0]).toBe(-7.6103)
  expect(dos.series.some((series) => series.label === 'Ion 2: s')).toBe(true)
  expect(parseCalculationResult('<modeling><atominfo>', { format: 'vasprun' })).toMatchObject({
    ok: false,
    diagnostics: [{ code: 'RESULT_XML_SYNTAX' }]
  })
})

test('real OUTCAR distinguishes projected population and spinor moments and rejects a conflicting reference', () => {
  const text = fixture('OUTCAR.NiO_SOC')
  const parsed = parseCalculationResult(text, { format: 'outcar' })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics))
  const data = parsed.value.data
  expect(data.find(({ id }) => id === 'projected-charge')).toMatchObject({
    frameId: 'step:1',
    quantity: 'projected-electron-population',
    values: [14.323, 14.323, 5.037, 5.037]
  })
  const moment = data.find(({ id }) => id === 'magnetic-moment')
  expect(moment).toMatchObject({
    frameId: 'step:1',
    vector: 'axial',
    values: expect.arrayContaining([
      [0.9647523513, 0.9647523513, 0.9647523513].map((x) => expect.closeTo(x, 8))
    ])
  })
  const initial = parsed.value.frames[0].structure as PeriodicStructureSnapshot
  const wrong = {
    ...initial,
    atoms: initial.atoms.map((atom, index) =>
      index === 0 ? { ...atom, fractional: [0.2, 0, 0] as const } : atom
    )
  }
  expect(parseCalculationResult(text, { format: 'outcar', reference: wrong })).toMatchObject({
    ok: false,
    diagnostics: [{ code: 'RESULT_OUTCAR_REFERENCE' }]
  })
})

test('VASP Γ mode uses its reference coordinates and keeps the printed mass-weighted convention', () => {
  const text = `vasp.6.5.0
VRHFIN =O:
ions per type = 2
Mass of Ions in am
POMASS = 16.00
direct lattice vectors reciprocal lattice vectors
2 0 0 0.5 0 0
0 2 0 0 0.5 0
0 0 2 0 0 0.5
position of ions in fractional coordinates (direct lattice)
0 0 0
0.5 0.5 0.5
Eigenvectors and eigenvalues of the dynamical matrix
1 f/i = 2.000 THz 12.0 2PiTHz
X Y Z dx dy dz
0 0 0 0 0 -1
1 1 1 0 0 1
General timing and accounting informations for this job:`
  const parsed = parseCalculationResult(text, { format: 'outcar' })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics))
  expect(parsed.value.termination).toBe('completed')
  expect(parsed.value.convergence).toBe('unknown')
  expect(parsed.value.data[0]).toMatchObject({
    kind: 'vibration',
    frameId: 'mode-reference',
    modes: [
      {
        frequencyThz: 2,
        imaginary: true,
        q: [0, 0, 0],
        real: [
          [0, 0, -1],
          [0, 0, 1]
        ],
        masses: [16, 16]
      }
    ]
  })
  const adjusted = text.replace(
    'General timing and accounting informations for this job:',
    `Eigenvectors after division by SQRT(mass)

Eigenvectors and eigenvalues of the dynamical matrix
1 f/i = 2.000 THz 12.0 2PiTHz
X Y Z dx dy dz
0 0 0 0 0 -0.25
1 1 1 0 0 0.25
General timing and accounting informations for this job:`
  )
  const massAdjusted = parseCalculationResult(adjusted, { format: 'outcar' })
  if (!massAdjusted.ok) throw new Error(JSON.stringify(massAdjusted.diagnostics))
  const modeSet = massAdjusted.value.data.find(({ kind }) => kind === 'vibration')
  if (modeSet?.kind !== 'vibration') throw new Error('Expected the mass-adjusted Γ modes')
  const mode = modeSet.modes[0]
  expect(mode?.real).toEqual([
    [0, 0, -0.25],
    [0, 0, 0.25]
  ])
  expect(mode?.masses).toBeUndefined()
})

test('real OUTCAR NaCl DFPT modes retain the calculation masses and atom order', () => {
  const parsed = parseCalculationResult(fixture('OUTCAR.NaCl-dfpt'), { format: 'outcar' })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics))
  const modeSet = parsed.value.data.find(({ kind }) => kind === 'vibration')
  if (modeSet?.kind !== 'vibration') throw new Error('Expected the printed Γ modes')
  expect(parsed.value.termination).toBe('completed')
  expect(modeSet.modes).toHaveLength(192)
  expect(modeSet.modes[0]).toMatchObject({ frequencyThz: 6.252562, imaginary: false, q: [0, 0, 0] })
  expect(modeSet.modes[0].masses?.slice(31, 33)).toEqual([22.99, 35.45])
  expect(modeSet.modes[0].real[0]).toEqual([0.096352, 0.089693, -0.058635])
})

test('XDATCAR keeps source positions across the boundary and NEB sorts explicit image and energy records', () => {
  const head = 'Trajectory\n1\n2 0 0\n1 3 0\n0 0 4\nC\n1\n'
  const parsed = parseCalculationResult(
    `${head}Direct configuration= 4\n0.98 0 0\nDirect configuration= 9\n0.02 0 0\n`,
    { format: 'xdatcar' }
  )
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics))
  expect(
    parsed.value.frames.map((frame) => [
      frame.step,
      (frame.structure as PeriodicStructureSnapshot).atoms[0].fractional[0]
    ])
  ).toEqual([
    [4, 0.98],
    [9, 0.02]
  ])
  const path = parseNebImages([
    { image: 1, energyEv: -2, text: `${head}Direct\n0.3 0 0\n` },
    { image: 0, energyEv: -4, text: `${head}Direct\n0.1 0 0\n` }
  ])
  if (!path.ok) throw new Error(JSON.stringify(path.diagnostics))
  expect(path.value.frames.map((frame) => [frame.image, frame.energyEv])).toEqual([
    [0, -4],
    [1, -2]
  ])
})
