import { describe, expect, it } from 'vitest'
import { parseCifDocument, writeCifDocument } from '../document'
import type { CifValue } from '../types'
import { cif2Document } from './fixtures'

describe('CIF document standard grammar', () => {
  it('distinguishes lexical strings, missing markers, and numbers without changing literals', () => {
    const parsed = parseCifDocument(`data_a\nloop_\n_key\n? . '?' '.' 1.230(4) '1.230(4)'\n`)
    expect(parsed.diagnostics).toEqual([])
    expect(parsed.document?.version).toBe('1')
    const entry = parsed.document!.blocks[0].entries[0]
    expect(entry.kind).toBe('loop')
    if (entry.kind !== 'loop') throw new Error('Expected loop')
    expect(entry.rows.map((row) => row[0])).toMatchObject([
      { kind: 'unknown' },
      { kind: 'not-applicable' },
      { kind: 'scalar', value: '?', quoted: true },
      { kind: 'scalar', value: '.', quoted: true },
      { kind: 'scalar', value: '1.230(4)', quoted: false },
      { kind: 'scalar', value: '1.230(4)', quoted: true }
    ])
  })

  it('reads and writes Unicode, nested values, triples, text prefixing and legal frames', () => {
    const parsed = parseCifDocument(cif2Document)
    expect(parsed.diagnostics).toEqual([])
    expect(parsed.document?.blocks[0].name).toBe('Unicode_😀')
    expect(parsed.document?.blocks[0].saveFrames[0].name).toBe('definition')
    expect(parsed.document?.blocks[0].entries[2]).toMatchObject({
      value: { value: ';embedded\ntext' }
    })
    const output = writeCifDocument(parsed.document!)
    expect(output.diagnostics).toEqual([])
    const reread = parseCifDocument(output.text!)
    expect(reread.diagnostics).toEqual([])
    const semantic = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(semantic)
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'sourceLocation' && key !== 'quoted')
            .map(([key, child]) => [key, semantic(child)])
        )
      return value
    }
    expect(semantic(reread.document)).toEqual(semantic(parsed.document))
  })

  it('decodes folded and prefixed-folded text as logical CIF2 values', () => {
    const parsed = parseCifDocument(
      '#\\#CIF_2.0\ndata_x\n_fold\n;\\\nlong\\\n line\n;\n_prefold\n;P>\\\\\nP>one\\\nP>two\n;\n'
    )
    expect(parsed.diagnostics).toEqual([])
    expect(parsed.document!.blocks[0].entries).toMatchObject([
      { value: { value: 'long line' } },
      { value: { value: 'onetwo' } }
    ])
  })

  it('honors CIF1 quote termination and comments inside values', () => {
    const result = parseCifDocument(
      `data_a\n_a 'don't stop'\n_b bare#value # actual comment\n_c\n;line 1\nline 2\n;\n`
    )
    expect(result.diagnostics).toEqual([])
    expect(result.document!.blocks[0].entries).toMatchObject([
      { value: { value: "don't stop" } },
      { value: { value: 'bare#value' } },
      { value: { value: 'line 1\nline 2' } }
    ])
  })

  it('accepts empty documents and blocks and retains all blocks', () => {
    expect(parseCifDocument('# only a comment').document?.blocks).toEqual([])
    expect(parseCifDocument('data_a\ndata_b').document?.blocks.map((block) => block.name)).toEqual([
      'a',
      'b'
    ])
    expect(
      parseCifDocument('#\\#CIF_2.0\ndata_with[1]\n_tag{2} value\n').document?.blocks[0]
    ).toMatchObject({ name: 'with[1]', entries: [{ tag: { name: '_tag{2}' } }] })
  })

  it.each([
    ['incomplete loop', 'data_a\nloop_\n_a\n_b\n1 2 3\n', 'CIF_LOOP_CARDINALITY'],
    ['empty loop', 'data_a\nloop_\n_a\n', 'CIF_LOOP_CARDINALITY'],
    ['nested frame', 'data_a\nsave_one\n_a 1\nsave_two\n_b 2\nsave_\nsave_\n', 'CIF_SAVE_FRAME'],
    ['unclosed frame', 'data_a\nsave_one\n_a 1\n', 'CIF_SAVE_FRAME'],
    ['global block', 'data_a\nglobal_\n_a 1\n', 'CIF_CONSTRUCT'],
    ['stop construct', 'data_a\nloop_\n_a\n1\nstop_\n', 'CIF_CONSTRUCT'],
    ['duplicate name', 'data_A\ndata_a\n', 'CIF_DUPLICATE_BLOCK'],
    ['duplicate tag', 'data_a\n_Tag 1\n_tag 2\n', 'CIF_DUPLICATE_TAG'],
    ['CIF2 without heading', 'data_a\n_list [1 2]\n', 'CIF_BARE_START'],
    ['unknown version', '#\\#CIF_3.0\ndata_a\n', 'CIF_VERSION'],
    ['CIF1 Unicode', 'data_a\n_a α\n', 'CIF_CHARACTER'],
    ['multiline quote', "data_a\n_a 'line\nline'\n", 'CIF_QUOTED_NEWLINE'],
    ['missing value', 'data_a\n_a\n', 'CIF_MISSING_VALUE'],
    ['CIF1 long tag', `data_a\n_${'a'.repeat(75)} 1\n`, 'CIF_NAME'],
    ['line limit', `data_a\n_a '${'a'.repeat(2049)}'\n`, 'CIF_LINE_LENGTH'],
    ['CIF2 key spacing', '#\\#CIF_2.0\ndata_a\n_a {"key" :1}\n', 'CIF_TABLE_COLON'],
    ['CIF2 adjacent values', '#\\#CIF_2.0\ndata_a\n_a ["x""y"]\n', 'CIF_SEPARATOR'],
    ['Unicode case folding', '#\\#CIF_2.0\ndata_Straße\ndata_STRASSE\n', 'CIF_DUPLICATE_BLOCK'],
    ['canonical name', '#\\#CIF_2.0\ndata_a\n_é 1\n_é 2\n', 'CIF_DUPLICATE_TAG']
  ])('rejects %s with a located diagnostic', (_case, input, code) => {
    const result = parseCifDocument(input)
    expect(result.document).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      code,
      sourceLocation: {
        line: expect.any(Number),
        column: expect.any(Number),
        offset: expect.any(Number)
      }
    })
  })

  it('does not downgrade CIF2 containers or Unicode to CIF1', () => {
    const document = parseCifDocument(cif2Document).document!
    expect(writeCifDocument(document, { version: '1' }).text).toBeUndefined()
    const value: CifValue = { kind: 'scalar', quoted: true, value: `one ''' two """\n;three` }
    const output = writeCifDocument({
      version: '2',
      blocks: [
        { name: 'a', entries: [{ kind: 'item', tag: { name: '_a' }, value }], saveFrames: [] }
      ]
    })
    expect(output.diagnostics).toEqual([])
    expect(parseCifDocument(output.text!).document!.blocks[0].entries[0]).toMatchObject({ value })
  })
  it('serializes long logical lines and literal trailing backslashes with CIF2 text protocols', () => {
    const text = `${'α'.repeat(3000)}\n\\\ncontains ''' and """\n;embedded\\  \nlast\\`
    const output = writeCifDocument({
      version: '2',
      blocks: [
        {
          name: 'a',
          entries: [
            {
              kind: 'item',
              tag: { name: '_text' },
              value: { kind: 'scalar', value: text, quoted: true }
            }
          ],
          saveFrames: []
        }
      ]
    })
    expect(output.diagnostics).toEqual([])
    expect(
      Math.max(...output.text!.split('\n').map((line) => Array.from(line).length))
    ).toBeLessThanOrEqual(2048)
    expect(parseCifDocument(output.text!).document?.blocks[0].entries[0]).toMatchObject({
      value: { value: text }
    })
  })
})
