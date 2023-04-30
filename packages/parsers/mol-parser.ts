import { IParser } from '@alchemion/core/utils/io'
import { Atom, Structure } from '@alchemion/core/structure'
import { elementsMap } from '@alchemion/core/elements'

export class MolParser implements IParser {
  parse(data: string): Structure {
    const lines = data.split('\n')
    const structure = new Structure()
    let line = lines.shift()?.trimEnd()
    structure.title = line
    line = lines.shift()?.trim()
    structure.metadata.original = {}
    structure.metadata.original.createdSoftware = line
    structure.metadata.original.data = data
    line = lines.shift()
    this.parseV2000(lines, structure)
    return structure
  }
  private parseV2000(lines: string[], structure: Structure) {
    // parse header
    let line = lines.shift()
    const atomCount = parseInt(line?.substring(0, 3) ?? '0')
    const bondCount = parseInt(line?.substring(3, 6) ?? '0')
    const isChiral = line?.substring(12, 15) === '1'
    structure.metadata.original.version = line?.substring(39, 42)
    // parse atoms
    for (let i = 0; i < atomCount; i++) {
      line = lines.shift()
      const x = parseFloat(line?.substring(0, 10).trim() ?? '0')
      const y = parseFloat(line?.substring(10, 20).trim() ?? '0')
      const z = parseFloat(line?.substring(20, 30).trim() ?? '0')
      const elementSymbol = line?.substring(31, 34).trim() ?? 'H'
      const mass = parseInt(line?.substring(34, 36).trim() ?? '0')
      const element = elementsMap.get(elementSymbol)
      if (!element)
        throw Error(
          `Unable to parse mol file. Element with symbol ${elementSymbol} not found in elements map.`
        )
      const atom = new Atom(element, x, y, z)
      atom.mass = atom.element.mass + mass
      structure.addAtom(atom)
    }
    const atoms = structure.atoms
    // parse bonds
    for (let i = 0; i < bondCount; i++) {
      line = lines.shift()
      const source = parseInt(line?.substring(0, 3).trim() ?? '0')
      const target = parseInt(line?.substring(3, 6).trim() ?? '0')
      const type = parseInt(line?.substring(6, 9).trim() ?? '8')
      const stereo = parseInt(line?.substring(9, 12).trim() ?? '0')
      const bond = structure.createBond(
        atoms[source - 1],
        atoms[target - 1],
        type === 1
          ? 'single'
          : type === 2
          ? 'double'
          : type === 3
          ? 'triple'
          : type === 4
          ? 'aromatic'
          : undefined
      )
      bond.stereo = !isChiral ? undefined : stereo === 1 ? 'up' : stereo === 6 ? 'down' : undefined
    }
  }
}
