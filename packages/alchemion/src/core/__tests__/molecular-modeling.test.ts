import { describe, expect, it } from 'vitest'
import { addHydrogens, attachFragment, BUILT_IN_FRAGMENTS } from '../molecular'
import { buildPolymer } from '../polymer'
import type { MolecularAtom, MolecularStructureSnapshot, SourceBond, Vec3 } from '../types'

const atom = (id: string, element: string, cartesian: Vec3): MolecularAtom => ({
  id,
  element,
  cartesian,
  occupancy: { kind: 'known', value: 1 }
})
const bond = (
  id: string,
  a: string,
  b: string,
  order: SourceBond['order'] = 'single'
): SourceBond => ({
  id,
  order,
  endpoints: [
    { sourceAtomId: a, symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] },
    { sourceAtomId: b, symmetryOperationId: 'identity', integerCellOffset: [0, 0, 0] }
  ]
})

describe('molecular construction', () => {
  it('places a custom fragment using a proper rotation and replaces terminal atoms at both anchors', () => {
    const hostId = 'modeling:atom:1'
    const host: MolecularStructureSnapshot = {
      kind: 'molecular',
      atoms: [atom(hostId, 'C', [0, 0, 0]), atom('leaving', 'H', [0, 1, 0])],
      bonds: [bond('old', hostId, 'leaving')]
    }
    const attached = attachFragment(
      host,
      {
        snapshot: {
          kind: 'molecular',
          atoms: [
            atom('anchor', 'O', [0, 0, 0]),
            atom('keep', 'H', [1, 0, 1]),
            atom('leave', 'H', [-1, 0, 0])
          ],
          bonds: [bond('retained', 'anchor', 'keep'), bond('removed', 'anchor', 'leave')]
        },
        ports: [
          {
            name: 'replace',
            atomId: 'anchor',
            direction: [-1, 0, 0],
            up: [0, 0, 1],
            leavingAtomId: 'leave'
          }
        ]
      },
      {
        target: { atomId: hostId, direction: [0, 1, 0], up: [0, 0, 1], leavingAtomId: 'leaving' },
        port: 'replace',
        distance: 1.4,
        torsionDegrees: 90
      }
    )
    if (!attached.ok) throw new Error(JSON.stringify(attached.diagnostics))
    const { snapshot, atoms, bonds } = attached.value
    expect(snapshot.atoms.map(({ element }) => element)).toEqual(['C', 'O', 'H'])
    expect(snapshot.atoms[0].id).toBe(hostId)
    expect(new Set(snapshot.atoms.map(({ id }) => id)).size).toBe(3)
    expect(snapshot.atoms[1].cartesian).toEqual([0, 1.4, 0])
    const [x, y, z] = snapshot.atoms[2].cartesian
    expect(x).toBeCloseTo(1)
    expect(y).toBeCloseTo(2.4)
    expect(z).toBeCloseTo(0)
    expect(atoms[2].origins).toEqual([{ input: 'fragment', sourceId: 'keep' }])
    expect(bonds.map(({ origins }) => origins)).toEqual([
      [{ input: 'fragment', sourceId: 'retained' }],
      []
    ])
    expect(host.bonds[0].id).toBe('old')
  })

  it('fills supported neutral, charged and aromatic explicit valences without duplicating H', () => {
    const carbons = Array.from({ length: 6 }, (_, i) => {
      const theta = (i * Math.PI) / 3
      return atom(`c${i}`, 'C', [1.4 * Math.cos(theta), 1.4 * Math.sin(theta), 0])
    })
    const source: MolecularStructureSnapshot = {
      kind: 'molecular',
      atoms: [
        ...carbons,
        atom('neutral', 'C', [5, 0, 0]),
        { ...atom('charged', 'N', [10, 0, 0]), formalCharge: 1 },
        atom('h', 'H', [11, 0, 0])
      ],
      bonds: [
        ...carbons.map((_, i) => bond(`r${i}`, `c${i}`, `c${(i + 1) % 6}`, 'aromatic')),
        bond('existingH', 'charged', 'h')
      ]
    }
    const result = addHydrogens(source)
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    expect(result.value.stats.composition).toEqual({ C: 7, N: 1, H: 14 })
    expect(result.value.stats.bondCount).toBe(20)
    expect(result.value.snapshot.bonds.find(({ id }) => id === 'existingH')).toEqual(
      source.bonds.at(-1)
    )
    const repeated = addHydrogens(result.value.snapshot)
    expect(repeated.ok && repeated.value.snapshot).toEqual(result.value.snapshot)
    const unsupported = addHydrogens(
      { ...source, atoms: [{ ...carbons[0], element: 'N' }, ...source.atoms.slice(1)] },
      ['c1']
    )
    expect(unsupported.diagnostics[0].code).toBe('HYDROGEN_VALENCE_UNSUPPORTED')
  })

  it('maps an implicit hydrogen reference to the generated stable atom without changing parity', () => {
    const result = addHydrogens(
      {
        kind: 'molecular',
        atoms: [
          {
            ...atom('center', 'C', [0, 0, 0]),
            stereoParity: { parity: 'odd', referenceAtoms: ['F', 'Cl', 'Br', null] }
          },
          atom('F', 'F', [1, 0, 0]),
          atom('Cl', 'Cl', [0, 1, 0]),
          atom('Br', 'Br', [0, 0, 1])
        ],
        bonds: ['F', 'Cl', 'Br'].map((id) => bond(`b${id}`, 'center', id)),
        stereoAbsolute: true
      },
      ['center']
    )
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const hydrogen = result.value.snapshot.atoms.find(({ element }) => element === 'H')!
    expect(result.value.snapshot.stereoAbsolute).toBe(true)
    expect(result.value.snapshot.atoms[0].stereoParity).toEqual({
      parity: 'odd',
      referenceAtoms: ['F', 'Cl', 'Br', hydrogen.id]
    })
  })

  it('creates a capped ethylene homopolymer with exact composition and one link between units', () => {
    const result = buildPolymer({
      units: { ethylene: BUILT_IN_FRAGMENTS.ethylene },
      recipe: { kind: 'homopolymer', unit: 'ethylene', count: 2 },
      ends: [
        { unit: 0, port: 'head', fragment: BUILT_IN_FRAGMENTS.hydrogen, distance: 1.09 },
        { unit: 1, port: 'tail', fragment: BUILT_IN_FRAGMENTS.hydrogen, distance: 1.09 }
      ]
    })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    expect(result.value.stats).toEqual({
      atomCount: 14,
      bondCount: 13,
      composition: { C: 4, H: 10 }
    })
    expect(result.value.snapshot.metadata?.alchemionModeling).toMatchObject({
      sequence: ['ethylene', 'ethylene'],
      unconsumedPorts: []
    })
    const anchor = (input: string, sourceId: string) =>
      result.value.atoms.find(
        ({ origins }) => origins[0].input === input && origins[0].sourceId === sourceId
      )!.id
    const tail = anchor('unit:0', 'C2')
    const head = anchor('unit:1', 'C1')
    const link = result.value.snapshot.bonds.filter(
      ({ endpoints }) => endpoints[0].sourceAtomId === tail && endpoints[1].sourceAtomId === head
    )
    expect(link).toHaveLength(1)
  })

  it('preserves block order and exact random counts, and tracks nested branches while rejecting port reuse', () => {
    const units = { A: BUILT_IN_FRAGMENTS.ethylene, B: BUILT_IN_FRAGMENTS.branch }
    const counts = [
      { unit: 'A', count: 2 },
      { unit: 'B', count: 3 }
    ]
    const block = buildPolymer({ units, recipe: { kind: 'blocks', blocks: counts } })
    expect(block.ok && block.value.parameters.sequence).toEqual(['A', 'A', 'B', 'B', 'B'])
    const recipe = { kind: 'random', counts, seed: 42 } as const
    const randomized = buildPolymer({ units, recipe })
    if (!randomized.ok) throw new Error(JSON.stringify(randomized.diagnostics))
    expect(randomized.value.parameters.sequence).toEqual(['A', 'B', 'B', 'A', 'B'])
    expect(buildPolymer({ units, recipe })).toEqual(randomized)

    const main = { kind: 'sequence', sequence: ['B'] } as const
    const branches = [
      { unit: 'B', parent: 0, parentPort: 'branch' },
      { unit: 'A', parent: 1, parentPort: 'branch' }
    ]
    const branched = buildPolymer({ units, recipe: main, branches })
    if (!branched.ok) throw new Error(JSON.stringify(branched.diagnostics))
    expect(branched.value.stats).toEqual({
      atomCount: 10,
      bondCount: 9,
      composition: { C: 4, H: 6 }
    })
    expect(branched.value.parameters.branches).toMatchObject([
      { unit: 1, parent: 0 },
      { unit: 2, parent: 1 }
    ])
    const reused = buildPolymer({ units, recipe: main, branches: [...branches, branches[0]] })
    expect(reused.diagnostics.at(-1)?.code).toBe('POLYMER_PORT_UNAVAILABLE')
  })
})
