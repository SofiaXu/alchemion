import { elementsMap } from '../../../internal/legacy/elements'
import {
  CrystalSystem,
  IAtom,
  IStructure,
  spaceGroupSettings
} from '../../../internal/legacy/structure'
import { IParser } from '../../../internal/legacy/utils'
import { TokenStream } from '../common/token-stream'
import { CifDataValue, CifDocumentParser } from './cif-document-parser'
import { simplify } from 'mathjs'

export class CifParser implements IParser {
  parse(data: string): IStructure {
    const tokenStream = new TokenStream(data)
    const cifDocumentParser = new CifDocumentParser({ isCif1Only: true })
    const cifDocument = cifDocumentParser.parse(tokenStream)
    if (cifDocument.data.length === 0) {
      throw new Error('No data blocks found in CIF file.')
    }
    const dataBlock = cifDocument.data[0]
    const structure: IStructure = {
      metadata: {},
      atoms: [],
      bonds: []
    }
    const atoms = (dataBlock.atom_site_label as Array<CifDataValue>).map((atomLabel, index) => {
      if (!atomLabel) {
        throw new Error('Missing atom label.')
      }
      const x = (dataBlock.atom_site_fract_x as Array<CifDataValue>)[index]
      const y = (dataBlock.atom_site_fract_y as Array<CifDataValue>)[index]
      const z = (dataBlock.atom_site_fract_z as Array<CifDataValue>)[index]
      const occupancy = ((dataBlock.atom_site_occupancy ?? []) as Array<CifDataValue>)[index]
      const uIso = ((dataBlock.atom_site_U_iso_or_equiv ?? []) as Array<CifDataValue>)[index]
      const typeSymbol = ((dataBlock.atom_site_type_symbol ?? []) as Array<CifDataValue>)[index]
      if (
        x === undefined ||
        x === null ||
        x === false ||
        y === undefined ||
        y === null ||
        y === false ||
        z === undefined ||
        z === null ||
        z === false
      ) {
        throw new Error('Missing fractional coordinates for atom.')
      }
      const atomName = atomLabel as string
      let elementSymbol = ''
      if (typeSymbol) {
        elementSymbol = /^([A-Z][a-z]{0,2})/.exec(typeSymbol as string)?.[1] || ''
      } else {
        elementSymbol = /^([A-Z][a-z]{0,2})/.exec(atomName)?.[1] || ''
      }
      if (!elementSymbol) {
        throw new Error('Element symbol not found for atom.')
      }
      const element = elementsMap.get(elementSymbol)
      if (!element) {
        throw new Error(`Element with symbol ${elementSymbol} not found in elements map.`)
      }
      return {
        mass: element.mass,
        valence: element.valence,
        x: parseFloat(x as string),
        y: parseFloat(y as string),
        z: parseFloat(z as string),
        element,
        metadata: {},
        name: atomName,
        occupancy:
          occupancy === undefined
            ? undefined
            : occupancy === null
              ? undefined
              : occupancy === false
                ? false
                : parseFloat(occupancy as string),
        temperatureFactor:
          uIso === undefined
            ? undefined
            : uIso === null
              ? undefined
              : uIso === false
                ? false
                : parseFloat(uIso as string)
      } as IAtom
    })
    const a = dataBlock.cell_length_a ? parseFloat(dataBlock.cell_length_a as string) : 0
    const b = dataBlock.cell_length_b ? parseFloat(dataBlock.cell_length_b as string) : 0
    const c = dataBlock.cell_length_c ? parseFloat(dataBlock.cell_length_c as string) : 0
    const alpha = dataBlock.cell_angle_alpha ? parseFloat(dataBlock.cell_angle_alpha as string) : 0
    const beta = dataBlock.cell_angle_beta ? parseFloat(dataBlock.cell_angle_beta as string) : 0
    const gamma = dataBlock.cell_angle_gamma ? parseFloat(dataBlock.cell_angle_gamma as string) : 0
    let volume = dataBlock.cell_volume ? parseFloat(dataBlock.cell_volume as string) : 0
    if (volume === 0) {
      volume =
        a *
        b *
        c *
        Math.sqrt(
          1 -
            Math.cos(alpha) ** 2 -
            Math.cos(beta) ** 2 -
            Math.cos(gamma) ** 2 +
            2 * Math.cos(alpha) * Math.cos(beta) * Math.cos(gamma)
        )
    }
    let spaceGroup = dataBlock.space_group_IT_number as number
    if (!spaceGroup) {
      spaceGroup = dataBlock.symmetry_Int_Tables_number as number
    }
    const spaceGroupSetting = spaceGroupSettings.find((s) => s.id === spaceGroup)
    let ops = dataBlock.space_group_symop_operation_xyz as string[]
    if (!ops) {
      ops = dataBlock.symmetry_equiv_pos_as_xyz as string[]
    }
    let setting = spaceGroupSetting?.settings[0]?.operations || []
    let settingName = spaceGroupSetting?.settings[0]?.name || ''
    if (ops) {
      const set = new Set<string>()
      ops.forEach((op) => {
        const s = op
          .split(',')
          .map((x) => simplify(x).toString())
          .join(',')
        set.add(s)
      })
      const temp = spaceGroupSetting?.settings.find((s) => {
        return s.operations.every((op) => {
          const s = op
            .split(',')
            .map((x) => simplify(x).toString())
            .join(',')
          return set.has(s)
        })
      })
      if (temp) {
        setting = temp.operations
        settingName = temp.name
      } else {
        setting = ops
        settingName = 'Custom'
      }
    }
    structure.lattice = {
      a,
      b,
      c,
      alpha,
      beta,
      gamma,
      volume,
      crystalSystem: spaceGroupSetting?.crystalSystem || CrystalSystem.Triclinic,
      spaceGroup: {
        name: spaceGroupSetting?.name || '',
        id: spaceGroupSetting?.id || 0,
        settingName: settingName,
        operations: setting
      }
    }
    structure.atoms = atoms
    return structure
  }
}
