export { calculateAtomCopy } from './atom'
import { calculateAtomCopy } from './atom'
import { IAtom, IBond, IStructure } from '../../core/structure'
import { IEditorOptions } from '../contracts'
import { computeBonds, computeNewBonds } from './bond'
import { IAtomExtend } from './atom-extend'

let structure: IStructure | undefined = undefined
let options: IEditorOptions | undefined = undefined
let prevOptions: IEditorOptions | undefined = undefined
let shadowStructure: IStructure | undefined = undefined
const load = async () => {
  if (!structure || !options) return
  const newShadowStructure = { ...structure }
  const { lattice } = newShadowStructure
  if (lattice) {
    const { a, b, c, alpha, beta, gamma, volume } = lattice
    const alpha1 = alpha * (Math.PI / 180)
    const beta1 = beta * (Math.PI / 180)
    const gamma1 = gamma * (Math.PI / 180)
    const cosAlpha = alpha === 0 ? 1 : alpha === 90 ? 0 : alpha === 180 ? -1 : Math.cos(alpha1)
    const cosBeta = beta === 0 ? 1 : beta === 90 ? 0 : beta === 180 ? -1 : Math.cos(beta1)
    const cosGamma = gamma === 0 ? 1 : gamma === 90 ? 0 : gamma === 180 ? -1 : Math.cos(gamma1)
    const sinGamma = gamma === 0 ? 0 : gamma === 90 ? 1 : gamma === 180 ? 0 : Math.sin(gamma1)
    let atoms: Array<IAtomExtend> = newShadowStructure.atoms.map((atom) => {
      const { x, y, z } = atom
      const x1 = x * a + y * b * cosGamma + z * c * cosBeta
      const y1 = y * b * sinGamma + (z * c * (cosAlpha - cosBeta * cosGamma)) / sinGamma
      const z1 = (z * volume) / (a * b * sinGamma)
      return {
        ...atom,
        x: x1,
        y: y1,
        z: z1,
        fractionalX: x,
        fractionalY: y,
        fractionalZ: z
      }
    })
    if (options.showNeighborCells || options.showSymmetryMates) {
      const settings = options.showSymmetryMates ? lattice.spaceGroup.operations : ['x,y,z']
      const cells: [number, number, number][] = options.showNeighborCells
        ? options.neighborCells
        : [[0, 0, 0]]
      if (settings.length > 0 || cells.length > 0) {
        let unitCellCutoffFraction = options.unitCellCutoffFraction
        if (options.unitCellCutoffMethod === 'bond') {
          const min = 1 / Math.min(lattice.a, lattice.b, lattice.c)
          unitCellCutoffFraction = [min, min, min]
        }
        atoms = await calculateAtomCopy(atoms, lattice, settings, cells, unitCellCutoffFraction)
      }
    }
    if (options.autoComputeBonds && newShadowStructure.bonds.length === 0) {
      let bonds = await computeBonds(atoms)
      if (options.unitCellCutoffMethod == 'bond') {
        bonds = bonds.filter((bond) => {
          const { source, target } = bond
          const source1 = source as IAtomExtend
          const target1 = target as IAtomExtend
          let sourceInUnitCell = false
          if (
            source1.fractionalX <= 1 &&
            source1.fractionalX >= 0 &&
            source1.fractionalY <= 1 &&
            source1.fractionalY >= 0 &&
            source1.fractionalZ <= 1 &&
            source1.fractionalZ >= 0
          ) {
            sourceInUnitCell = true
          }
          let targetInUnitCell = false
          if (
            target1.fractionalX <= 1 &&
            target1.fractionalX >= 0 &&
            target1.fractionalY <= 1 &&
            target1.fractionalY >= 0 &&
            target1.fractionalZ <= 1 &&
            target1.fractionalZ >= 0
          ) {
            targetInUnitCell = true
          }
          if (sourceInUnitCell || targetInUnitCell) {
            return true
          }
          atoms.splice(atoms.indexOf(source1), 1)
          atoms.splice(atoms.indexOf(target1), 1)
          return false
        })
      }
      newShadowStructure.bonds = bonds
    }
    newShadowStructure.atoms = atoms
  } else {
    if (options.autoComputeBonds && newShadowStructure.bonds.length === 0) {
      const { atoms } = newShadowStructure
      const bonds = await computeBonds(atoms)
      newShadowStructure.bonds = bonds
    }
  }
  shadowStructure = newShadowStructure
  postMessage({
    method: 'load',
    shadowStructure
  })
}

