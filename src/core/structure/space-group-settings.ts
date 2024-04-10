export enum CrystalSystem {
  Triclinic,
  Monoclinic,
  Orthorhombic,
  Tetragonal,
  Trigonal,
  Hexagonal,
  Cubic
}
export const spaceGroupSettings: {
  readonly id: number
  readonly name: string
  readonly settings: {
    readonly name: string
    readonly operations: string[]
  }[]
  readonly crystalSystem: CrystalSystem
}[] = [
  {
    id: 1,
    name: 'P1',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Triclinic
  },
  {
    id: 2,
    name: 'P-1',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Triclinic
  },
  {
    id: 3,
    name: 'P2',
    settings: [
      {
        name: 'UNIQUE AXIS b',
        operations: ['x,y,z', '-x,y,-z']
      },
      {
        name: 'UNIQUE AXIS c',
        operations: ['x,y,z', '-x,-y,z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 4,
    name: 'P21',
    settings: [
      {
        name: 'UNIQUE AXIS b',
        operations: ['x,y,z', '-x,y\u002B1/2,-z']
      },
      {
        name: 'UNIQUE AXIS c',
        operations: ['x,y,z', '-x,-y,z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 5,
    name: 'C2',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', '-x,y,-z']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: ['x,y,z', '-x,y,-z']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', '-x,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', '-x,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: ['x,y,z', '-x,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', '-x,-y,z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 6,
    name: 'Pm',
    settings: [
      {
        name: 'UNIQUE AXIS b',
        operations: ['x,y,z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS c',
        operations: ['x,y,z', 'x,y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 7,
    name: 'Pc',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', 'x,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: ['x,y,z', 'x\u002B1/2,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', 'x\u002B1/2,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', 'x\u002B1/2,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: ['x,y,z', 'x\u002B1/2,y\u002B1/2,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', 'x,y\u002B1/2,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 8,
    name: 'Cm',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: ['x,y,z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', 'x,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: ['x,y,z', 'x,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', 'x,y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 9,
    name: 'Cc',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', 'x,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: ['x,y,z', 'x\u002B1/2,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', 'x\u002B1/2,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', 'x\u002B1/2,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: ['x,y,z', 'x\u002B1/2,y\u002B1/2,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', 'x,y\u002B1/2,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 10,
    name: 'P2/m',
    settings: [
      {
        name: 'UNIQUE AXIS b',
        operations: ['x,y,z', '-x,y,-z', '-x,-y,-z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS c',
        operations: ['x,y,z', '-x,-y,z', '-x,-y,-z', 'x,y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 11,
    name: 'P21/m',
    settings: [
      {
        name: 'UNIQUE AXIS b',
        operations: ['x,y,z', '-x,y\u002B1/2,-z', '-x,-y,-z', 'x,-y\u002B1/2,z']
      },
      {
        name: 'UNIQUE AXIS c',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', '-x,-y,-z', 'x,y,-z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 12,
    name: 'C2/m',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', '-x,y,-z', '-x,-y,-z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: ['x,y,z', '-x,y,-z', '-x,-y,-z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', '-x,y,-z', '-x,-y,-z', 'x,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', '-x,-y,z', '-x,-y,-z', 'x,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: ['x,y,z', '-x,-y,z', '-x,-y,-z', 'x,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', '-x,-y,z', '-x,-y,-z', 'x,y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 13,
    name: 'P2/c',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', '-x,y,-z\u002B1/2', '-x,-y,-z', 'x,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: ['x,y,z', '-x\u002B1/2,y,-z\u002B1/2', '-x,-y,-z', 'x\u002B1/2,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', '-x\u002B1/2,y,-z', '-x,-y,-z', 'x\u002B1/2,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', '-x\u002B1/2,-y,z', '-x,-y,-z', 'x\u002B1/2,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: ['x,y,z', '-x\u002B1/2,-y\u002B1/2,z', '-x,-y,-z', 'x\u002B1/2,y\u002B1/2,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', '-x,-y\u002B1/2,z', '-x,-y,-z', 'x,y\u002B1/2,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 14,
    name: 'P21/c',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', '-x,y\u002B1/2,-z\u002B1/2', '-x,-y,-z', 'x,-y\u002B1/2,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2'
        ]
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', '-x\u002B1/2,y\u002B1/2,-z', '-x,-y,-z', 'x\u002B1/2,-y\u002B1/2,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', '-x\u002B1/2,-y,z\u002B1/2', '-x,-y,-z', 'x\u002B1/2,y,-z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2'
        ]
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', '-x,-y\u002B1/2,z\u002B1/2', '-x,-y,-z', 'x,y\u002B1/2,-z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 15,
    name: 'C2/c',
    settings: [
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 1',
        operations: ['x,y,z', '-x,y,-z\u002B1/2', '-x,-y,-z', 'x,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 2',
        operations: ['x,y,z', '-x\u002B1/2,y,-z\u002B1/2', '-x,-y,-z', 'x\u002B1/2,-y,z\u002B1/2']
      },
      {
        name: 'UNIQUE AXIS b, CELL CHOICE 3',
        operations: ['x,y,z', '-x\u002B1/2,y,-z', '-x,-y,-z', 'x\u002B1/2,-y,z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 1',
        operations: ['x,y,z', '-x\u002B1/2,-y,z', '-x,-y,-z', 'x\u002B1/2,y,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 2',
        operations: ['x,y,z', '-x\u002B1/2,-y\u002B1/2,z', '-x,-y,-z', 'x\u002B1/2,y\u002B1/2,-z']
      },
      {
        name: 'UNIQUE AXIS c, CELL CHOICE 3',
        operations: ['x,y,z', '-x,-y\u002B1/2,z', '-x,-y,-z', 'x,y\u002B1/2,-z']
      }
    ],
    crystalSystem: CrystalSystem.Monoclinic
  },
  {
    id: 16,
    name: 'P222',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-x,y,-z', 'x,-y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 17,
    name: 'P2221',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', '-x,y,-z\u002B1/2', 'x,-y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 18,
    name: 'P21212',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-x\u002B1/2,y\u002B1/2,-z', 'x\u002B1/2,-y\u002B1/2,-z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 19,
    name: 'P212121',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 20,
    name: 'C2221',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', '-x,y,-z\u002B1/2', 'x,-y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 21,
    name: 'C222',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-x,y,-z', 'x,-y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 22,
    name: 'F222',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-x,y,-z', 'x,-y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 23,
    name: 'I222',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-x,y,-z', 'x,-y,-z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 24,
    name: 'I212121',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 25,
    name: 'Pmm2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y,z', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 26,
    name: 'Pmc21',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', 'x,-y,z\u002B1/2', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 27,
    name: 'Pcc2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y,z\u002B1/2', '-x,y,z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 28,
    name: 'Pma2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x\u002B1/2,-y,z', '-x\u002B1/2,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 29,
    name: 'Pca21',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', 'x\u002B1/2,-y,z', '-x\u002B1/2,y,z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 30,
    name: 'Pnc2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y\u002B1/2,z\u002B1/2', '-x,y\u002B1/2,z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 31,
    name: 'Pmn21',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x\u002B1/2,-y,z\u002B1/2', 'x\u002B1/2,-y,z\u002B1/2', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 32,
    name: 'Pba2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x\u002B1/2,-y\u002B1/2,z', '-x\u002B1/2,y\u002B1/2,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 33,
    name: 'Pna21',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 34,
    name: 'Pnn2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 35,
    name: 'Cmm2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y,z', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 36,
    name: 'Cmc21',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', 'x,-y,z\u002B1/2', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 37,
    name: 'Ccc2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y,z\u002B1/2', '-x,y,z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 38,
    name: 'Amm2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y,z', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 39,
    name: 'Aem2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y\u002B1/2,z', '-x,y\u002B1/2,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 40,
    name: 'Ama2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x\u002B1/2,-y,z', '-x\u002B1/2,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 41,
    name: 'Aea2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x\u002B1/2,-y\u002B1/2,z', '-x\u002B1/2,y\u002B1/2,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 42,
    name: 'Fmm2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y,z', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 43,
    name: 'Fdd2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'x\u002B1/4,-y\u002B1/4,z\u002B1/4',
          '-x\u002B1/4,y\u002B1/4,z\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 44,
    name: 'Imm2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x,-y,z', '-x,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 45,
    name: 'Iba2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x\u002B1/2,-y\u002B1/2,z', '-x\u002B1/2,y\u002B1/2,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 46,
    name: 'Ima2',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'x\u002B1/2,-y,z', '-x\u002B1/2,y,z']
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 47,
    name: 'Pmmm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 48,
    name: 'Pnnn',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 49,
    name: 'Pccm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z\u002B1/2',
          'x,-y,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 50,
    name: 'Pban',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          '-x\u002B1/2,-y\u002B1/2,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y,-z',
          'x,-y\u002B1/2,-z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,z',
          '-x,y\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 51,
    name: 'Pmma',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z',
          '-x,y,-z',
          'x\u002B1/2,-y,-z',
          '-x,-y,-z',
          'x\u002B1/2,y,-z',
          'x,-y,z',
          '-x\u002B1/2,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 52,
    name: 'Pnna',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x,-y\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y,-z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x,y\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 53,
    name: 'Pmna',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y,-z',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 54,
    name: 'Pcca',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z',
          '-x,y,-z\u002B1/2',
          'x\u002B1/2,-y,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y,-z',
          'x,-y,z\u002B1/2',
          '-x\u002B1/2,y,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 55,
    name: 'Pbam',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-x,-y,-z',
          'x,y,-z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 56,
    name: 'Pccn',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 57,
    name: 'Pbcm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x,-y\u002B1/2,-z',
          '-x,-y,-z',
          'x,y,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x,y\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 58,
    name: 'Pnnm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 59,
    name: 'Pmmn',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-x\u002B1/2,-y\u002B1/2,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x,-y,z',
          '-x,y,z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x,y\u002B1/2,-z',
          'x\u002B1/2,-y,-z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x,-y\u002B1/2,z',
          '-x\u002B1/2,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 60,
    name: 'Pbcn',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x,y,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x,-y,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 61,
    name: 'Pbca',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 62,
    name: 'Pnma',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 63,
    name: 'Cmcm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z\u002B1/2',
          '-x,y,-z\u002B1/2',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y,-z\u002B1/2',
          'x,-y,z\u002B1/2',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 64,
    name: 'Cmce',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y\u002B1/2,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y\u002B1/2,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 65,
    name: 'Cmmm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 66,
    name: 'Cccm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z\u002B1/2',
          'x,-y,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 67,
    name: 'Cmme',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y\u002B1/2,z',
          '-x,y\u002B1/2,-z',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y\u002B1/2,-z',
          'x,-y\u002B1/2,z',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 68,
    name: 'Ccce',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x,y,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-x,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y,z\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z',
          '-x,y,-z\u002B1/2',
          'x\u002B1/2,-y,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y,-z',
          'x,-y,z\u002B1/2',
          '-x\u002B1/2,y,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 69,
    name: 'Fmmm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 70,
    name: 'Fddd',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          '-x\u002B1/4,-y\u002B1/4,-z\u002B1/4',
          'x\u002B1/4,y\u002B1/4,-z\u002B1/4',
          'x\u002B1/4,-y\u002B1/4,z\u002B1/4',
          '-x\u002B1/4,y\u002B1/4,z\u002B1/4'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B3/4,-y\u002B3/4,z',
          '-x\u002B3/4,y,-z\u002B3/4',
          'x,-y\u002B3/4,-z\u002B3/4',
          '-x,-y,-z',
          'x\u002B1/4,y\u002B1/4,-z',
          'x\u002B1/4,-y,z\u002B1/4',
          '-x,y\u002B1/4,z\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 71,
    name: 'Immm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 72,
    name: 'Ibam',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-x,-y,-z',
          'x,y,-z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 73,
    name: 'Ibca',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 74,
    name: 'Imma',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y\u002B1/2,z',
          '-x,y\u002B1/2,-z',
          'x,-y,-z',
          '-x,-y,-z',
          'x,y\u002B1/2,-z',
          'x,-y\u002B1/2,z',
          '-x,y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Orthorhombic
  },
  {
    id: 75,
    name: 'P4',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-y,x,z', 'y,-x,z']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 76,
    name: 'P41',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', '-y,x,z\u002B1/4', 'y,-x,z\u002B3/4']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 77,
    name: 'P42',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-y,x,z\u002B1/2', 'y,-x,z\u002B1/2']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 78,
    name: 'P43',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z\u002B1/2', '-y,x,z\u002B3/4', 'y,-x,z\u002B1/4']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 79,
    name: 'I4',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-y,x,z', 'y,-x,z']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 80,
    name: 'I41',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x,z\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 81,
    name: 'P-4',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'y,-x,-z', '-y,x,-z']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 82,
    name: 'I-4',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', 'y,-x,-z', '-y,x,-z']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 83,
    name: 'P4/m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 84,
    name: 'P42/m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z\u002B1/2',
          '-y,x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 85,
    name: 'P4/n',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z',
          'y\u002B1/2,-x\u002B1/2,z',
          '-x\u002B1/2,-y\u002B1/2,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y,-x,-z',
          '-y,x,-z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z',
          'y,-x\u002B1/2,z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z',
          '-y,x\u002B1/2,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 86,
    name: 'P42/n',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'y,-x,-z',
          '-y,x,-z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x,z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y,-x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 87,
    name: 'I4/m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 88,
    name: 'I41/a',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x,z\u002B3/4',
          '-x,-y\u002B1/2,-z\u002B1/4',
          'x\u002B1/2,y,-z\u002B3/4',
          'y,-x,-z',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-y\u002B3/4,x\u002B1/4,z\u002B1/4',
          'y\u002B3/4,-x\u002B3/4,z\u002B3/4',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'y\u002B1/4,-x\u002B3/4,-z\u002B3/4',
          '-y\u002B1/4,x\u002B1/4,-z\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 89,
    name: 'P422',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z',
          '-y,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 90,
    name: 'P4212',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z',
          'y\u002B1/2,-x\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          'y,x,-z',
          '-y,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 91,
    name: 'P4122',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z\u002B1/2',
          '-y,x,z\u002B1/4',
          'y,-x,z\u002B3/4',
          '-x,y,-z',
          'x,-y,-z\u002B1/2',
          'y,x,-z\u002B3/4',
          '-y,-x,-z\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 92,
    name: 'P41212',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x\u002B1/2,z\u002B3/4',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/4',
          'x\u002B1/2,-y\u002B1/2,-z\u002B3/4',
          'y,x,-z',
          '-y,-x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 93,
    name: 'P4222',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 94,
    name: 'P42212',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'y,x,-z',
          '-y,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 95,
    name: 'P4322',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z\u002B1/2',
          '-y,x,z\u002B3/4',
          'y,-x,z\u002B1/4',
          '-x,y,-z',
          'x,-y,-z\u002B1/2',
          'y,x,-z\u002B1/4',
          '-y,-x,-z\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 96,
    name: 'P43212',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,z\u002B3/4',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/4',
          '-x\u002B1/2,y\u002B1/2,-z\u002B3/4',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/4',
          'y,x,-z',
          '-y,-x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 97,
    name: 'I422',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z',
          '-y,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 98,
    name: 'I4122',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x,z\u002B3/4',
          '-x\u002B1/2,y,-z\u002B3/4',
          'x,-y\u002B1/2,-z\u002B1/4',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 99,
    name: 'P4mm',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-y,x,z', 'y,-x,z', 'x,-y,z', '-x,y,z', '-y,-x,z', 'y,x,z']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 100,
    name: 'P4bm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 101,
    name: 'P42cm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 102,
    name: 'P42nm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 103,
    name: 'P4cc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 104,
    name: 'P4nc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 105,
    name: 'P42mc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          'x,-y,z',
          '-x,y,z',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 106,
    name: 'P42bc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 107,
    name: 'I4mm',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-x,-y,z', '-y,x,z', 'y,-x,z', 'x,-y,z', '-x,y,z', '-y,-x,z', 'y,x,z']
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 108,
    name: 'I4cm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 109,
    name: 'I41md',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x,z\u002B3/4',
          'x,-y,z',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-y,-x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,x,z\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 110,
    name: 'I41cd',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x,z\u002B3/4',
          'x,-y,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z',
          '-y,-x\u002B1/2,z\u002B3/4',
          'y\u002B1/2,x,z\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 111,
    name: 'P-42m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          '-x,y,-z',
          'x,-y,-z',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 112,
    name: 'P-42c',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          '-x,y,-z\u002B1/2',
          'x,-y,-z\u002B1/2',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 113,
    name: 'P-421m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 114,
    name: 'P-421c',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 115,
    name: 'P-4m2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z',
          '-x,y,z',
          'y,x,-z',
          '-y,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 116,
    name: 'P-4c2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 117,
    name: 'P-4b2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,-z',
          '-y\u002B1/2,-x\u002B1/2,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 118,
    name: 'P-4n2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 119,
    name: 'I-4m2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z',
          '-x,y,z',
          'y,x,-z',
          '-y,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 120,
    name: 'I-4c2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 121,
    name: 'I-42m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          '-x,y,-z',
          'x,-y,-z',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 122,
    name: 'I-42d',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          'y,-x,-z',
          '-y,x,-z',
          '-x\u002B1/2,y,-z\u002B3/4',
          'x\u002B1/2,-y,-z\u002B3/4',
          '-y\u002B1/2,-x,z\u002B3/4',
          'y\u002B1/2,x,z\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 123,
    name: 'P4/mmm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z',
          '-y,-x,-z',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z',
          '-x,y,z',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 124,
    name: 'P4/mcc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z\u002B1/2',
          'x,-y,-z\u002B1/2',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 125,
    name: 'P4/nbm',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z',
          '-y,-x,-z',
          '-x\u002B1/2,-y\u002B1/2,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x\u002B1/2,-z',
          '-y\u002B1/2,x\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z',
          'y,-x\u002B1/2,z',
          '-x\u002B1/2,y,-z',
          'x,-y\u002B1/2,-z',
          'y,x,-z',
          '-y\u002B1/2,-x\u002B1/2,-z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z',
          '-y,x\u002B1/2,-z',
          'x\u002B1/2,-y,z',
          '-x,y\u002B1/2,z',
          '-y,-x,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 126,
    name: 'P4/nnc',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z',
          '-y,-x,-z',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z',
          'y,-x\u002B1/2,z',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,-z\u002B1/2',
          'y,x,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z',
          '-y,x\u002B1/2,-z',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,z\u002B1/2',
          '-y,-x,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 127,
    name: 'P4/mbm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          'y\u002B1/2,x\u002B1/2,-z',
          '-y\u002B1/2,-x\u002B1/2,-z',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 128,
    name: 'P4/mnc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 129,
    name: 'P4/nmm',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z',
          'y\u002B1/2,-x\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          'y,x,-z',
          '-y,-x,-z',
          '-x\u002B1/2,-y\u002B1/2,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z',
          '-x,y,z',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z',
          'y,-x\u002B1/2,z',
          '-x,y\u002B1/2,-z',
          'x\u002B1/2,-y,-z',
          'y\u002B1/2,x\u002B1/2,-z',
          '-y,-x,-z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z',
          '-y,x\u002B1/2,-z',
          'x,-y\u002B1/2,z',
          '-x\u002B1/2,y,z',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 130,
    name: 'P4/ncc',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z',
          'y\u002B1/2,-x\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x\u002B1/2,-y\u002B1/2,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z',
          'y,-x\u002B1/2,z',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y,-z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z',
          '-y,x\u002B1/2,-z',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 131,
    name: 'P42/mmc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z\u002B1/2',
          '-y,x,-z\u002B1/2',
          'x,-y,z',
          '-x,y,z',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 132,
    name: 'P42/mcm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          '-x,y,-z\u002B1/2',
          'x,-y,-z\u002B1/2',
          'y,x,-z',
          '-y,-x,-z',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z\u002B1/2',
          '-y,x,-z\u002B1/2',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 133,
    name: 'P42/nbc',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-x,y,-z\u002B1/2',
          'x,-y,-z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,-z',
          '-y\u002B1/2,-x\u002B1/2,-z',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'y,-x,-z',
          '-y,x,-z',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z\u002B1/2',
          'y,-x\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y,-z',
          'x,-y\u002B1/2,-z',
          'y,x,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z\u002B1/2',
          '-y,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y,z',
          '-x,y\u002B1/2,z',
          '-y,-x,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 134,
    name: 'P42/nnm',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-x,y,-z',
          'x,-y,-z',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'y,-x,-z',
          '-y,x,-z',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-y,-x,z',
          'y,x,z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z\u002B1/2',
          'y,-x\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,-z\u002B1/2',
          'y,x,-z',
          '-y\u002B1/2,-x\u002B1/2,-z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z\u002B1/2',
          '-y,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,z\u002B1/2',
          '-y,-x,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 135,
    name: 'P42/mbc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z\u002B1/2',
          'y,-x,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z\u002B1/2',
          '-y,x,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y\u002B1/2,z',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 136,
    name: 'P42/mnm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'y,x,-z',
          '-y,-x,-z',
          '-x,-y,-z',
          'x,y,-z',
          'y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 137,
    name: 'P42/nmc',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'y,x,-z',
          '-y,-x,-z',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z',
          '-x,y,z',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z\u002B1/2',
          'y,-x\u002B1/2,z\u002B1/2',
          '-x,y\u002B1/2,-z',
          'x\u002B1/2,-y,-z',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z\u002B1/2',
          '-y,x\u002B1/2,-z\u002B1/2',
          'x,-y\u002B1/2,z',
          '-x\u002B1/2,y,z',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 138,
    name: 'P42/ncm',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y\u002B1/2,-z',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,z'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-y\u002B1/2,x,z\u002B1/2',
          'y,-x\u002B1/2,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y,-z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,-z',
          '-y,-x,-z',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'y\u002B1/2,-x,-z\u002B1/2',
          '-y,x\u002B1/2,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 139,
    name: 'I4/mmm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z',
          'x,-y,-z',
          'y,x,-z',
          '-y,-x,-z',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z',
          '-x,y,z',
          '-y,-x,z',
          'y,x,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 140,
    name: 'I4/mcm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-y,x,z',
          'y,-x,z',
          '-x,y,-z\u002B1/2',
          'x,-y,-z\u002B1/2',
          'y,x,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'y,-x,-z',
          '-y,x,-z',
          'x,-y,z\u002B1/2',
          '-x,y,z\u002B1/2',
          '-y,-x,z\u002B1/2',
          'y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 141,
    name: 'I41/amd',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x,z\u002B3/4',
          '-x\u002B1/2,y,-z\u002B3/4',
          'x,-y\u002B1/2,-z\u002B1/4',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y,-x,-z',
          '-x,-y\u002B1/2,-z\u002B1/4',
          'x\u002B1/2,y,-z\u002B3/4',
          'y,-x,-z',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x,y,z',
          '-y\u002B1/2,-x,z\u002B3/4',
          'y,x\u002B1/2,z\u002B1/4'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-y\u002B1/4,x\u002B3/4,z\u002B1/4',
          'y\u002B1/4,-x\u002B1/4,z\u002B3/4',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y,-z',
          'y\u002B1/4,x\u002B3/4,-z\u002B1/4',
          '-y\u002B1/4,-x\u002B1/4,-z\u002B3/4',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'y\u002B3/4,-x\u002B1/4,-z\u002B3/4',
          '-y\u002B3/4,x\u002B3/4,-z\u002B1/4',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y,z',
          '-y\u002B3/4,-x\u002B1/4,z\u002B3/4',
          'y\u002B3/4,x\u002B3/4,z\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 142,
    name: 'I41/acd',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/4',
          'y\u002B1/2,-x,z\u002B3/4',
          '-x\u002B1/2,y,-z\u002B1/4',
          'x,-y\u002B1/2,-z\u002B3/4',
          'y\u002B1/2,x\u002B1/2,-z',
          '-y,-x,-z\u002B1/2',
          '-x,-y\u002B1/2,-z\u002B1/4',
          'x\u002B1/2,y,-z\u002B3/4',
          'y,-x,-z',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z',
          '-x,y,z\u002B1/2',
          '-y\u002B1/2,-x,z\u002B1/4',
          'y,x\u002B1/2,z\u002B3/4'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-y\u002B1/4,x\u002B3/4,z\u002B1/4',
          'y\u002B1/4,-x\u002B1/4,z\u002B3/4',
          '-x\u002B1/2,y,-z',
          'x,-y,-z\u002B1/2',
          'y\u002B1/4,x\u002B3/4,-z\u002B3/4',
          '-y\u002B1/4,-x\u002B1/4,-z\u002B1/4',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'y\u002B3/4,-x\u002B1/4,-z\u002B3/4',
          '-y\u002B3/4,x\u002B3/4,-z\u002B1/4',
          'x\u002B1/2,-y,z',
          '-x,y,z\u002B1/2',
          '-y\u002B3/4,-x\u002B1/4,z\u002B1/4',
          'y\u002B3/4,x\u002B3/4,z\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Tetragonal
  },
  {
    id: 143,
    name: 'P3',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-y,x-y,z', '-x\u002By,-x,z']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 144,
    name: 'P31',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-y,x-y,z\u002B1/3', '-x\u002By,-x,z\u002B2/3']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 145,
    name: 'P32',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-y,x-y,z\u002B2/3', '-x\u002By,-x,z\u002B1/3']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 146,
    name: 'R3',
    settings: [
      {
        name: 'HEXAGONAL AXES',
        operations: ['x,y,z', '-y,x-y,z', '-x\u002By,-x,z']
      },
      {
        name: 'RHOMBOHEDRAL AXES',
        operations: ['x,y,z', 'z,x,y', 'y,z,x']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 147,
    name: 'P-3',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 148,
    name: 'R-3',
    settings: [
      {
        name: 'HEXAGONAL AXES',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z'
        ]
      },
      {
        name: 'RHOMBOHEDRAL AXES',
        operations: ['x,y,z', 'z,x,y', 'y,z,x', '-x,-y,-z', '-z,-x,-y', '-y,-z,-x']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 149,
    name: 'P312',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-y,-x,-z',
          '-x\u002By,y,-z',
          'x,x-y,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 150,
    name: 'P321',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 151,
    name: 'P3112',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B1/3',
          '-x\u002By,-x,z\u002B2/3',
          '-y,-x,-z\u002B2/3',
          '-x\u002By,y,-z\u002B1/3',
          'x,x-y,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 152,
    name: 'P3121',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B1/3',
          '-x\u002By,-x,z\u002B2/3',
          'y,x,-z',
          'x-y,-y,-z\u002B2/3',
          '-x,-x\u002By,-z\u002B1/3'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 153,
    name: 'P3212',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B2/3',
          '-x\u002By,-x,z\u002B1/3',
          '-y,-x,-z\u002B1/3',
          '-x\u002By,y,-z\u002B2/3',
          'x,x-y,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 154,
    name: 'P3221',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B2/3',
          '-x\u002By,-x,z\u002B1/3',
          'y,x,-z',
          'x-y,-y,-z\u002B1/3',
          '-x,-x\u002By,-z\u002B2/3'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 155,
    name: 'R32',
    settings: [
      {
        name: 'HEXAGONAL AXES',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z'
        ]
      },
      {
        name: 'RHOMBOHEDRAL AXES',
        operations: ['x,y,z', 'z,x,y', 'y,z,x', '-z,-y,-x', '-y,-x,-z', '-x,-z,-y']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 156,
    name: 'P3m1',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-y,x-y,z', '-x\u002By,-x,z', '-y,-x,z', '-x\u002By,y,z', 'x,x-y,z']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 157,
    name: 'P31m',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-y,x-y,z', '-x\u002By,-x,z', 'y,x,z', 'x-y,-y,z', '-x,-x\u002By,z']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 158,
    name: 'P3c1',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 159,
    name: 'P31c',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'y,x,z\u002B1/2',
          'x-y,-y,z\u002B1/2',
          '-x,-x\u002By,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 160,
    name: 'R3m',
    settings: [
      {
        name: 'HEXAGONAL AXES',
        operations: ['x,y,z', '-y,x-y,z', '-x\u002By,-x,z', '-y,-x,z', '-x\u002By,y,z', 'x,x-y,z']
      },
      {
        name: 'RHOMBOHEDRAL AXES',
        operations: ['x,y,z', 'z,x,y', 'y,z,x', 'z,y,x', 'y,x,z', 'x,z,y']
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 161,
    name: 'R3c',
    settings: [
      {
        name: 'HEXAGONAL AXES',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2'
        ]
      },
      {
        name: 'RHOMBOHEDRAL AXES',
        operations: [
          'x,y,z',
          'z,x,y',
          'y,z,x',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 162,
    name: 'P-31m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-y,-x,-z',
          '-x\u002By,y,-z',
          'x,x-y,-z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'y,x,z',
          'x-y,-y,z',
          '-x,-x\u002By,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 163,
    name: 'P-31c',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-y,-x,-z\u002B1/2',
          '-x\u002By,y,-z\u002B1/2',
          'x,x-y,-z\u002B1/2',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'y,x,z\u002B1/2',
          'x-y,-y,z\u002B1/2',
          '-x,-x\u002By,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 164,
    name: 'P-3m1',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          '-y,-x,z',
          '-x\u002By,y,z',
          'x,x-y,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 165,
    name: 'P-3c1',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'y,x,-z\u002B1/2',
          'x-y,-y,-z\u002B1/2',
          '-x,-x\u002By,-z\u002B1/2',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 166,
    name: 'R-3m',
    settings: [
      {
        name: 'HEXAGONAL AXES',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          '-y,-x,z',
          '-x\u002By,y,z',
          'x,x-y,z'
        ]
      },
      {
        name: 'RHOMBOHEDRAL AXES',
        operations: [
          'x,y,z',
          'z,x,y',
          'y,z,x',
          '-z,-y,-x',
          '-y,-x,-z',
          '-x,-z,-y',
          '-x,-y,-z',
          '-z,-x,-y',
          '-y,-z,-x',
          'z,y,x',
          'y,x,z',
          'x,z,y'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 167,
    name: 'R-3c',
    settings: [
      {
        name: 'HEXAGONAL AXES',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'y,x,-z\u002B1/2',
          'x-y,-y,-z\u002B1/2',
          '-x,-x\u002By,-z\u002B1/2',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2'
        ]
      },
      {
        name: 'RHOMBOHEDRAL AXES',
        operations: [
          'x,y,z',
          'z,x,y',
          'y,z,x',
          '-z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          '-x,-y,-z',
          '-z,-x,-y',
          '-y,-z,-x',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Trigonal
  },
  {
    id: 168,
    name: 'P6',
    settings: [
      {
        name: 'Default',
        operations: ['x,y,z', '-y,x-y,z', '-x\u002By,-x,z', '-x,-y,z', 'y,-x\u002By,z', 'x-y,x,z']
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 169,
    name: 'P61',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B1/3',
          '-x\u002By,-x,z\u002B2/3',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B5/6',
          'x-y,x,z\u002B1/6'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 170,
    name: 'P65',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B2/3',
          '-x\u002By,-x,z\u002B1/3',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/6',
          'x-y,x,z\u002B5/6'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 171,
    name: 'P62',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B2/3',
          '-x\u002By,-x,z\u002B1/3',
          '-x,-y,z',
          'y,-x\u002By,z\u002B2/3',
          'x-y,x,z\u002B1/3'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 172,
    name: 'P64',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B1/3',
          '-x\u002By,-x,z\u002B2/3',
          '-x,-y,z',
          'y,-x\u002By,z\u002B1/3',
          'x-y,x,z\u002B2/3'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 173,
    name: 'P63',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/2',
          'x-y,x,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 174,
    name: 'P-6',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'x,y,-z',
          '-y,x-y,-z',
          '-x\u002By,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 175,
    name: 'P6/m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z',
          'y,-x\u002By,z',
          'x-y,x,z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'x,y,-z',
          '-y,x-y,-z',
          '-x\u002By,-x,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 176,
    name: 'P63/m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/2',
          'x-y,x,z\u002B1/2',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'x,y,-z\u002B1/2',
          '-y,x-y,-z\u002B1/2',
          '-x\u002By,-x,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 177,
    name: 'P622',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z',
          'y,-x\u002By,z',
          'x-y,x,z',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          '-y,-x,-z',
          '-x\u002By,y,-z',
          'x,x-y,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 178,
    name: 'P6122',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B1/3',
          '-x\u002By,-x,z\u002B2/3',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B5/6',
          'x-y,x,z\u002B1/6',
          'y,x,-z\u002B1/3',
          'x-y,-y,-z',
          '-x,-x\u002By,-z\u002B2/3',
          '-y,-x,-z\u002B5/6',
          '-x\u002By,y,-z\u002B1/2',
          'x,x-y,-z\u002B1/6'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 179,
    name: 'P6522',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B2/3',
          '-x\u002By,-x,z\u002B1/3',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/6',
          'x-y,x,z\u002B5/6',
          'y,x,-z\u002B2/3',
          'x-y,-y,-z',
          '-x,-x\u002By,-z\u002B1/3',
          '-y,-x,-z\u002B1/6',
          '-x\u002By,y,-z\u002B1/2',
          'x,x-y,-z\u002B5/6'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 180,
    name: 'P6222',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B2/3',
          '-x\u002By,-x,z\u002B1/3',
          '-x,-y,z',
          'y,-x\u002By,z\u002B2/3',
          'x-y,x,z\u002B1/3',
          'y,x,-z\u002B2/3',
          'x-y,-y,-z',
          '-x,-x\u002By,-z\u002B1/3',
          '-y,-x,-z\u002B2/3',
          '-x\u002By,y,-z',
          'x,x-y,-z\u002B1/3'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 181,
    name: 'P6422',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z\u002B1/3',
          '-x\u002By,-x,z\u002B2/3',
          '-x,-y,z',
          'y,-x\u002By,z\u002B1/3',
          'x-y,x,z\u002B2/3',
          'y,x,-z\u002B1/3',
          'x-y,-y,-z',
          '-x,-x\u002By,-z\u002B2/3',
          '-y,-x,-z\u002B1/3',
          '-x\u002By,y,-z',
          'x,x-y,-z\u002B2/3'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 182,
    name: 'P6322',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/2',
          'x-y,x,z\u002B1/2',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          '-y,-x,-z\u002B1/2',
          '-x\u002By,y,-z\u002B1/2',
          'x,x-y,-z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 183,
    name: 'P6mm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z',
          'y,-x\u002By,z',
          'x-y,x,z',
          '-y,-x,z',
          '-x\u002By,y,z',
          'x,x-y,z',
          'y,x,z',
          'x-y,-y,z',
          '-x,-x\u002By,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 184,
    name: 'P6cc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z',
          'y,-x\u002By,z',
          'x-y,x,z',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2',
          'y,x,z\u002B1/2',
          'x-y,-y,z\u002B1/2',
          '-x,-x\u002By,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 185,
    name: 'P63cm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/2',
          'x-y,x,z\u002B1/2',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2',
          'y,x,z',
          'x-y,-y,z',
          '-x,-x\u002By,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 186,
    name: 'P63mc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/2',
          'x-y,x,z\u002B1/2',
          '-y,-x,z',
          '-x\u002By,y,z',
          'x,x-y,z',
          'y,x,z\u002B1/2',
          'x-y,-y,z\u002B1/2',
          '-x,-x\u002By,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 187,
    name: 'P-6m2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'x,y,-z',
          '-y,x-y,-z',
          '-x\u002By,-x,-z',
          '-y,-x,z',
          '-x\u002By,y,z',
          'x,x-y,z',
          '-y,-x,-z',
          '-x\u002By,y,-z',
          'x,x-y,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 188,
    name: 'P-6c2',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'x,y,-z\u002B1/2',
          '-y,x-y,-z\u002B1/2',
          '-x\u002By,-x,-z\u002B1/2',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2',
          '-y,-x,-z',
          '-x\u002By,y,-z',
          'x,x-y,-z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 189,
    name: 'P-62m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'x,y,-z',
          '-y,x-y,-z',
          '-x\u002By,-x,-z',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          'y,x,z',
          'x-y,-y,z',
          '-x,-x\u002By,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 190,
    name: 'P-62c',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          'x,y,-z\u002B1/2',
          '-y,x-y,-z\u002B1/2',
          '-x\u002By,-x,-z\u002B1/2',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          'y,x,z\u002B1/2',
          'x-y,-y,z\u002B1/2',
          '-x,-x\u002By,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 191,
    name: 'P6/mmm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z',
          'y,-x\u002By,z',
          'x-y,x,z',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          '-y,-x,-z',
          '-x\u002By,y,-z',
          'x,x-y,-z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'x,y,-z',
          '-y,x-y,-z',
          '-x\u002By,-x,-z',
          '-y,-x,z',
          '-x\u002By,y,z',
          'x,x-y,z',
          'y,x,z',
          'x-y,-y,z',
          '-x,-x\u002By,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 192,
    name: 'P6/mcc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z',
          'y,-x\u002By,z',
          'x-y,x,z',
          'y,x,-z\u002B1/2',
          'x-y,-y,-z\u002B1/2',
          '-x,-x\u002By,-z\u002B1/2',
          '-y,-x,-z\u002B1/2',
          '-x\u002By,y,-z\u002B1/2',
          'x,x-y,-z\u002B1/2',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'x,y,-z',
          '-y,x-y,-z',
          '-x\u002By,-x,-z',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2',
          'y,x,z\u002B1/2',
          'x-y,-y,z\u002B1/2',
          '-x,-x\u002By,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 193,
    name: 'P63/mcm',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/2',
          'x-y,x,z\u002B1/2',
          'y,x,-z\u002B1/2',
          'x-y,-y,-z\u002B1/2',
          '-x,-x\u002By,-z\u002B1/2',
          '-y,-x,-z',
          '-x\u002By,y,-z',
          'x,x-y,-z',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'x,y,-z\u002B1/2',
          '-y,x-y,-z\u002B1/2',
          '-x\u002By,-x,-z\u002B1/2',
          '-y,-x,z\u002B1/2',
          '-x\u002By,y,z\u002B1/2',
          'x,x-y,z\u002B1/2',
          'y,x,z',
          'x-y,-y,z',
          '-x,-x\u002By,z'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 194,
    name: 'P63/mmc',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-y,x-y,z',
          '-x\u002By,-x,z',
          '-x,-y,z\u002B1/2',
          'y,-x\u002By,z\u002B1/2',
          'x-y,x,z\u002B1/2',
          'y,x,-z',
          'x-y,-y,-z',
          '-x,-x\u002By,-z',
          '-y,-x,-z\u002B1/2',
          '-x\u002By,y,-z\u002B1/2',
          'x,x-y,-z\u002B1/2',
          '-x,-y,-z',
          'y,-x\u002By,-z',
          'x-y,x,-z',
          'x,y,-z\u002B1/2',
          '-y,x-y,-z\u002B1/2',
          '-x\u002By,-x,-z\u002B1/2',
          '-y,-x,z',
          '-x\u002By,y,z',
          'x,x-y,z',
          'y,x,z\u002B1/2',
          'x-y,-y,z\u002B1/2',
          '-x,-x\u002By,z\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Hexagonal
  },
  {
    id: 195,
    name: 'P23',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 196,
    name: 'F23',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 197,
    name: 'I23',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 198,
    name: 'P213',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 199,
    name: 'I213',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 200,
    name: 'Pm-3',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 201,
    name: 'Pn-3',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-z\u002B1/2,-x\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,x\u002B1/2,y\u002B1/2',
          'z\u002B1/2,x\u002B1/2,-y\u002B1/2',
          'z\u002B1/2,-x\u002B1/2,y\u002B1/2',
          '-y\u002B1/2,-z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,x\u002B1/2',
          '-y\u002B1/2,z\u002B1/2,x\u002B1/2',
          'y\u002B1/2,z\u002B1/2,-x\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,-z\u002B1/2',
          'z,x,y',
          'z,-x\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,-x\u002B1/2,y',
          '-z\u002B1/2,x,-y\u002B1/2',
          'y,z,x',
          '-y\u002B1/2,z,-x\u002B1/2',
          'y,-z\u002B1/2,-x\u002B1/2',
          '-y\u002B1/2,-z\u002B1/2,x',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,z\u002B1/2',
          '-z,-x,-y',
          '-z,x\u002B1/2,y\u002B1/2',
          'z\u002B1/2,x\u002B1/2,-y',
          'z\u002B1/2,-x,y\u002B1/2',
          '-y,-z,-x',
          'y\u002B1/2,-z,x\u002B1/2',
          '-y,z\u002B1/2,x\u002B1/2',
          'y\u002B1/2,z\u002B1/2,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 202,
    name: 'Fm-3',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 203,
    name: 'Fd-3',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          '-x\u002B1/4,-y\u002B1/4,-z\u002B1/4',
          'x\u002B1/4,y\u002B1/4,-z\u002B1/4',
          'x\u002B1/4,-y\u002B1/4,z\u002B1/4',
          '-x\u002B1/4,y\u002B1/4,z\u002B1/4',
          '-z\u002B1/4,-x\u002B1/4,-y\u002B1/4',
          '-z\u002B1/4,x\u002B1/4,y\u002B1/4',
          'z\u002B1/4,x\u002B1/4,-y\u002B1/4',
          'z\u002B1/4,-x\u002B1/4,y\u002B1/4',
          '-y\u002B1/4,-z\u002B1/4,-x\u002B1/4',
          'y\u002B1/4,-z\u002B1/4,x\u002B1/4',
          '-y\u002B1/4,z\u002B1/4,x\u002B1/4',
          'y\u002B1/4,z\u002B1/4,-x\u002B1/4'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B3/4,-y\u002B3/4,z',
          '-x\u002B3/4,y,-z\u002B3/4',
          'x,-y\u002B3/4,-z\u002B3/4',
          'z,x,y',
          'z,-x\u002B3/4,-y\u002B3/4',
          '-z\u002B3/4,-x\u002B3/4,y',
          '-z\u002B3/4,x,-y\u002B3/4',
          'y,z,x',
          '-y\u002B3/4,z,-x\u002B3/4',
          'y,-z\u002B3/4,-x\u002B3/4',
          '-y\u002B3/4,-z\u002B3/4,x',
          '-x,-y,-z',
          'x\u002B1/4,y\u002B1/4,-z',
          'x\u002B1/4,-y,z\u002B1/4',
          '-x,y\u002B1/4,z\u002B1/4',
          '-z,-x,-y',
          '-z,x\u002B1/4,y\u002B1/4',
          'z\u002B1/4,x\u002B1/4,-y',
          'z\u002B1/4,-x,y\u002B1/4',
          '-y,-z,-x',
          'y\u002B1/4,-z,x\u002B1/4',
          '-y,z\u002B1/4,x\u002B1/4',
          'y\u002B1/4,z\u002B1/4,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 204,
    name: 'Im-3',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 205,
    name: 'Pa-3',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z',
          '-z,-x,-y',
          '-z\u002B1/2,x\u002B1/2,y',
          'z\u002B1/2,x,-y\u002B1/2',
          'z,-x\u002B1/2,y\u002B1/2',
          '-y,-z,-x',
          'y,-z\u002B1/2,x\u002B1/2',
          '-y\u002B1/2,z\u002B1/2,x',
          'y\u002B1/2,z,-x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 206,
    name: 'Ia-3',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z',
          '-z,-x,-y',
          '-z\u002B1/2,x\u002B1/2,y',
          'z\u002B1/2,x,-y\u002B1/2',
          'z,-x\u002B1/2,y\u002B1/2',
          '-y,-z,-x',
          'y,-z\u002B1/2,x\u002B1/2',
          '-y\u002B1/2,z\u002B1/2,x',
          'y\u002B1/2,z,-x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 207,
    name: 'P432',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,-z',
          '-y,-x,-z',
          'y,-x,z',
          '-y,x,z',
          'x,z,-y',
          '-x,z,y',
          '-x,-z,-y',
          'x,-z,y',
          'z,y,-x',
          'z,-y,x',
          '-z,y,x',
          '-z,-y,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 208,
    name: 'P4232',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,-x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 209,
    name: 'F432',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,-z',
          '-y,-x,-z',
          'y,-x,z',
          '-y,x,z',
          'x,z,-y',
          '-x,z,y',
          '-x,-z,-y',
          'x,-z,y',
          'z,y,-x',
          'z,-y,x',
          '-z,y,x',
          '-z,-y,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 210,
    name: 'F4132',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,-z\u002B1/2',
          'z,x,y',
          'z\u002B1/2,-x,-y\u002B1/2',
          '-z,-x\u002B1/2,y\u002B1/2',
          '-z\u002B1/2,x\u002B1/2,-y',
          'y,z,x',
          '-y\u002B1/2,z\u002B1/2,-x',
          'y\u002B1/2,-z,-x\u002B1/2',
          '-y,-z\u002B1/2,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z\u002B3/4',
          '-y\u002B1/4,-x\u002B1/4,-z\u002B1/4',
          'y\u002B1/4,-x\u002B3/4,z\u002B3/4',
          '-y\u002B3/4,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y\u002B3/4',
          '-x\u002B3/4,z\u002B3/4,y\u002B1/4',
          '-x\u002B1/4,-z\u002B1/4,-y\u002B1/4',
          'x\u002B1/4,-z\u002B3/4,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x\u002B3/4',
          'z\u002B1/4,-y\u002B3/4,x\u002B3/4',
          '-z\u002B3/4,y\u002B3/4,x\u002B1/4',
          '-z\u002B1/4,-y\u002B1/4,-x\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 211,
    name: 'I432',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,-z',
          '-y,-x,-z',
          'y,-x,z',
          '-y,x,z',
          'x,z,-y',
          '-x,z,y',
          '-x,-z,-y',
          'x,-z,y',
          'z,y,-x',
          'z,-y,x',
          '-z,y,x',
          '-z,-y,-x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 212,
    name: 'P4332',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2',
          'y\u002B1/4,x\u002B3/4,-z\u002B3/4',
          '-y\u002B1/4,-x\u002B1/4,-z\u002B1/4',
          'y\u002B3/4,-x\u002B3/4,z\u002B1/4',
          '-y\u002B3/4,x\u002B1/4,z\u002B3/4',
          'x\u002B1/4,z\u002B3/4,-y\u002B3/4',
          '-x\u002B3/4,z\u002B1/4,y\u002B3/4',
          '-x\u002B1/4,-z\u002B1/4,-y\u002B1/4',
          'x\u002B3/4,-z\u002B3/4,y\u002B1/4',
          'z\u002B1/4,y\u002B3/4,-x\u002B3/4',
          'z\u002B3/4,-y\u002B3/4,x\u002B1/4',
          '-z\u002B3/4,y\u002B1/4,x\u002B3/4',
          '-z\u002B1/4,-y\u002B1/4,-x\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 213,
    name: 'P4132',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z\u002B1/4',
          '-y\u002B3/4,-x\u002B3/4,-z\u002B3/4',
          'y\u002B1/4,-x\u002B1/4,z\u002B3/4',
          '-y\u002B1/4,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y\u002B1/4',
          '-x\u002B1/4,z\u002B3/4,y\u002B1/4',
          '-x\u002B3/4,-z\u002B3/4,-y\u002B3/4',
          'x\u002B1/4,-z\u002B1/4,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x\u002B1/4',
          'z\u002B1/4,-y\u002B1/4,x\u002B3/4',
          '-z\u002B1/4,y\u002B3/4,x\u002B1/4',
          '-z\u002B3/4,-y\u002B3/4,-x\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 214,
    name: 'I4132',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z\u002B1/4',
          '-y\u002B3/4,-x\u002B3/4,-z\u002B3/4',
          'y\u002B1/4,-x\u002B1/4,z\u002B3/4',
          '-y\u002B1/4,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y\u002B1/4',
          '-x\u002B1/4,z\u002B3/4,y\u002B1/4',
          '-x\u002B3/4,-z\u002B3/4,-y\u002B3/4',
          'x\u002B1/4,-z\u002B1/4,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x\u002B1/4',
          'z\u002B1/4,-y\u002B1/4,x\u002B3/4',
          '-z\u002B1/4,y\u002B3/4,x\u002B1/4',
          '-z\u002B3/4,-y\u002B3/4,-x\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 215,
    name: 'P-43m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,z',
          '-y,-x,z',
          'y,-x,-z',
          '-y,x,-z',
          'x,z,y',
          '-x,z,-y',
          '-x,-z,y',
          'x,-z,-y',
          'z,y,x',
          'z,-y,-x',
          '-z,y,-x',
          '-z,-y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 216,
    name: 'F-43m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,z',
          '-y,-x,z',
          'y,-x,-z',
          '-y,x,-z',
          'x,z,y',
          '-x,z,-y',
          '-x,-z,y',
          'x,-z,-y',
          'z,y,x',
          'z,-y,-x',
          '-z,y,-x',
          '-z,-y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 217,
    name: 'I-43m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,z',
          '-y,-x,z',
          'y,-x,-z',
          '-y,x,-z',
          'x,z,y',
          '-x,z,-y',
          '-x,-z,y',
          'x,-z,-y',
          'z,y,x',
          'z,-y,-x',
          '-z,y,-x',
          '-z,-y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 218,
    name: 'P-43n',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 219,
    name: 'F-43c',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 220,
    name: 'I-43d',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2',
          'y\u002B1/4,x\u002B1/4,z\u002B1/4',
          '-y\u002B1/4,-x\u002B3/4,z\u002B3/4',
          'y\u002B3/4,-x\u002B1/4,-z\u002B3/4',
          '-y\u002B3/4,x\u002B3/4,-z\u002B1/4',
          'x\u002B1/4,z\u002B1/4,y\u002B1/4',
          '-x\u002B3/4,z\u002B3/4,-y\u002B1/4',
          '-x\u002B1/4,-z\u002B3/4,y\u002B3/4',
          'x\u002B3/4,-z\u002B1/4,-y\u002B3/4',
          'z\u002B1/4,y\u002B1/4,x\u002B1/4',
          'z\u002B3/4,-y\u002B1/4,-x\u002B3/4',
          '-z\u002B3/4,y\u002B3/4,-x\u002B1/4',
          '-z\u002B1/4,-y\u002B3/4,x\u002B3/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 221,
    name: 'Pm-3m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,-z',
          '-y,-x,-z',
          'y,-x,z',
          '-y,x,z',
          'x,z,-y',
          '-x,z,y',
          '-x,-z,-y',
          'x,-z,y',
          'z,y,-x',
          'z,-y,x',
          '-z,y,x',
          '-z,-y,-x',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x',
          '-y,-x,z',
          'y,x,z',
          '-y,x,-z',
          'y,-x,-z',
          '-x,-z,y',
          'x,-z,-y',
          'x,z,y',
          '-x,z,-y',
          '-z,-y,x',
          '-z,y,-x',
          'z,-y,-x',
          'z,y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 222,
    name: 'Pn-3n',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,-z',
          '-y,-x,-z',
          'y,-x,z',
          '-y,x,z',
          'x,z,-y',
          '-x,z,y',
          '-x,-z,-y',
          'x,-z,y',
          'z,y,-x',
          'z,-y,x',
          '-z,y,x',
          '-z,-y,-x',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-z\u002B1/2,-x\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,x\u002B1/2,y\u002B1/2',
          'z\u002B1/2,x\u002B1/2,-y\u002B1/2',
          'z\u002B1/2,-x\u002B1/2,y\u002B1/2',
          '-y\u002B1/2,-z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,x\u002B1/2',
          '-y\u002B1/2,z\u002B1/2,x\u002B1/2',
          'y\u002B1/2,z\u002B1/2,-x\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,-z\u002B1/2',
          'z,x,y',
          'z,-x\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,-x\u002B1/2,y',
          '-z\u002B1/2,x,-y\u002B1/2',
          'y,z,x',
          '-y\u002B1/2,z,-x\u002B1/2',
          'y,-z\u002B1/2,-x\u002B1/2',
          '-y\u002B1/2,-z\u002B1/2,x',
          'y,x,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          'y,-x\u002B1/2,z',
          '-y\u002B1/2,x,z',
          'x,z,-y\u002B1/2',
          '-x\u002B1/2,z,y',
          '-x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x,-z\u002B1/2,y',
          'z,y,-x\u002B1/2',
          'z,-y\u002B1/2,x',
          '-z\u002B1/2,y,x',
          '-z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,z\u002B1/2',
          '-z,-x,-y',
          '-z,x\u002B1/2,y\u002B1/2',
          'z\u002B1/2,x\u002B1/2,-y',
          'z\u002B1/2,-x,y\u002B1/2',
          '-y,-z,-x',
          'y\u002B1/2,-z,x\u002B1/2',
          '-y,z\u002B1/2,x\u002B1/2',
          'y\u002B1/2,z\u002B1/2,-x',
          '-y,-x,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y,x\u002B1/2,-z',
          'y\u002B1/2,-x,-z',
          '-x,-z,y\u002B1/2',
          'x\u002B1/2,-z,-y',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x,z\u002B1/2,-y',
          '-z,-y,x\u002B1/2',
          '-z,y\u002B1/2,-x',
          'z\u002B1/2,-y,-x',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 223,
    name: 'Pm-3n',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 224,
    name: 'Pn-3m',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-x\u002B1/2,-y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z\u002B1/2',
          '-z\u002B1/2,-x\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,x\u002B1/2,y\u002B1/2',
          'z\u002B1/2,x\u002B1/2,-y\u002B1/2',
          'z\u002B1/2,-x\u002B1/2,y\u002B1/2',
          '-y\u002B1/2,-z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,x\u002B1/2',
          '-y\u002B1/2,z\u002B1/2,x\u002B1/2',
          'y\u002B1/2,z\u002B1/2,-x\u002B1/2',
          '-y,-x,z',
          'y,x,z',
          '-y,x,-z',
          'y,-x,-z',
          '-x,-z,y',
          'x,-z,-y',
          'x,z,y',
          '-x,z,-y',
          '-z,-y,x',
          '-z,y,-x',
          'z,-y,-x',
          'z,y,x'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y\u002B1/2,z',
          '-x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,-z\u002B1/2',
          'z,x,y',
          'z,-x\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,-x\u002B1/2,y',
          '-z\u002B1/2,x,-y\u002B1/2',
          'y,z,x',
          '-y\u002B1/2,z,-x\u002B1/2',
          'y,-z\u002B1/2,-x\u002B1/2',
          '-y\u002B1/2,-z\u002B1/2,x',
          'y\u002B1/2,x\u002B1/2,-z',
          '-y,-x,-z',
          'y\u002B1/2,-x,z\u002B1/2',
          '-y,x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,-y',
          '-x,z\u002B1/2,y\u002B1/2',
          '-x,-z,-y',
          'x\u002B1/2,-z,y\u002B1/2',
          'z\u002B1/2,y\u002B1/2,-x',
          'z\u002B1/2,-y,x\u002B1/2',
          '-z,y\u002B1/2,x\u002B1/2',
          '-z,-y,-x',
          '-x,-y,-z',
          'x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,z\u002B1/2',
          '-z,-x,-y',
          '-z,x\u002B1/2,y\u002B1/2',
          'z\u002B1/2,x\u002B1/2,-y',
          'z\u002B1/2,-x,y\u002B1/2',
          '-y,-z,-x',
          'y\u002B1/2,-z,x\u002B1/2',
          '-y,z\u002B1/2,x\u002B1/2',
          'y\u002B1/2,z\u002B1/2,-x',
          '-y\u002B1/2,-x\u002B1/2,z',
          'y,x,z',
          '-y\u002B1/2,x,-z\u002B1/2',
          'y,-x\u002B1/2,-z\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,y',
          'x,-z\u002B1/2,-y\u002B1/2',
          'x,z,y',
          '-x\u002B1/2,z,-y\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,x',
          '-z\u002B1/2,y,-x\u002B1/2',
          'z,-y\u002B1/2,-x\u002B1/2',
          'z,y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 225,
    name: 'Fm-3m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,-z',
          '-y,-x,-z',
          'y,-x,z',
          '-y,x,z',
          'x,z,-y',
          '-x,z,y',
          '-x,-z,-y',
          'x,-z,y',
          'z,y,-x',
          'z,-y,x',
          '-z,y,x',
          '-z,-y,-x',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x',
          '-y,-x,z',
          'y,x,z',
          '-y,x,-z',
          'y,-x,-z',
          '-x,-z,y',
          'x,-z,-y',
          'x,z,y',
          '-x,z,-y',
          '-z,-y,x',
          '-z,y,-x',
          'z,-y,-x',
          'z,y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 226,
    name: 'Fm-3c',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,z\u002B1/2',
          'x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x',
          '-y\u002B1/2,-x\u002B1/2,z\u002B1/2',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          '-x\u002B1/2,-z\u002B1/2,y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,z\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,-y\u002B1/2,x\u002B1/2',
          '-z\u002B1/2,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 227,
    name: 'Fd-3m',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,-z\u002B1/2',
          'z,x,y',
          'z\u002B1/2,-x,-y\u002B1/2',
          '-z,-x\u002B1/2,y\u002B1/2',
          '-z\u002B1/2,x\u002B1/2,-y',
          'y,z,x',
          '-y\u002B1/2,z\u002B1/2,-x',
          'y\u002B1/2,-z,-x\u002B1/2',
          '-y,-z\u002B1/2,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z\u002B3/4',
          '-y\u002B1/4,-x\u002B1/4,-z\u002B1/4',
          'y\u002B1/4,-x\u002B3/4,z\u002B3/4',
          '-y\u002B3/4,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y\u002B3/4',
          '-x\u002B3/4,z\u002B3/4,y\u002B1/4',
          '-x\u002B1/4,-z\u002B1/4,-y\u002B1/4',
          'x\u002B1/4,-z\u002B3/4,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x\u002B3/4',
          'z\u002B1/4,-y\u002B3/4,x\u002B3/4',
          '-z\u002B3/4,y\u002B3/4,x\u002B1/4',
          '-z\u002B1/4,-y\u002B1/4,-x\u002B1/4',
          '-x\u002B1/4,-y\u002B1/4,-z\u002B1/4',
          'x\u002B1/4,y\u002B3/4,-z\u002B3/4',
          'x\u002B3/4,-y\u002B3/4,z\u002B1/4',
          '-x\u002B3/4,y\u002B1/4,z\u002B3/4',
          '-z\u002B1/4,-x\u002B1/4,-y\u002B1/4',
          '-z\u002B3/4,x\u002B1/4,y\u002B3/4',
          'z\u002B1/4,x\u002B3/4,-y\u002B3/4',
          'z\u002B3/4,-x\u002B3/4,y\u002B1/4',
          '-y\u002B1/4,-z\u002B1/4,-x\u002B1/4',
          'y\u002B3/4,-z\u002B3/4,x\u002B1/4',
          '-y\u002B3/4,z\u002B1/4,x\u002B3/4',
          'y\u002B1/4,z\u002B3/4,-x\u002B3/4',
          '-y\u002B1/2,-x,z\u002B1/2',
          'y,x,z',
          '-y,x\u002B1/2,-z\u002B1/2',
          'y\u002B1/2,-x\u002B1/2,-z',
          '-x\u002B1/2,-z,y\u002B1/2',
          'x\u002B1/2,-z\u002B1/2,-y',
          'x,z,y',
          '-x,z\u002B1/2,-y\u002B1/2',
          '-z\u002B1/2,-y,x\u002B1/2',
          '-z,y\u002B1/2,-x\u002B1/2',
          'z\u002B1/2,-y\u002B1/2,-x',
          'z,y,x'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B3/4,-y\u002B1/4,z\u002B1/2',
          '-x\u002B1/4,y\u002B1/2,-z\u002B3/4',
          'x\u002B1/2,-y\u002B3/4,-z\u002B1/4',
          'z,x,y',
          'z\u002B1/2,-x\u002B3/4,-y\u002B1/4',
          '-z\u002B3/4,-x\u002B1/4,y\u002B1/2',
          '-z\u002B1/4,x\u002B1/2,-y\u002B3/4',
          'y,z,x',
          '-y\u002B1/4,z\u002B1/2,-x\u002B3/4',
          'y\u002B1/2,-z\u002B3/4,-x\u002B1/4',
          '-y\u002B3/4,-z\u002B1/4,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z\u002B1/2',
          '-y,-x,-z',
          'y\u002B1/4,-x\u002B1/2,z\u002B3/4',
          '-y\u002B1/2,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y\u002B1/2',
          '-x\u002B1/2,z\u002B3/4,y\u002B1/4',
          '-x,-z,-y',
          'x\u002B1/4,-z\u002B1/2,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x\u002B1/2',
          'z\u002B1/4,-y\u002B1/2,x\u002B3/4',
          '-z\u002B1/2,y\u002B3/4,x\u002B1/4',
          '-z,-y,-x',
          '-x,-y,-z',
          'x\u002B1/4,y\u002B3/4,-z\u002B1/2',
          'x\u002B3/4,-y\u002B1/2,z\u002B1/4',
          '-x\u002B1/2,y\u002B1/4,z\u002B3/4',
          '-z,-x,-y',
          '-z\u002B1/2,x\u002B1/4,y\u002B3/4',
          'z\u002B1/4,x\u002B3/4,-y\u002B1/2',
          'z\u002B3/4,-x\u002B1/2,y\u002B1/4',
          '-y,-z,-x',
          'y\u002B3/4,-z\u002B1/2,x\u002B1/4',
          '-y\u002B1/2,z\u002B1/4,x\u002B3/4',
          'y\u002B1/4,z\u002B3/4,-x\u002B1/2',
          '-y\u002B1/4,-x\u002B3/4,z\u002B1/2',
          'y,x,z',
          '-y\u002B3/4,x\u002B1/2,-z\u002B1/4',
          'y\u002B1/2,-x\u002B1/4,-z\u002B3/4',
          '-x\u002B1/4,-z\u002B3/4,y\u002B1/2',
          'x\u002B1/2,-z\u002B1/4,-y\u002B3/4',
          'x,z,y',
          '-x\u002B3/4,z\u002B1/2,-y\u002B1/4',
          '-z\u002B1/4,-y\u002B3/4,x\u002B1/2',
          '-z\u002B3/4,y\u002B1/2,-x\u002B1/4',
          'z\u002B1/2,-y\u002B1/4,-x\u002B3/4',
          'z,y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 228,
    name: 'Fd-3c',
    settings: [
      {
        name: 'ORIGIN CHOICE 1',
        operations: [
          'x,y,z',
          '-x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,-z',
          'x\u002B1/2,-y,-z\u002B1/2',
          'z,x,y',
          'z\u002B1/2,-x,-y\u002B1/2',
          '-z,-x\u002B1/2,y\u002B1/2',
          '-z\u002B1/2,x\u002B1/2,-y',
          'y,z,x',
          '-y\u002B1/2,z\u002B1/2,-x',
          'y\u002B1/2,-z,-x\u002B1/2',
          '-y,-z\u002B1/2,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z\u002B3/4',
          '-y\u002B1/4,-x\u002B1/4,-z\u002B1/4',
          'y\u002B1/4,-x\u002B3/4,z\u002B3/4',
          '-y\u002B3/4,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y\u002B3/4',
          '-x\u002B3/4,z\u002B3/4,y\u002B1/4',
          '-x\u002B1/4,-z\u002B1/4,-y\u002B1/4',
          'x\u002B1/4,-z\u002B3/4,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x\u002B3/4',
          'z\u002B1/4,-y\u002B3/4,x\u002B3/4',
          '-z\u002B3/4,y\u002B3/4,x\u002B1/4',
          '-z\u002B1/4,-y\u002B1/4,-x\u002B1/4',
          '-x\u002B3/4,-y\u002B3/4,-z\u002B3/4',
          'x\u002B3/4,y\u002B1/4,-z\u002B1/4',
          'x\u002B1/4,-y\u002B1/4,z\u002B3/4',
          '-x\u002B1/4,y\u002B3/4,z\u002B1/4',
          '-z\u002B3/4,-x\u002B3/4,-y\u002B3/4',
          '-z\u002B1/4,x\u002B3/4,y\u002B1/4',
          'z\u002B3/4,x\u002B1/4,-y\u002B1/4',
          'z\u002B1/4,-x\u002B1/4,y\u002B3/4',
          '-y\u002B3/4,-z\u002B3/4,-x\u002B3/4',
          'y\u002B1/4,-z\u002B1/4,x\u002B3/4',
          '-y\u002B1/4,z\u002B3/4,x\u002B1/4',
          'y\u002B3/4,z\u002B1/4,-x\u002B1/4',
          '-y,-x\u002B1/2,z',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y\u002B1/2,x,-z',
          'y,-x,-z\u002B1/2',
          '-x,-z\u002B1/2,y',
          'x,-z,-y\u002B1/2',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B1/2,z,-y',
          '-z,-y\u002B1/2,x',
          '-z\u002B1/2,y,-x',
          'z,-y,-x\u002B1/2',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2'
        ]
      },
      {
        name: 'ORIGIN CHOICE 2',
        operations: [
          'x,y,z',
          '-x\u002B1/4,-y\u002B3/4,z\u002B1/2',
          '-x\u002B3/4,y\u002B1/2,-z\u002B1/4',
          'x\u002B1/2,-y\u002B1/4,-z\u002B3/4',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/4,-y\u002B3/4',
          '-z\u002B1/4,-x\u002B3/4,y\u002B1/2',
          '-z\u002B3/4,x\u002B1/2,-y\u002B1/4',
          'y,z,x',
          '-y\u002B3/4,z\u002B1/2,-x\u002B1/4',
          'y\u002B1/2,-z\u002B1/4,-x\u002B3/4',
          '-y\u002B1/4,-z\u002B3/4,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z',
          '-y\u002B1/2,-x\u002B1/2,-z\u002B1/2',
          'y\u002B1/4,-x,z\u002B3/4',
          '-y,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y',
          '-x,z\u002B3/4,y\u002B1/4',
          '-x\u002B1/2,-z\u002B1/2,-y\u002B1/2',
          'x\u002B1/4,-z,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x',
          'z\u002B1/4,-y,x\u002B3/4',
          '-z,y\u002B3/4,x\u002B1/4',
          '-z\u002B1/2,-y\u002B1/2,-x\u002B1/2',
          '-x,-y,-z',
          'x\u002B3/4,y\u002B1/4,-z\u002B1/2',
          'x\u002B1/4,-y\u002B1/2,z\u002B3/4',
          '-x\u002B1/2,y\u002B3/4,z\u002B1/4',
          '-z,-x,-y',
          '-z\u002B1/2,x\u002B3/4,y\u002B1/4',
          'z\u002B3/4,x\u002B1/4,-y\u002B1/2',
          'z\u002B1/4,-x\u002B1/2,y\u002B3/4',
          '-y,-z,-x',
          'y\u002B1/4,-z\u002B1/2,x\u002B3/4',
          '-y\u002B1/2,z\u002B3/4,x\u002B1/4',
          'y\u002B3/4,z\u002B1/4,-x\u002B1/2',
          '-y\u002B1/4,-x\u002B3/4,z',
          'y\u002B1/2,x\u002B1/2,z\u002B1/2',
          '-y\u002B3/4,x,-z\u002B1/4',
          'y,-x\u002B1/4,-z\u002B3/4',
          '-x\u002B1/4,-z\u002B3/4,y',
          'x,-z\u002B1/4,-y\u002B3/4',
          'x\u002B1/2,z\u002B1/2,y\u002B1/2',
          '-x\u002B3/4,z,-y\u002B1/4',
          '-z\u002B1/4,-y\u002B3/4,x',
          '-z\u002B3/4,y,-x\u002B1/4',
          'z,-y\u002B1/4,-x\u002B3/4',
          'z\u002B1/2,y\u002B1/2,x\u002B1/2'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 229,
    name: 'Im-3m',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x,-y,z',
          '-x,y,-z',
          'x,-y,-z',
          'z,x,y',
          'z,-x,-y',
          '-z,-x,y',
          '-z,x,-y',
          'y,z,x',
          '-y,z,-x',
          'y,-z,-x',
          '-y,-z,x',
          'y,x,-z',
          '-y,-x,-z',
          'y,-x,z',
          '-y,x,z',
          'x,z,-y',
          '-x,z,y',
          '-x,-z,-y',
          'x,-z,y',
          'z,y,-x',
          'z,-y,x',
          '-z,y,x',
          '-z,-y,-x',
          '-x,-y,-z',
          'x,y,-z',
          'x,-y,z',
          '-x,y,z',
          '-z,-x,-y',
          '-z,x,y',
          'z,x,-y',
          'z,-x,y',
          '-y,-z,-x',
          'y,-z,x',
          '-y,z,x',
          'y,z,-x',
          '-y,-x,z',
          'y,x,z',
          '-y,x,-z',
          'y,-x,-z',
          '-x,-z,y',
          'x,-z,-y',
          'x,z,y',
          '-x,z,-y',
          '-z,-y,x',
          '-z,y,-x',
          'z,-y,-x',
          'z,y,x'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  },
  {
    id: 230,
    name: 'Ia-3d',
    settings: [
      {
        name: 'Default',
        operations: [
          'x,y,z',
          '-x\u002B1/2,-y,z\u002B1/2',
          '-x,y\u002B1/2,-z\u002B1/2',
          'x\u002B1/2,-y\u002B1/2,-z',
          'z,x,y',
          'z\u002B1/2,-x\u002B1/2,-y',
          '-z\u002B1/2,-x,y\u002B1/2',
          '-z,x\u002B1/2,-y\u002B1/2',
          'y,z,x',
          '-y,z\u002B1/2,-x\u002B1/2',
          'y\u002B1/2,-z\u002B1/2,-x',
          '-y\u002B1/2,-z,x\u002B1/2',
          'y\u002B3/4,x\u002B1/4,-z\u002B1/4',
          '-y\u002B3/4,-x\u002B3/4,-z\u002B3/4',
          'y\u002B1/4,-x\u002B1/4,z\u002B3/4',
          '-y\u002B1/4,x\u002B3/4,z\u002B1/4',
          'x\u002B3/4,z\u002B1/4,-y\u002B1/4',
          '-x\u002B1/4,z\u002B3/4,y\u002B1/4',
          '-x\u002B3/4,-z\u002B3/4,-y\u002B3/4',
          'x\u002B1/4,-z\u002B1/4,y\u002B3/4',
          'z\u002B3/4,y\u002B1/4,-x\u002B1/4',
          'z\u002B1/4,-y\u002B1/4,x\u002B3/4',
          '-z\u002B1/4,y\u002B3/4,x\u002B1/4',
          '-z\u002B3/4,-y\u002B3/4,-x\u002B3/4',
          '-x,-y,-z',
          'x\u002B1/2,y,-z\u002B1/2',
          'x,-y\u002B1/2,z\u002B1/2',
          '-x\u002B1/2,y\u002B1/2,z',
          '-z,-x,-y',
          '-z\u002B1/2,x\u002B1/2,y',
          'z\u002B1/2,x,-y\u002B1/2',
          'z,-x\u002B1/2,y\u002B1/2',
          '-y,-z,-x',
          'y,-z\u002B1/2,x\u002B1/2',
          '-y\u002B1/2,z\u002B1/2,x',
          'y\u002B1/2,z,-x\u002B1/2',
          '-y\u002B1/4,-x\u002B3/4,z\u002B3/4',
          'y\u002B1/4,x\u002B1/4,z\u002B1/4',
          '-y\u002B3/4,x\u002B3/4,-z\u002B1/4',
          'y\u002B3/4,-x\u002B1/4,-z\u002B3/4',
          '-x\u002B1/4,-z\u002B3/4,y\u002B3/4',
          'x\u002B3/4,-z\u002B1/4,-y\u002B3/4',
          'x\u002B1/4,z\u002B1/4,y\u002B1/4',
          '-x\u002B3/4,z\u002B3/4,-y\u002B1/4',
          '-z\u002B1/4,-y\u002B3/4,x\u002B3/4',
          '-z\u002B3/4,y\u002B3/4,-x\u002B1/4',
          'z\u002B3/4,-y\u002B1/4,-x\u002B3/4',
          'z\u002B1/4,y\u002B1/4,x\u002B1/4'
        ]
      }
    ],
    crystalSystem: CrystalSystem.Cubic
  }
]
