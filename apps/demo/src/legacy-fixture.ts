import type { AlchemionEditor } from 'alchemion/viewer'

/** Temporary project-authored historical demo input; the M5 viewer will consume the new model. */
export function legacyFixture(): Parameters<AlchemionEditor['loadStructure']>[0] {
  return {
    title: 'Synthetic carbon',
    metadata: {},
    bonds: [],
    atoms: [
      {
        name: 'C1',
        x: 0,
        y: 0,
        z: 0,
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
