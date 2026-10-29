import { IAtom, IStructure, IWriter } from '../../internal/legacy'

export class PoscarWriter implements IWriter {
  write(structure: IStructure): string {
    let stringBuilder = ''
    stringBuilder += `${structure.title}\n`
    stringBuilder += `1.0\n`
    if (structure.lattice) {
      const { a, b, c, alpha, beta, gamma } = structure.lattice
      const alpha1 = alpha * (Math.PI / 180)
      const beta1 = beta * (Math.PI / 180)
      const gamma1 = gamma * (Math.PI / 180)
      const cosAlpha = alpha === 0 ? 1 : alpha === 90 ? 0 : alpha === 180 ? -1 : Math.cos(alpha1)
      const cosBeta = beta === 0 ? 1 : beta === 90 ? 0 : beta === 180 ? -1 : Math.cos(beta1)
      const cosGamma = gamma === 0 ? 1 : gamma === 90 ? 0 : gamma === 180 ? -1 : Math.cos(gamma1)
      const sinGamma = gamma === 0 ? 0 : gamma === 90 ? 1 : gamma === 180 ? 0 : Math.sin(gamma1)
      const a1 = [a, 0, 0]
      const b1 = [b * cosGamma, b * sinGamma, 0]
      const c1 = [
        c * cosBeta,
        (c * (cosAlpha - cosBeta * cosGamma)) / sinGamma,
        (c *
          Math.sqrt(
            1 -
              Math.pow(cosAlpha, 2) -
              Math.pow(cosBeta, 2) -
              Math.pow(cosGamma, 2) +
              2 * cosAlpha * cosBeta * cosGamma
          )) /
          sinGamma
      ]
      stringBuilder += `${a1[0]} ${a1[1]} ${a1[2]}\n`
      stringBuilder += `${b1[0]} ${b1[1]} ${b1[2]}\n`
      stringBuilder += `${c1[0]} ${c1[1]} ${c1[2]}\n`
    } else {
      stringBuilder += `${
        Math.max(...structure.atoms.map((a) => a.x)) - Math.min(...structure.atoms.map((a) => a.x))
      } 0.0 0.0\n`
      stringBuilder += `0.0 ${
        Math.max(...structure.atoms.map((a) => a.y)) - Math.min(...structure.atoms.map((a) => a.y))
      } 0.0\n`
      stringBuilder += `0.0 0.0 ${
        Math.max(...structure.atoms.map((a) => a.z)) - Math.min(...structure.atoms.map((a) => a.z))
      }\n`
    }
    const map = new Map<string, Array<IAtom>>()
    for (let index = 0; index < structure.atoms.length; index++) {
      const atom = structure.atoms[index]
      if (map.has(atom.element.symbol)) {
        map.get(atom.element.symbol)?.push(atom)
      } else {
        map.set(atom.element.symbol, [atom])
      }
    }
    let line1 = '',
      line2 = '',
      atomLines = ''
    for (const [key, value] of map) {
      line1 += `${key} `
      line2 += `${value.length} `
      atomLines += `${value.map((a) => `${a.x} ${a.y} ${a.z}`).join('\n')}\n`
    }
    stringBuilder += `${line1.trim()}\n`
    stringBuilder += `${line2.trim()}\n`
    stringBuilder += `Direct\n`
    stringBuilder += `${atomLines}`
    return stringBuilder
  }
}
