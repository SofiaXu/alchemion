import { Element, elements } from '../elements'
import * as uuid from 'uuid'

export class Atom {
  private _mass = 0
  private _valence: number
  x: number
  y: number
  z: number
  element: Readonly<Element>
  readonly id: string
  name?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any = {}
  get mass(): number {
    return this._mass === 0 || this._mass === this.element.mass ? this.element.mass : this._mass
  }
  set mass(value: number) {
    this._mass = value
  }
  get valence(): number {
    return this._valence
  }
  set valence(value: number) {
    if (value < 0 || value > this.element.valence)
      throw Error(
        `Unable to set valence of ${this.element.symbol} to ${value}. Valence must be between 0 and ${this.element.valence}.`
      )
    this._valence = value
  }

  constructor(element: Readonly<Element>, x: number, y: number, z: number, name?: string) {
    if (!elements.includes(element))
      throw Error(
        `Unable to create atom. ${element.symbol} is not a valid element. Get element from elements list.`
      )
    this.element = element
    this.x = x
    this.y = y
    this.z = z
    this.id = uuid.v4()
    this.name = name
    this._valence = this.element.valence
  }
}

export class Bond {
  readonly id: string
  get name(): string {
    return `${this.source.name}-${this.target.name}`
  }
  readonly source: Atom
  readonly target: Atom
  private _type: 'single' | 'double' | 'triple' | 'aromatic'
  get type(): 'single' | 'double' | 'triple' | 'aromatic' {
    return this._type
  }
  set type(value: 'single' | 'double' | 'triple' | 'aromatic') {
    if (
      value === 'aromatic' &&
      this.source.element.symbol !== 'C' &&
      this.target.element.symbol !== 'C'
    )
      throw Error(
        `Unable to set bond type to aromatic. ${this.source.element.symbol}-${this.target.element.symbol} is not a valid aromatic bond.`
      )
    const oldValence =
      this._type === 'aromatic'
        ? 1.5
        : this._type === 'single'
        ? 1
        : this._type === 'double'
        ? 2
        : 3
    const newValence =
      value === 'aromatic' ? 1.5 : value === 'single' ? 1 : value === 'double' ? 2 : 3
    if (
      this.source.valence + oldValence - newValence < 0 ||
      this.target.valence + oldValence - newValence < 0
    )
      throw Error(
        `Unable to set bond type to ${value}. ${this.source.element.symbol} or ${this.target.element.symbol} has no more valence.`
      )
    this.source.valence = this.source.valence + oldValence - newValence
    this.target.valence = this.target.valence + oldValence - newValence
    this._type = value
  }
  valence: number
  stereo?: 'up' | 'down' | 'either' | 'cis' | 'trans'
  topology?: 'either' | 'ring' | 'chain'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any = {}
  constructor(source: Atom, target: Atom, type?: 'single' | 'double' | 'triple' | 'aromatic') {
    if (source === target)
      throw Error('Unable to create bond. Source and target atoms are the same.')
    if (
      !source.element.bondElements.includes(target.element.id) &&
      !target.element.bondElements.includes(source.element.id)
    )
      throw Error(
        `Unable to create bond. ${source.element.symbol} cannot bond with ${target.element.symbol}.`
      )
    // todo: add valence from bvpram.cif
    const dx = source.x - target.x
    const dy = source.y - target.y
    const dz = source.z - target.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const bond = source.element.radius + target.element.radius
    const max_bond = bond * 1.2
    const min_bond = bond * 0.5
    if (distance > max_bond || distance <= min_bond)
      throw Error(
        `Unable to create bond. Distance between ${source.element.symbol} and ${target.element.symbol} is ${distance} which is out of range ${min_bond} to ${max_bond}.`
      )
    if (source.valence === 0 || target.valence === 0)
      throw Error(
        `Unable to create bond. ${source.element.symbol} or ${target.element.symbol} has no more valence.`
      )
    if (
      type === 'aromatic' &&
      this.source.element.symbol !== 'C' &&
      this.target.element.symbol !== 'C'
    )
      throw Error(
        `Unable to set bond type to aromatic. ${this.source.element.symbol}-${this.target.element.symbol} is not a valid aromatic bond.`
      )
    if (!type) {
      switch (Math.min(source.valence, target.valence)) {
        case 1:
          type = 'single'
          break
        case 2:
          type = 'double'
          break
        case 3:
          type = 'triple'
          break
        case 1.5:
          if (source.element.symbol === 'C' || target.element.symbol === 'C') type = 'aromatic'
          else type = 'single'
          break
        default:
          throw Error(
            `Unable to create bond. ${source.element.symbol} or ${target.element.symbol} has no more valence.`
          )
      }
    }
    switch (type) {
      case 'single':
        if (source.valence < 1 || target.valence < 1)
          throw Error(
            `Unable to create bond. ${source.element.symbol} or ${target.element.symbol} has no more valence.`
          )
        source.valence--
        target.valence--
        break
      case 'double':
        if (source.valence < 2 || target.valence < 2)
          throw Error(
            `Unable to create bond. ${source.element.symbol} or ${target.element.symbol} has no more valence.`
          )
        source.valence -= 2
        target.valence -= 2
        break
      case 'triple':
        if (source.valence < 3 || target.valence < 3)
          throw Error(
            `Unable to create bond. ${source.element.symbol} or ${target.element.symbol} has no more valence.`
          )
        source.valence -= 3
        target.valence -= 3
        break
      case 'aromatic':
        if (source.valence < 1.5 || target.valence < 1.5)
          throw Error(
            `Unable to create bond. ${source.element.symbol} or ${target.element.symbol} has no more valence.`
          )
        source.valence -= 1.5
        target.valence -= 1.5
        break
      default:
        throw Error(`Invalid bond type: ${type}`)
    }
    this.source = source
    this.target = target
    this._type = type ?? 'single'
    this.id = uuid.v4()
  }
}

