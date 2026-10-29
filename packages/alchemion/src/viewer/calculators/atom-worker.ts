import { compile } from 'mathjs'
import { ILattice } from '../../internal/legacy/structure'
import { IAtomExtend } from './atom-extend'

onmessage = async (
  e: MessageEvent<{
    atoms: Array<IAtomExtend>
    lattice: ILattice
    settings: string[]
    cells: Array<[number, number, number]>
    cutoff: [number, number, number]
  }>
) => {
  const { atoms, lattice, cells, cutoff, settings } = e.data
  const cutoffX1 = cutoff[0] + 1
  const cutoffY1 = cutoff[1] + 1
  const cutoffZ1 = cutoff[2] + 1
  const cutoffX2 = -cutoff[0]
  const cutoffY2 = -cutoff[1]
  const cutoffZ2 = -cutoff[2]
  const newAtoms: Array<IAtomExtend> = []
  const { a, b, c, alpha, beta, gamma, volume } = lattice
  const alpha1 = alpha * (Math.PI / 180)
  const beta1 = beta * (Math.PI / 180)
  const gamma1 = gamma * (Math.PI / 180)
  const cosAlpha = alpha === 0 ? 1 : alpha === 90 ? 0 : alpha === 180 ? -1 : Math.cos(alpha1)
  const cosBeta = beta === 0 ? 1 : beta === 90 ? 0 : beta === 180 ? -1 : Math.cos(beta1)
  const cosGamma = gamma === 0 ? 1 : gamma === 90 ? 0 : gamma === 180 ? -1 : Math.cos(gamma1)
  const sinGamma = gamma === 0 ? 0 : gamma === 90 ? 1 : gamma === 180 ? 0 : Math.sin(gamma1)
  const settingsCompiled = settings.map((s) => s.split(',').map((f) => compile(f)))
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i]
      const scope = {
        x: atom.fractionalX + cell[0],
        y: atom.fractionalY + cell[1],
        z: atom.fractionalZ + cell[2]
      }
      for (let j = 0; j < settings.length; j++) {
        const operation = settingsCompiled[j]
        const [x, y, z] = operation.map((f) => f.evaluate(scope) as number)
        if (
          x >= cutoffX2 &&
          x <= cutoffX1 &&
          y >= cutoffY2 &&
          y <= cutoffY1 &&
          z >= cutoffZ2 &&
          z <= cutoffZ1
        ) {
          const x1 = x * a + y * b * cosGamma + z * c * cosBeta
          const y1 = y * b * sinGamma + (z * c * (cosAlpha - cosBeta * cosGamma)) / sinGamma
          const z1 = (z * volume) / (a * b * sinGamma)
          newAtoms.push({
            ...atom,
            name: `${atom.name}-${cell[0]}-${cell[1]}-${cell[2]}-${settings[j]}`,
            shadowBySymOp: settings[j],
            shadowFrom: atom,
            shadowByCell: cell,
            x: x1,
            y: y1,
            z: z1,
            fractionalX: x,
            fractionalY: y,
            fractionalZ: z
          })
        }
      }
    }
  }
  e.ports[0].postMessage(newAtoms)
}
