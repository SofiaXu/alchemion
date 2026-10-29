import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { CifParser } from '..'

describe('Read Example CIF', () => {
  it('should parse structure', () => {
    const file = readFileSync(__dirname + '/test-data/9002807.cif', 'utf-8')
    const parser = new CifParser()
    const structure = parser.parse(file)
    // The fixture contains five source rows; symmetry copies are not parser output.
    expect(structure.atoms.map((atom) => atom.name)).toEqual(['Ca', 'Sr', 'Ti', 'O1', 'O2'])
    expect(structure.bonds.length).toBe(0)
  })
})
