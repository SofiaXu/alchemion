import { describe, expect, it } from 'vitest'
import { TokenStream } from '../../common/token-stream'
import { CifDocumentParser } from '../cif-document-parser'
import { readFileSync } from 'fs'

describe('CIF Version Detection', () => {
  it('should detect CIF 1.1 version', () => {
    const file = readFileSync(__dirname + '/test-data/ver1.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const version = parser.parse(tokenStream).version
    expect(version).toBe('1.1')
  })
  it('should detect CIF 2.0 version', () => {
    const file = readFileSync(__dirname + '/test-data/ver2.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const version = parser.parse(tokenStream).version
    expect(version).toBe('2.0')
  })
  it('should throw an error when CIF 2.0 is not supported', () => {
    const file = readFileSync(__dirname + '/test-data/ver2.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser({ isCif1Only: true })
    expect(() => parser.parse(tokenStream)).toThrow('CIF 2.0 is not supported yet.')
  })
})

describe('empty CIF', () => {
  it('should be empty', () => {
    const file = readFileSync(__dirname + '/test-data/empty.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data).toEqual([])
  })
  it('should be empty only with comments', () => {
    const file = readFileSync(__dirname + '/test-data/comment_only.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data).toEqual([])
  })
})

describe('CIF loop', () => {
  it('should parse loop', () => {
    const file = readFileSync(__dirname + '/test-data/simple_loops.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('simple_loops')
    expect(data.single).toMatchObject([1, 2, 3])
    expect(data.col1).toMatchObject([1, 2, 3])
    expect(data.col2).toMatchObject(['v1', 'v2', 'v3'])
    expect(data.col3).toMatchObject([false, 1, '12.5(2)'])
    expect(data.scalar_a).toMatchObject(['a'])
    expect(data.scalar_b).toMatchObject(['b'])
  })
})

describe('CIF 2 Triple quotes', () => {
  it('should parse CIF 2 triple quotes', () => {
    const file = readFileSync(__dirname + '/test-data/triple.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.empty1).toBe('')
    expect(data.empty2).toBe('')
    expect(data.simple).toBe('simple')
    expect(data.tricky1).toBe("'tricky")
    expect(data.tricky2).toBe('""tricky')
    expect(data.embedded).toBe('"""embedded"""')
    expect(data.multiline1).toBe('first line\nsecond line')
    expect(data.multiline2).toBe('\nsecond line [of 3]\n')
    expect(data.ml_embed).toBe('\n_not_a_name\n;embedded\n;\n')
  })
})

describe('CIF 2 Unicode', () => {
  it('should parse CIF 2 Unicode', () => {
    const file = readFileSync(__dirname + '/test-data/unicode.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('Ŭnicöde→')
    expect(data.saveFrames.length).toBe(1)
    const saveFrame = data.saveFrames[0]
    expect(saveFrame.formula).toMatchObject(['C O2'])
    expect(saveFrame['ΔHf']).toMatchObject(['\u2212393.509'])
    expect(saveFrame.uvalue).toBe('ᚠ⠠')
  })
})

describe('CIF Text Fields', () => {
  it('should parse CIF text fields', () => {
    const file = readFileSync(__dirname + '/test-data/text_fields.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('text_fields')
    expect(data.plain1).toBe('\\\\\nline 2\\\nline 3    ')
    expect(data.plain2).toBe(';\\')
    expect(data.folded1).toBe('\\\nA (not so) long\\\n line.\nA normal line.\nNOT a long line.\\')
    expect(data.folded2).toBe('\\   \nline 1  \nline \\ \n2')
    expect(data.prefixed1).toBe(' \\\n _embedded\n ;\n ;')
    expect(data.prefixed2).toBe('pfx>\\  \npfx>_embedded\npfx>;\npfx>;')
    expect(data.pfx_folded).toBe('> \\\\  \n> line 1 \\\n> is folded\\\n>  twice.')
    expect(data.folded_empty).toBe('\\')
    expect(data.prefixed_empty).toBe('>>\\')
    expect(data.pfx_fold_empty).toBe('πφχ\\\\')
  })
})

describe('CIF 2 Table', () => {
  it('should parse CIF 2 table', () => {
    const file = readFileSync(__dirname + '/test-data/table_data.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('table_data')
    expect(data.empty_table1).toMatchObject({})
    expect(data.empty_table2).toMatchObject({})
    expect(data.empty_table3).toMatchObject({})
    expect(data.singleton_table1).toMatchObject({ zero: 0 })
    expect(data.singleton_table2).toMatchObject({ text: 'text' })
    expect(data.singleton_table3).toMatchObject({ '': 'empty_key' })
    expect(data.digit3_map).toMatchObject({ zero: 0, one: 1, two: 2 })
    expect(data.space_keys).toMatchObject({ '': 0, ' ': 1, '   ': 3 })
    expect(data.type_examples).toMatchObject({
      char: 'char',
      unknown: false,
      'N/A': null,
      numb: '-123.4e+67(5)'
    })
  })
})

describe('CIF Simple Data', () => {
  it('should parse CIF simple data', () => {
    const file = readFileSync(__dirname + '/test-data/simple_data.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('simple_data')
    expect(data.unknown_value).toBe(false)
    expect(data.na_value).toBe(null)
    expect(data.unquoted_string).toBe('unquoted')
    expect(data.sq_string).toBe('sq')
    expect(data.dq_string).toBe('dq')
    expect(data.text_string).toBe('text')
    expect(data.numb_plain).toBe(1250)
    expect(data.numb_su).toBe('0.0625(2)')
    expect(data.numb_tz).toBe(17.125)
    expect(data.numb_quoted).toBe('1.0')
    expect(data.query_quoted).toBe('?')
    expect(data.dot_quoted).toBe('.')
  })
})

describe('CIF Containers', () => {
  it('should parse many containers', () => {
    const file = readFileSync(__dirname + '/test-data/simple_containers.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(3)
    expect(document.data[0].blockName).toBe('block1')
    expect(document.data[0].saveFrames.length).toBe(2)
    expect(document.data[0].location).toBe('block1')
    expect(document.data[0].saveFrames[0].blockName).toBe('s1')
    expect(document.data[0].saveFrames[0].location).toBe('block1/s1')
    expect(document.data[0].saveFrames[1].blockName).toBe('s2')
    expect(document.data[0].saveFrames[1].location).toBe('block1/s2')
    expect(document.data[1].blockName).toBe('block2')
    expect(document.data[2].blockName).toBe('block3')
    expect(document.data[2].location).toBe('block3')
    expect(document.data[2].saveFrames[0].blockName).toBe('s1')
    expect(document.data[2].saveFrames[0].location).toBe('block3/s1')
    expect(document.data[2].saveFrames[1].blockName).toBe('s3')
  })
  it('should parse nested save frames', () => {
    const file = readFileSync(__dirname + '/test-data/nested.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('nested')
    expect(data.nesting_level).toBe(0)
    expect(data.saveFrames.length).toBe(1)
    expect(data.saveFrames[0].blockName).toBe('nested')
    expect(data.saveFrames[0].nesting_level).toBe(1)
    expect(data.saveFrames[0].saveFrames.length).toBe(2)
    expect(data.saveFrames[0].saveFrames[0].blockName).toBe('nested')
    expect(data.saveFrames[0].saveFrames[0].nesting_level).toBe(2)
    expect(data.saveFrames[0].saveFrames[1].blockName).toBe('sibling')
    expect(data.saveFrames[0].saveFrames[1].nesting_level).toBe(2)
  })
  it('should parse container names', () => {
    const file = readFileSync(__dirname + '/test-data/container_names.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    expect(document.data[0].blockName).toBe('with[1]')
    expect(document.data[0].saveFrames.length).toBe(1)
    expect(document.data[0].saveFrames[0].blockName).toBe('with{2}')
  })
})

describe('CIF 2 Lists', () => {
  it('should parse CIF 2 lists', () => {
    const file = readFileSync(__dirname + '/test-data/list_data.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('list_data')
    expect(data.empty_list1).toMatchObject([])
    expect(data.empty_list2).toMatchObject([])
    expect(data.empty_list3).toMatchObject([])
    expect(data.single_na1).toMatchObject([null])
    expect(data.single_na2).toMatchObject([null])
    expect(data.single_na3).toMatchObject([null])
    expect(data.single_unk).toMatchObject([false])
    expect(data.single_string1).toMatchObject(['bare'])
    expect(data.single_string2).toMatchObject(['sq'])
    expect(data.single_string3).toMatchObject(['[ not a list ]'])
    expect(data.single_numb1).toMatchObject([0])
    expect(data.single_numb2).toMatchObject(['-10.0(2)'])
    expect(data.digit_list).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(data.string_list).toMatchObject(['one', 'two', '"three"'])
    expect(data.mixed_list).toMatchObject(['Mary', 'had', 1, 'little', false, 'Its fleece....'])
  })
})

describe('CIF 2 Complex data', () => {
  it('should parse CIF 2 complex data', () => {
    const file = readFileSync(__dirname + '/test-data/complex_data.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    expect(document.data.length).toBe(1)
    const data = document.data[0]
    expect(data.blockName).toBe('complex_data')
    expect(data.list_of_lists).toMatchObject([[], ['foo', 'bar'], ['x', 'y', 'z']])
    expect(data.table_of_tables).toMatchObject({
      English: {
        one: 'one',
        two: 'two'
      },
      French: {
        one: 'un',
        two: 'deux'
      }
    })
    expect(data.hodge_podge).toMatchObject([
      false,
      { a: 10, b: 11, c: [false, 12] },
      [null, null, {}, { alice: 'Cambridge', bob: 'Harvard', charles: null }]
    ])
  })
})

describe('CIF 1.1 Strings', () => {
  it('should parse CIF 1.1 unquoted strings', () => {
    const file = readFileSync(__dirname + '/test-data/cif11_unquoted.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    const data = document.data[0]
    expect(data.blockName).toBe('cif11_unquoted')
    expect(data.bracket_mid).toBe('Fc^*^=kFc[1+0.001xFc^2^\\l^3^/sin(2\\q)]^-1/4^')
    expect(data.bracket_end).toBe('a[42]')
    expect(data.brace_begin).toBe('{foo}bar')
    expect(data.brace_mid).toBe('bar{foo}bar')
  })
  it('should parse CIF 1.1 quoted strings', () => {
    const file = readFileSync(__dirname + '/test-data/cif1_quoting.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    const document = parser.parse(tokenStream)
    const data = document.data[0]
    expect(data.blockName).toBe('cif1_quoting')
    expect(data.sq).toBe("don't rock the boat")
    expect(data.dq).toBe('What\'s this ab\\"out?')
  })
  it('should parse CIF 1.1 invaild', () => {
    const file = readFileSync(__dirname + '/test-data/cif1_invalid.cif', 'utf-8')
    const tokenStream = new TokenStream(file)
    const parser = new CifDocumentParser()
    expect(() => parser.parse(tokenStream)).toThrow(
      'Invalid CIF format.\nvalue: "["\ncol: 10\nrow: 5'
    )
  })
})
