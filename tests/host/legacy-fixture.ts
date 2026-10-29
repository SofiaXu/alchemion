import type { AlchemionEditor } from 'alchemion/viewer'

/** Project-authored M1 engineering fixture, not an independent scientific reference. */
export function legacyFixture(): Parameters<AlchemionEditor['loadStructure']>[0] {
  return {
    title: 'Synthetic carbon',
    metadata: {},
    bonds: [],
    lattice: {
      a: 1,
      b: 1,
      c: 1,
      alpha: 90,
      beta: 90,
      gamma: 90,
      volume: 1,
      crystalSystem: 6,
      spaceGroup: { id: 1, name: 'P1', settingName: 'Identity', operations: ['x,y,z'] }
    },
    atoms: [
      {
        name: 'C1',
        x: 0.25,
        y: 0.25,
        z: 0.25,
        mass: 12.011,
        valence: 4,
        metadata: {},
        element: {
          id: 6,
          symbol: 'C',
          block: 'p',
          isMetal: false,
          valence: 4,
          mass: 12.011,
          radius: 0.76,
          electronegativity: 2.55,
          bondElements: [1, 6, 7, 8]
        }
      }
    ]
  }
}
