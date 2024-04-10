import { IAtom, IBond } from '../structure'
import { IAtomExtend } from './atom-extend'

export const computeBonds = async (atoms: Array<IAtomExtend | IAtom>): Promise<IBond[]> => {
  const bonds: IBond[] = []
  for (let i = 0; i < atoms.length; i++) {
    const atom1 = atoms[i]
    for (let j = i + 1; j < atoms.length; j++) {
      const atom2 = atoms[j]
      if (!atom1.element.bondElements.includes(atom2.element.id)) continue
      const dx = atom1.x - atom2.x
      const dy = atom1.y - atom2.y
      const dz = atom1.z - atom2.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const bondLength = atom1.element.radius + atom2.element.radius
      if (distance < bondLength) {
        bonds.push({
          source: atom1,
          target: atom2,
          type: 'single',
          metadata: {}
        })
      }
    }
  }
  return bonds
}

export const computeNewBonds = async (
  oldAtoms: Array<IAtomExtend | IAtom>,
  newAtoms: Array<IAtomExtend | IAtom>
): Promise<IBond[]> => {
  const atoms = [...newAtoms, ...oldAtoms]
  const bonds: IBond[] = []
  for (let i = 0; i < newAtoms.length; i++) {
    const atom1 = atoms[i]
    for (let j = i + 1; j < atoms.length; j++) {
      const atom2 = atoms[j]
      if (!atom1.element.bondElements.includes(atom2.element.id)) continue
      const dx = atom1.x - atom2.x
      const dy = atom1.y - atom2.y
      const dz = atom1.z - atom2.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const bondLength = atom1.element.radius + atom2.element.radius
      if (distance < bondLength) {
        bonds.push({
          source: atom1,
          target: atom2,
          type: 'single',
          metadata: {}
        })
      }
    }
  }
  return bonds
}
