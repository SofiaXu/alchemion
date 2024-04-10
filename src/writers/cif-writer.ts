import { IStructure, IWriter } from '../core'

export class CifWriter implements IWriter {
  write(structure: IStructure): string {
    let stringBuilder = ''
    stringBuilder += `data_${structure.title}\n`
    stringBuilder += `_audit_creation_method 'Alchemion'\n`
    if (structure.lattice) {
      stringBuilder += `_cell_length_a ${structure.lattice.a}\n`
      stringBuilder += `_cell_length_b ${structure.lattice.b}\n`
      stringBuilder += `_cell_length_c ${structure.lattice.c}\n`
      stringBuilder += `_cell_angle_alpha ${structure.lattice.alpha}\n`
      stringBuilder += `_cell_angle_beta ${structure.lattice.beta}\n`
      stringBuilder += `_cell_angle_gamma ${structure.lattice.gamma}\n`
      stringBuilder += `_symmetry_space_group_name_H-M '${structure.lattice.spaceGroup.name}'\n`
      stringBuilder += `_symmetry_Int_Tables_number ${structure.lattice.spaceGroup.id}\n`
      stringBuilder += `_space_group_IT_number ${structure.lattice.spaceGroup.id}\n`
      stringBuilder += `_cell_volume ${structure.lattice.volume}\n`
      stringBuilder += `loop_\n`
      stringBuilder += `_symmetry_equiv_pos_as_xyz\n`
      for (let index = 0; index < structure.lattice.spaceGroup.operations.length; index++) {
        stringBuilder += `${structure.lattice.spaceGroup.operations[index]}\n`
      }
    }
    stringBuilder += `loop_\n`
    stringBuilder += `_atom_site_label\n`
    stringBuilder += `_atom_site_type_symbol\n`
    stringBuilder += `_atom_site_fract_x\n`
    stringBuilder += `_atom_site_fract_y\n`
    stringBuilder += `_atom_site_fract_z\n`
    stringBuilder += `_atom_site_occupancy\n`
    stringBuilder += `_atom_site_U_iso_or_equiv\n`
    for (let index = 0; index < structure.atoms.length; index++) {
      const atom = structure.atoms[index]
      stringBuilder += `${atom.name} ${atom.element.symbol} ${atom.x} ${atom.y} ${atom.z} ${
        atom.occupancy === undefined ? '.' : atom.occupancy === false ? '?' : atom.occupancy
      } ${
        atom.temperatureFactor === undefined
          ? '.'
          : atom.temperatureFactor === false
            ? '?'
            : atom.temperatureFactor
      }\n`
    }
    return stringBuilder
  }
}