const loadOptions = async () => {
  if (!structure || !options || !prevOptions || !shadowStructure) return
  let reload = false
  const atoms: Array<IAtom> = []
  const bonds: Array<IBond> = []
  if (prevOptions.showNeighborCells && !options.showNeighborCells) {
    shadowStructure.atoms = shadowStructure?.atoms.filter((atom) => {
      if (
        atom.shadowByCell &&
        atom.shadowByCell[0] !== 0 &&
        atom.shadowByCell[1] !== 0 &&
        atom.shadowByCell[2] !== 0
      ) {
        atoms.push(atom)
        return false
      }
      return true
    })
    shadowStructure.bonds = shadowStructure?.bonds.filter((bond) => {
      const { source, target } = bond
      if (
        source.shadowByCell &&
        source.shadowByCell[0] !== 0 &&
        source.shadowByCell[1] !== 0 &&
        source.shadowByCell[2] !== 0
      ) {
        bonds.push(bond)
        return false
      }
      if (
        target.shadowByCell &&
        target.shadowByCell[0] !== 0 &&
        target.shadowByCell[1] !== 0 &&
        target.shadowByCell[2] !== 0
      ) {
        bonds.push(bond)
        return false
      }
      return true
    })
  } else {
    reload = true
  }
  if (prevOptions.showSymmetryMates && !options.showSymmetryMates) {
    shadowStructure.atoms = shadowStructure?.atoms.filter((atom) => {
      if (atom.shadowBySymOp) {
        atoms.push(atom)
        return false
      }
      return true
    })
    shadowStructure.bonds = shadowStructure?.bonds.filter((bond) => {
      const { source, target } = bond
      if (source.shadowBySymOp) {
        bonds.push(bond)
        return false
      }
      if (target.shadowBySymOp) {
        bonds.push(bond)
        return false
      }
      return true
    })
  } else {
    reload = true
  }
  if (
    (prevOptions.unitCellCutoffMethod === 'bond' && options.unitCellCutoffMethod !== 'bond') ||
    prevOptions.unitCellCutoffFraction[0] !== options.unitCellCutoffFraction[0] ||
    prevOptions.unitCellCutoffFraction[1] !== options.unitCellCutoffFraction[1] ||
    prevOptions.unitCellCutoffFraction[2] !== options.unitCellCutoffFraction[2] ||
    prevOptions.autoComputeBonds !== options.autoComputeBonds
  ) {
    reload = true
  }
  if (reload) {
    await load()
  } else {
    postMessage({
      method: 'loadOptions',
      shadowStructure,
      atoms,
      bonds
    })
  }
}

