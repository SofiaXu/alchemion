import { IParser } from '../../core/utils'
import { IAtom, IBond, IStructure } from '../../core/structure'
import { elementsMap } from '../../core/elements'
import { TokenStream } from './common/token-stream'

export class MolParser implements IParser {
  parse(data: string): IStructure {
    const tokenStream = new TokenStream(data)
    const structure = this.parseStructure(tokenStream)
    structure.metadata.original = data
    return structure
  }
  private parseStructure(tokenStream: TokenStream): IStructure {
    const structure: IStructure = {
      metadata: {},
      atoms: [],
      bonds: []
    }
    structure.title = tokenStream.peekLineRaw()
    tokenStream.skipLine(true)
    structure.metadata.mol = {}
    structure.metadata.mol.header = tokenStream.peekLineRaw()
    tokenStream.skipLine(true)
    structure.metadata.mol.comment = tokenStream.peekLineRaw()
    tokenStream.skipLine(true)
    const countLine = tokenStream.peekLineRaw()
    const atomCount = parseInt(countLine.substring(0, 3) ?? '0')
    const bondCount = parseInt(countLine.substring(3, 6) ?? '0')
    const isChiral = countLine.substring(12, 15) === '1'
    tokenStream.skipLine(true)
    for (let i = 0; i < atomCount; i++) {
      const atom = this.parseAtom(tokenStream)
      structure.atoms.push(atom)
    }
    for (let i = 0; i < bondCount; i++) {
      const bond = this.parseBond(tokenStream, structure.atoms, isChiral)
      if (bond) structure.bonds.push(bond)
    }
    return structure
  }
  private parseAtom(tokenStream: TokenStream): IAtom {
    const line = tokenStream.peekLineRaw()
    tokenStream.skipLine(true)
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
    return {
      mass: element.mass + mass,
      valence: element.valence,
      x,
      y,
      z,
      element,
      name: elementSymbol,
      metadata: {}
    }
  }
  private parseBond(
    tokenStream: TokenStream,
    atoms: IAtom[],
    isChiral: boolean
  ): IBond | undefined {
    const line = tokenStream.peekLineRaw()
    tokenStream.skipLine(true)
    const source = parseInt(line?.substring(0, 3).trim() ?? '0')
    const target = parseInt(line?.substring(3, 6).trim() ?? '0')
    const type = parseInt(line?.substring(6, 9).trim() ?? '8')
    const stereo = parseInt(line?.substring(9, 12).trim() ?? '0')
    return {
      source: atoms[source - 1],
      target: atoms[target - 1],
      type:
        type === 1
          ? 'single'
          : type === 2
            ? 'double'
            : type === 3
              ? 'triple'
              : type === 4
                ? 'aromatic'
                : 'single',
      stereo: !isChiral ? undefined : stereo === 1 ? 'up' : stereo === 6 ? 'down' : undefined,
      metadata: {}
    }
  }
  // parse(data: string): IStructure {
  //   const lines = data.split("\n");
  //   const structure = new Structure();
  //   let line = lines.shift()?.trimEnd();
  //   structure.title = line;
  //   line = lines.shift()?.trim();
  //   structure.metadata.original = {};
  //   structure.metadata.original.createdSoftware = line;
  //   structure.metadata.original.data = data;
  //   line = lines.shift();
  //   this.parseV2000(lines, structure);
  //   return structure;
  // }
  // private parseV2000(lines: string[], structure: IStructure) {
  //   // parse header
  //   let line = lines.shift();
  //   const atomCount = parseInt(line?.substring(0, 3) ?? "0");
  //   const bondCount = parseInt(line?.substring(3, 6) ?? "0");
  //   const isChiral = line?.substring(12, 15) === "1";
  //   structure.metadata.original.version = line?.substring(39, 42);
  //   // parse atoms
  //   for (let i = 0; i < atomCount; i++) {
  //     line = lines.shift();
  //     const x = parseFloat(line?.substring(0, 10).trim() ?? "0");
  //     const y = parseFloat(line?.substring(10, 20).trim() ?? "0");
  //     const z = parseFloat(line?.substring(20, 30).trim() ?? "0");
  //     const elementSymbol = line?.substring(31, 34).trim() ?? "H";
  //     const mass = parseInt(line?.substring(34, 36).trim() ?? "0");
  //     const element = elementsMap.get(elementSymbol);
  //     if (!element)
  //       throw Error(
  //         `Unable to parse mol file. Element with symbol ${elementSymbol} not found in elements map.`
  //       );
  //     const atom = new Atom(element, x, y, z);
  //     atom.mass = atom.element.mass + mass;
  //     structure.addAtom(atom);
  //   }
  //   const atoms = structure.atoms;
  //   // parse bonds
  //   for (let i = 0; i < bondCount; i++) {
  //     line = lines.shift();
  //     const source = parseInt(line?.substring(0, 3).trim() ?? "0");
  //     const target = parseInt(line?.substring(3, 6).trim() ?? "0");
  //     const type = parseInt(line?.substring(6, 9).trim() ?? "8");
  //     const stereo = parseInt(line?.substring(9, 12).trim() ?? "0");
  //     const bond = structure.createBond(
  //       atoms[source - 1],
  //       atoms[target - 1],
  //       type === 1
  //         ? "single"
  //         : type === 2
  //         ? "double"
  //         : type === 3
  //         ? "triple"
  //         : type === 4
  //         ? "aromatic"
  //         : undefined
  //     );
  //     bond.stereo = !isChiral
  //       ? undefined
  //       : stereo === 1
  //       ? "up"
  //       : stereo === 6
  //       ? "down"
  //       : undefined;
  //   }
  // }
}