export class Structure {
  readonly id: string
  title?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any = {}
  private _atoms: Array<Atom> = []
  private _bonds: Array<Bond> = []
  get atoms(): ReadonlyArray<Atom> {
    return this._atoms
  }
  get bonds(): ReadonlyArray<Bond> {
    return this._bonds
  }
  addAtom(
    atom: Atom,
    withBond?: {
      source: Atom
      type?: 'single' | 'double' | 'triple' | 'aromatic'
    }
  ): void {
    if (atom.name === undefined || this._atoms.some((x) => x.name === atom.name))
      atom.name = `${atom.element.symbol}${
        Array.from(this._atoms.values()).filter((x) => x.element.symbol === atom.element.symbol)
          .length + 1
      }`
    this._atoms.push(atom)
    if (withBond) {
      this.addBond(new Bond(withBond.source, atom, withBond.type))
    }
  }
  protected addBond(bond: Bond): void {
    this._bonds.push(bond)
  }
  createBond(source: Atom, target: Atom, type?: 'single' | 'double' | 'triple' | 'aromatic'): Bond {
    const bond = new Bond(source, target, type)
    this.addBond(bond)
    return bond
  }
  removeAtom(id: string): void {
    this._atoms = this._atoms.filter((x) => x.id !== id)
    this._bonds = this._bonds.filter((x) => x.source.id !== id && x.target.id !== id)
  }
  removeBond(id: string): void {
    this._bonds = this._bonds.filter((x) => x.id !== id)
  }
  merge(structure: Structure, withBonds?: Bond[]): void {
    structure.atoms.forEach((atom) => this.addAtom(atom))
    structure.bonds.forEach((bond) => this.addBond(bond))
    if (withBonds) {
      withBonds.forEach((bond) => this.addBond(bond))
    }
  }
  constructor(title?: string) {
    this.id = uuid.v4()
    this.title = title ?? 'untitled structure'
  }
}
