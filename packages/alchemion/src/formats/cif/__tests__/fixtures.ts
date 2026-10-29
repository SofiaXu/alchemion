// Independently project-authored CIF fixtures. MIT; no third-party sample text.
export const skewCif = `data_skew
_cell_length_a 2.000(2)
_cell_length_b 2
_cell_length_c 4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 60
_cell_volume 13.856406460551018
_space_group_IT_number 1
_space_group_name_H-M_alt 'P 1'
_space_group_name_Hall 'P 1'
loop_
_space_group_symop_operation_xyz
'x,y,z'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
_atom_site_U_iso_or_equiv
same C .2500(5) .5000(6) .7500(7) 1 .0100(2)
same O .5 .25 .125 ? .
`

export const cartesianCif = `data_cartesian
_cell.length_a 2
_cell.length_b 3
_cell.length_c 4
_cell.angle_alpha 90
_cell.angle_beta 90
_cell.angle_gamma 90
loop_
_atom_site.label
_atom_site.type_symbol
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
C1 C 0.500(2) 1.500 3.000(5) 1 0.80(2)
`

export const inversionCif = `data_inversion
_cell_length_a 2
_cell_length_b 3
_cell_length_c 4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_symmetry_Int_Tables_number 2
_symmetry_space_group_name_H-M 'P -1'
_symmetry_space_group_name_Hall '-P 1'
loop_
_symmetry_equiv_pos_as_xyz
'x,y,z'
'-x,-y,-z'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Fe1 Fe3+ 0.1 0.2 0.3
`

export const cif2Document = `#\\#CIF_2.0
data_Unicode_😀
_description '''A multiline
Unicode α value'''
_compound [1 ? . {'name':'value' 'nested':[2 3]}]
_prefixed
;CIF>\\
CIF>;embedded
CIF>text
;
save_definition
_definition.id '_arbitrary_name'
save_
`

export const referenceCases = [
  {
    name: 'skew',
    text: skewCif,
    expected: {
      cellParameters: { a: 2, b: 2, c: 4, alpha: 90, beta: 90, gamma: 60 },
      cellBasis: [
        [2, 0, 0],
        [1, Math.sqrt(3), 0],
        [0, 0, 4]
      ],
      cellParameterUncertainties: { a: 0.002 },
      volume: 8 * Math.sqrt(3),
      atoms: [
        {
          label: 'same',
          element: 'C',
          fractional: [0.25, 0.5, 0.75],
          cartesian: [1, Math.sqrt(3) / 2, 3],
          occupancy: 1,
          displacementU: 0.01,
          displacementUSu: 0.0002,
          fractionalSu: [0.0005, 0.0006, 0.0007]
        },
        {
          label: 'same',
          element: 'O',
          fractional: [0.5, 0.25, 0.125],
          cartesian: [1.25, Math.sqrt(3) / 4, 0.5],
          occupancy: '?',
          displacementU: '.'
        }
      ],
      operationCount: 1
    }
  },
  {
    name: 'cartesian',
    text: cartesianCif,
    expected: {
      cellParameters: { a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 },
      cellBasis: [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4]
      ],
      volume: 24,
      atoms: [
        {
          label: 'C1',
          element: 'C',
          fractional: [0.25, 0.5, 0.75],
          cartesian: [0.5, 1.5, 3],
          occupancy: 1,
          displacementU: 0.8 / (8 * Math.PI ** 2),
          displacementUSu: 0.02 / (8 * Math.PI ** 2),
          displacementB: 0.8,
          displacementBSu: 0.02,
          cartesianSu: [0.002, null, 0.005]
        }
      ],
      operationCount: 1
    }
  },
  {
    name: 'inversion',
    text: inversionCif,
    expected: {
      cellParameters: { a: 2, b: 3, c: 4, alpha: 90, beta: 90, gamma: 90 },
      cellBasis: [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4]
      ],
      volume: 24,
      atoms: [
        {
          label: 'Fe1',
          element: 'Fe',
          oxidationState: 3,
          fractional: [0.1, 0.2, 0.3],
          cartesian: [0.2, 0.6, 1.2],
          occupancy: 1
        }
      ],
      operationCount: 2
    }
  }
] as const