const addAtom = async (newAtoms: IAtom[]) => {
  if (!structure || !options || !shadowStructure) return
  structure.atoms.push(...newAtoms)
  const { lattice } = shadowStructure
  let atoms: Array<IAtomExtend> = []
  let bonds: Array<IBond> = []
  if (lattice) {
    const { a, b, c, alpha, beta, gamma, volume } = lattice
    const alpha1 = alpha * (Math.PI / 180)
    const beta1 = beta * (Math.PI / 180)
    const gamma1 = gamma * (Math.PI / 180)
    const cosAlpha = alpha === 0 ? 1 : alpha === 90 ? 0 : alpha === 180 ? -1 : Math.cos(alpha1)
    const cosBeta = beta === 0 ? 1 : beta === 90 ? 0 : beta === 180 ? -1 : Math.cos(beta1)
    const cosGamma = gamma === 0 ? 1 : gamma === 90 ? 0 : gamma === 180 ? -1 : Math.cos(gamma1)
    const sinGamma = gamma === 0 ? 0 : gamma === 90 ? 1 : gamma === 180 ? 0 : Math.sin(gamma1)
    atoms = newAtoms.map((atom) => {
      const { x, y, z } = atom
      const x1 = x * a + y * b * cosGamma + z * c * cosBeta
      const y1 = y * b * sinGamma + (z * c * (cosAlpha - cosBeta * cosGamma)) / sinGamma
      const z1 = (z * volume) / (a * b * sinGamma)
      return {
        ...atom,
        x: x1,
        y: y1,
        z: z1,
        fractionalX: x,
        fractionalY: y,
        fractionalZ: z
      }
    })
    if (options.showNeighborCells || options.showSymmetryMates) {
      const settings = options.showSymmetryMates ? lattice.spaceGroup.operations : ['x,y,z']
      const cells: [number, number, number][] = options.showNeighborCells
        ? options.neighborCells
        : [[0, 0, 0]]
      if (settings.length > 0 || cells.length > 0) {
        let unitCellCutoffFraction = options.unitCellCutoffFraction
        if (options.unitCellCutoffMethod === 'bond') {
          const min = 1 / Math.min(lattice.a, lattice.b, lattice.c)
          unitCellCutoffFraction = [min, min, min]
        }
        atoms = await calculateAtomCopy(atoms, lattice, settings, cells, unitCellCutoffFraction)
      }
    }
    if (options.autoComputeBonds) {
      bonds = await computeNewBonds(atoms, shadowStructure.atoms)
      if (options.unitCellCutoffMethod == 'bond') {
        bonds = bonds.filter((bond) => {
          const { source, target } = bond
          const source1 = source as IAtomExtend
          const target1 = target as IAtomExtend
          let sourceInUnitCell = false
          if (
            source1.fractionalX <= 1 &&
            source1.fractionalX >= 0 &&
            source1.fractionalY <= 1 &&
            source1.fractionalY >= 0 &&
            source1.fractionalZ <= 1 &&
            source1.fractionalZ >= 0
          ) {
            sourceInUnitCell = true
          }
          let targetInUnitCell = false
          if (
            target1.fractionalX <= 1 &&
            target1.fractionalX >= 0 &&
            target1.fractionalY <= 1 &&
            target1.fractionalY >= 0 &&
            target1.fractionalZ <= 1 &&
            target1.fractionalZ >= 0
          ) {
            targetInUnitCell = true
          }
          if (sourceInUnitCell || targetInUnitCell) {
            return true
          }
          atoms.splice(atoms.indexOf(source1), 1)
          atoms.splice(atoms.indexOf(target1), 1)
          return false
        })
      }
      shadowStructure.bonds.push(...bonds)
    }
    shadowStructure.atoms.push(...atoms)
  } else {
    if (options.autoComputeBonds && shadowStructure.bonds.length === 0) {
      atoms = newAtoms.map((atom) => {
        return {
          ...atom,
          fractionalX: atom.x,
          fractionalY: atom.y,
          fractionalZ: atom.z
        }
      })
      bonds = await computeNewBonds(atoms, shadowStructure.atoms)
      shadowStructure.bonds.push(...bonds)
      shadowStructure.atoms.push(...atoms)
    }
  }
  postMessage({
    method: 'addAtom',
    shadowStructure,
    atoms,
    bonds
  })
}

const removeAtom = async (newAtoms: IAtom[]) => {
  if (!structure || !options || !shadowStructure) return
  const atom = newAtoms[0]
  const atoms: Array<IAtom> = []
  const bonds: Array<IBond> = []
  structure.atoms.splice(structure.atoms.indexOf(atom), 1)
  shadowStructure.atoms = shadowStructure.atoms.filter((a) => {
    if (a.name !== atom.name && a.shadowFrom?.name !== atom.name) {
      return true
    }
    atoms.push(a)
    return false
  })
  shadowStructure.bonds = shadowStructure.bonds.filter((bond) => {
    const { source, target } = bond
    if (
      source.name !== atom.name &&
      target.name !== atom.name &&
      source.shadowFrom?.name !== atom.name &&
      target.shadowFrom?.name !== atom.name
    ) {
      return true
    }
    bonds.push(bond)
    return false
  })
  postMessage({
    method: 'removeAtom',
    shadowStructure,
    atoms,
    bonds
  })
}

const updateAtom = async (newAtoms: IAtom[]) => {
  if (!structure || !options || !shadowStructure) return
  const newAtom = newAtoms[1]
  await removeAtom(newAtoms)
  await addAtom([newAtom])
}

onmessage = async (
  e: MessageEvent<{
    method: 'load' | 'loadOptions' | 'addAtom' | 'removeAtom' | 'updateAtom'
    args:
      | {
          structure: IStructure
          options: IEditorOptions
        }
      | IEditorOptions
      | IAtom[]
  }>
) => {
  switch (e.data.method) {
    case 'load': {
      const args = e.data.args as {
        structure: IStructure
        options: IEditorOptions
      }
      structure = args.structure
      options = args.options
      await load()
      break
    }
    case 'loadOptions': {
      prevOptions = options
      options = e.data.args as IEditorOptions
      await loadOptions()
      break
    }
    case 'addAtom': {
      await addAtom(e.data.args as IAtom[])
      break
    }
    case 'removeAtom': {
      await removeAtom(e.data.args as IAtom[])
      break
    }
    case 'updateAtom': {
      await updateAtom(e.data.args as IAtom[])
      break
    }
  }
}
