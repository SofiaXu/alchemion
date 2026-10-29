import folds from './unicode-case-fold.json'
import type { Diagnostic } from '../../core/types'
import type { WriteResult } from '../contracts'
import type {
  CifDataBlock,
  CifDocument,
  CifDocumentResult,
  CifEntry,
  CifLocation,
  CifSaveFrame,
  CifValue,
  CifVersion
} from './types'

const folding = folds as Readonly<Record<string, string>>
/** Unicode 16 default full folding, with the canonical normalization CIF2 requires. */
export const cifNameKey = (value: string): string =>
  Array.from(value.normalize('NFD'), (character) => folding[character] ?? character)
    .join('')
    .normalize('NFD')
const white = (value: string | undefined): boolean =>
  value !== undefined && ' \t\r\n'.includes(value)
const reserved = (text: string): boolean => /^(?:data_|save_|loop_$|stop_$|global_$)/i.test(text)

class CifFailure extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message)
  }
}
interface Token {
  readonly type: 'bare' | 'quoted' | '[' | ']' | '{' | '}' | ':'
  readonly text: string
  readonly start: number
  readonly end: number
}

class Lexer {
  index = 0
  lastEnd = 0
  private pending?: Token
  private lineStarts = [0]
  readonly version: CifVersion
  constructor(private readonly text: string) {
    if (text.startsWith('\uFEFF')) this.index = 1
    const heading = text.slice(this.index).split(/\r\n|\r|\n/, 1)[0]
    const marker = /^#\\#CIF_(\S+)(.*)$/.exec(heading)
    if (marker && !['1.1', '2.0'].includes(marker[1]))
      this.fail('CIF_VERSION', 'Unsupported CIF version identifier.', this.index)
    if (marker && !/^[ \t]*$/.test(marker[2]))
      this.fail(
        'CIF_VERSION',
        'The version heading may only contain trailing horizontal whitespace.',
        this.index
      )
    this.version = marker?.[1] === '2.0' ? '2' : '1'
    let lineStart = 0
    for (let offset = 0; offset < text.length; ) {
      const point = text.codePointAt(offset)!
      const character = String.fromCodePoint(point)
      if (point === 13 || point === 10) {
        if (Array.from(text.slice(lineStart, offset)).length > 2048)
          this.fail(
            'CIF_LINE_LENGTH',
            'CIF physical lines cannot exceed 2048 characters.',
            lineStart
          )
        if (point === 13 && text[offset + 1] === '\n') offset++
        lineStart = offset + 1
        this.lineStarts.push(lineStart)
      } else if (
        !(offset === 0 && point === 0xfeff) &&
        (this.version === '1'
          ? point !== 9 && (point < 32 || point > 126)
          : point !== 9 &&
            (point < 32 ||
              (point >= 0x7f && point < 0xa0) ||
              (point >= 0xd800 && point <= 0xdfff) ||
              (point >= 0xfdd0 && point <= 0xfdef) ||
              (point & 0xffff) >= 0xfffe))
      ) {
        this.fail(
          'CIF_CHARACTER',
          'The input contains a character forbidden by its CIF version.',
          offset
        )
      }
      offset += character.length
    }
    if (Array.from(text.slice(lineStart)).length > 2048)
      this.fail('CIF_LINE_LENGTH', 'CIF physical lines cannot exceed 2048 characters.', lineStart)
  }
  location(offset: number): CifLocation {
    let lo = 0,
      hi = this.lineStarts.length
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (this.lineStarts[mid] <= offset) lo = mid
      else hi = mid
    }
    return {
      line: lo + 1,
      column: Array.from(this.text.slice(this.lineStarts[lo], offset)).length + 1,
      offset
    }
  }
  fail(code: string, message: string, offset = this.index): never {
    throw new CifFailure({
      severity: 'error',
      code,
      message,
      sourceLocation: this.location(offset),
      context: { format: 'cif', version: this.version ?? '1' }
    })
  }
  peek(): Token | undefined {
    this.pending ??= this.scan()
    return this.pending
  }
  next(): Token | undefined {
    const token = this.peek()
    this.pending = undefined
    if (token) this.lastEnd = token.end
    return token
  }
  private skip() {
    while (this.index < this.text.length) {
      if (white(this.text[this.index])) this.index++
      else if (this.text[this.index] === '#') {
        while (this.index < this.text.length && !'\r\n'.includes(this.text[this.index]))
          this.index++
      } else break
    }
  }
  private scan(): Token | undefined {
    this.skip()
    const start = this.index
    if (start >= this.text.length) return undefined
    const character = this.text[start]
    if (this.version === '2' && '[]{}:'.includes(character)) {
      this.index++
      return { type: character as Token['type'], text: character, start, end: this.index }
    }
    if (character === ';' && (start === 0 || '\r\n'.includes(this.text[start - 1]))) {
      this.index++
      const contentStart = this.index
      while (this.index < this.text.length) {
        if (this.text[this.index] === ';' && '\r\n'.includes(this.text[this.index - 1])) {
          let content = this.text.slice(contentStart, this.index).replace(/\r\n|\r/g, '\n')
          if (content.endsWith('\n')) content = content.slice(0, -1)
          this.index++
          if (
            this.index < this.text.length &&
            !white(this.text[this.index]) &&
            this.text[this.index] !== '#'
          )
            this.fail(
              'CIF_TEXT_TERMINATOR',
              'A text-field terminator must be followed by whitespace or a comment.'
            )
          if (this.version === '2') content = decodeText(content)
          return { type: 'quoted', text: content, start, end: this.index }
        }
        this.index++
      }
      this.fail('CIF_UNTERMINATED_TEXT', 'The semicolon text field is not terminated.', start)
    }
    if (character === "'" || character === '"') {
      const triple =
        this.version === '2' && this.text.slice(start, start + 3) === character.repeat(3)
      const delimiter = character.repeat(triple ? 3 : 1)
      this.index += delimiter.length
      const contentStart = this.index
      while (this.index < this.text.length) {
        if (this.text.startsWith(delimiter, this.index)) {
          const next = this.text[this.index + delimiter.length]
          if (triple || this.version === '2' || next === undefined || white(next)) {
            const content = this.text.slice(contentStart, this.index).replace(/\r\n|\r/g, '\n')
            this.index += delimiter.length
            if (
              this.index < this.text.length &&
              !white(this.text[this.index]) &&
              !(this.version === '2' && ':]}'.includes(this.text[this.index]))
            )
              this.fail('CIF_SEPARATOR', 'CIF syntax elements must be separated by whitespace.')
            return { type: 'quoted', text: content, start, end: this.index }
          }
        }
        if (!triple && '\r\n'.includes(this.text[this.index]))
          this.fail(
            'CIF_QUOTED_NEWLINE',
            'A single-quoted value cannot span physical lines.',
            start
          )
        this.index++
      }
      this.fail('CIF_UNTERMINATED_STRING', 'The quoted value is not terminated.', start)
    }
    if ('_#$\'"[]'.includes(character) && character !== '_')
      this.fail(
        'CIF_BARE_START',
        'This character cannot begin a whitespace-delimited CIF value.',
        start
      )
    const isName = character === '_' || /^(?:data_|save_)/i.test(this.text.slice(start, start + 5))
    while (this.index < this.text.length && !white(this.text[this.index])) {
      if (this.version === '2' && !isName && '[]{}'.includes(this.text[this.index])) break
      this.index++
    }
    if (this.index === start) this.fail('CIF_TOKEN', 'Unexpected CIF token.', start)
    return { type: 'bare', text: this.text.slice(start, this.index), start, end: this.index }
  }
}

/** Prefix removal precedes line unfolding; only CIF2 makes both normative. */
function decodeText(content: string): string {
  const firstLine = content.split('\n', 1)[0]
  const prefixMatch = /^([^\\\n]+)\\([ \t]*|\\[ \t]*)$/.exec(firstLine)
  if (prefixMatch) {
    const prefix = prefixMatch[1]
    const lines = content.split('\n')
    if (lines.every((line) => line.startsWith(prefix))) {
      content = lines.map((line) => line.slice(prefix.length)).join('\n')
      if (content.startsWith('\\\\')) content = content.slice(1)
      else content = content.includes('\n') ? content.slice(content.indexOf('\n') + 1) : ''
    }
  }
  if (/^\\[ \t]*(?:\n|$)/.test(content)) content = content.replace(/\\[ \t]*(?:\n|$)/g, '')
  return content
}

function valueFrom(token: Token, lexer: Lexer): CifValue {
  const sourceLocation = lexer.location(token.start)
  if (token.type === 'quoted')
    return { kind: 'scalar', value: token.text, quoted: true, sourceLocation }
  if (token.type === '[') {
    const values: CifValue[] = []
    while (lexer.peek()?.type !== ']') {
      const next = lexer.next()
      if (!next)
        lexer.fail('CIF_UNTERMINATED_LIST', 'The list value is not terminated.', token.start)
      values.push(valueFrom(next, lexer))
      const consumedEnd = lexer.lastEnd
      const following = lexer.peek()
      if (following && following.type !== ']' && consumedEnd === following.start)
        lexer.fail('CIF_SEPARATOR', 'List values must be separated by whitespace.', following.start)
    }
    lexer.next()
    return { kind: 'list', values, sourceLocation }
  }
  if (token.type === '{') {
    const entries: { key: string; value: CifValue }[] = []
    while (lexer.peek()?.type !== '}') {
      const key = lexer.next()
      if (!key)
        lexer.fail('CIF_UNTERMINATED_TABLE', 'The table value is not terminated.', token.start)
      if (key.type !== 'quoted')
        lexer.fail('CIF_TABLE_KEY', 'CIF2 table keys must be quoted strings.', key.start)
      const colon = lexer.next()
      if (colon?.type !== ':' || colon.start !== key.end)
        lexer.fail(
          'CIF_TABLE_COLON',
          'A table key must be immediately followed by a colon.',
          key.end
        )
      const next = lexer.next()
      if (!next) lexer.fail('CIF_TABLE_VALUE', 'A table key requires a value.', key.start)
      if (entries.some((entry) => entry.key === key.text))
        lexer.fail('CIF_TABLE_DUPLICATE', 'A table cannot contain the same key twice.', key.start)
      entries.push({ key: key.text, value: valueFrom(next, lexer) })
      const consumedEnd = lexer.lastEnd
      const following = lexer.peek()
      if (following && following.type !== '}' && consumedEnd === following.start)
        lexer.fail(
          'CIF_SEPARATOR',
          'Table entries must be separated by whitespace.',
          following.start
        )
    }
    lexer.next()
    return { kind: 'table', entries, sourceLocation }
  }
  if (token.type !== 'bare' || token.text.startsWith('_') || reserved(token.text))
    lexer.fail('CIF_VALUE', 'A data item requires a legal CIF value.', token.start)
  if (token.text === '?') return { kind: 'unknown', sourceLocation }
  if (token.text === '.') return { kind: 'not-applicable', sourceLocation }
  return { kind: 'scalar', value: token.text, quoted: false, sourceLocation }
}

function name(token: Token, prefix: number, lexer: Lexer): string {
  const result = token.text.slice(prefix)
  if (!result || (lexer.version === '1' && result.length + (prefix === 1 ? 1 : 0) > 75))
    lexer.fail(
      'CIF_NAME',
      'CIF names must be nonempty and satisfy the version-specific length limit.',
      token.start
    )
  return result
}

function entries(lexer: Lexer, inFrame: boolean): CifEntry[] {
  const result: CifEntry[] = []
  const tags = new Set<string>()
  const register = (token: Token) => {
    name(token, 1, lexer)
    const key = cifNameKey(token.text)
    if (tags.has(key))
      lexer.fail('CIF_DUPLICATE_TAG', 'A data name is repeated in the same scope.', token.start)
    tags.add(key)
    return { name: token.text, sourceLocation: lexer.location(token.start) }
  }
  while (lexer.peek()) {
    const token = lexer.peek()!
    if (token.type === 'bare' && /^(?:data_|save_)/i.test(token.text)) {
      if (inFrame && token.text.toLowerCase() !== 'save_')
        lexer.fail(
          'CIF_SAVE_FRAME',
          'Save frames cannot nest and must close before a data block.',
          token.start
        )
      break
    }
    lexer.next()
    if (token.type === 'bare' && token.text.toLowerCase() === 'loop_') {
      const loopTags: ReturnType<typeof register>[] = []
      while (lexer.peek()?.type === 'bare' && lexer.peek()!.text.startsWith('_'))
        loopTags.push(register(lexer.next()!))
      if (!loopTags.length)
        lexer.fail('CIF_LOOP_HEADER', 'A loop requires at least one data name.', token.start)
      const values: CifValue[] = []
      while (lexer.peek()) {
        const candidate = lexer.peek()!
        if (
          candidate.type === 'bare' &&
          (candidate.text.startsWith('_') || reserved(candidate.text))
        )
          break
        values.push(valueFrom(lexer.next()!, lexer))
        const consumedEnd = lexer.lastEnd
        const following = lexer.peek()
        if (following && consumedEnd === following.start)
          lexer.fail(
            'CIF_SEPARATOR',
            'Loop values must be separated by whitespace.',
            following.start
          )
      }
      if (!values.length || values.length % loopTags.length)
        lexer.fail(
          'CIF_LOOP_CARDINALITY',
          'Loop values must form one or more complete rows.',
          lexer.peek()?.start ?? token.start
        )
      const rows: CifValue[][] = []
      for (let index = 0; index < values.length; index += loopTags.length)
        rows.push(values.slice(index, index + loopTags.length))
      result.push({
        kind: 'loop',
        tags: loopTags,
        rows,
        sourceLocation: lexer.location(token.start)
      })
    } else if (token.type === 'bare' && token.text.startsWith('_')) {
      const tag = register(token)
      const next = lexer.next()
      if (!next)
        lexer.fail('CIF_MISSING_VALUE', 'A data name requires an associated value.', token.start)
      const value = valueFrom(next, lexer)
      const consumedEnd = lexer.lastEnd
      const following = lexer.peek()
      if (following && consumedEnd === following.start)
        lexer.fail('CIF_SEPARATOR', 'Data items must be separated by whitespace.', following.start)
      result.push({
        kind: 'item',
        tag,
        value,
        sourceLocation: lexer.location(token.start)
      })
    } else lexer.fail('CIF_CONSTRUCT', 'Unexpected or forbidden CIF construct.', token.start)
  }
  return result
}

export function parseCifDocument(text: string): CifDocumentResult {
  try {
    if (typeof text !== 'string')
      return {
        diagnostics: [{ severity: 'error', code: 'CIF_INPUT', message: 'CIF input must be text.' }]
      }
    const lexer = new Lexer(text)
    const blocks: CifDataBlock[] = []
    const blockNames = new Set<string>()
    while (lexer.peek()) {
      const header = lexer.next()!
      if (header.type !== 'bare' || !/^data_/i.test(header.text))
        lexer.fail('CIF_BLOCK', 'Expected a data block heading.', header.start)
      const blockName = name(header, 5, lexer)
      const key = cifNameKey(blockName)
      if (blockNames.has(key))
        lexer.fail('CIF_DUPLICATE_BLOCK', 'Data block names must be unique.', header.start)
      blockNames.add(key)
      const blockEntries = entries(lexer, false)
      const saveFrames: CifSaveFrame[] = []
      const frameNames = new Set<string>()
      while (lexer.peek()?.type === 'bare' && /^save_/i.test(lexer.peek()!.text)) {
        const frameHeader = lexer.next()!
        const frameName = name(frameHeader, 5, lexer)
        if (frameNames.has(cifNameKey(frameName)))
          lexer.fail(
            'CIF_DUPLICATE_FRAME',
            'Save frame names must be unique within a block.',
            frameHeader.start
          )
        frameNames.add(cifNameKey(frameName))
        const frameEntries = entries(lexer, true)
        const end = lexer.next()
        if (end?.type !== 'bare' || end.text.toLowerCase() !== 'save_')
          lexer.fail('CIF_SAVE_FRAME', 'The save frame is not terminated.', frameHeader.start)
        saveFrames.push({
          name: frameName,
          entries: frameEntries,
          sourceLocation: lexer.location(frameHeader.start)
        })
        // Block items can legally follow a save frame. Validate uniqueness across all segments below.
        blockEntries.push(...entries(lexer, false))
      }
      const allTags = blockEntries.flatMap((entry) =>
        entry.kind === 'item' ? [entry.tag] : entry.tags
      )
      const seen = new Set<string>()
      for (const tag of allTags) {
        if (seen.has(cifNameKey(tag.name)))
          lexer.fail(
            'CIF_DUPLICATE_TAG',
            'A data name is repeated in the same scope.',
            tag.sourceLocation?.offset ?? header.start
          )
        seen.add(cifNameKey(tag.name))
      }
      blocks.push({
        name: blockName,
        entries: blockEntries,
        saveFrames,
        sourceLocation: lexer.location(header.start)
      })
    }
    return { document: { version: lexer.version, blocks }, diagnostics: [] }
  } catch (error) {
    if (error instanceof CifFailure) return { diagnostics: [error.diagnostic] }
    throw error
  }
}

function emitString(text: string, version: CifVersion): string {
  const boundedLines = text.split('\n').every((line) => Array.from(line).length <= 1800)
  if (version === '2' && !boundedLines) return encodeText(text)
  if (
    text &&
    !reserved(text) &&
    !/^[_#$'";[\]]/.test(text) &&
    !/[ \t\r\n]/.test(text) &&
    text !== '?' &&
    text !== '.' &&
    (version === '1' || !/[[\]{}]/.test(text))
  )
    return text
  if (!/[\r\n]/.test(text)) {
    if (!text.includes("'")) return `'${text}'`
    if (!text.includes('"')) return `"${text}"`
  }
  if (version === '2') {
    if (!text.includes("'''") && !text.endsWith("'")) return `'''${text}'''`
    if (!text.includes('"""') && !text.endsWith('"')) return `"""${text}"""`
    return encodeText(text)
  }
  if (/(?:^|\n);/.test(text))
    throw new Error('CIF1 cannot express this text without a semantic text-prefix convention.')
  return `\n;${text}\n;\n`
}

/** Fold controls shield literal backslashes, including before logical newlines or EOF. */
function encodeText(text: string): string {
  const physical =
    text
      .split('\n')
      .map((line) => {
        const characters = Array.from(line)
        const chunks: string[] = []
        for (let index = 0; index < characters.length; index += 1500)
          chunks.push(characters.slice(index, index + 1500).join(''))
        return chunks.join('\\\n')
      })
      .join('\\\n\n') + '\\'
  return `\n;CIF>\\\\\n${physical
    .split('\n')
    .map((line) => 'CIF>' + line)
    .join('\n')}\n;\n`
}

function emitValue(value: CifValue, version: CifVersion): string {
  if (value.kind === 'unknown') return '?'
  if (value.kind === 'not-applicable') return '.'
  if (value.kind === 'scalar') {
    // Quoted numeric/missing-looking values must remain strings in the document layer.
    if (value.quoted && /^(?:[+-]?(?:\d|\.\d)|[?.]$)/.test(value.value)) {
      if (!value.value.includes("'") && !/[\r\n]/.test(value.value)) return `'${value.value}'`
    }
    return emitString(value.value, version)
  }
  if (version === '1') throw new Error('CIF2 compound values cannot be written as CIF1.')
  if (value.kind === 'list')
    return `[${value.values.map((entry) => emitValue(entry, version)).join('\n')}]`
  if (value.kind !== 'table') throw new Error('Unknown CIF value kind.')
  return `{${value.entries
    .map(({ key, value: entry }) => {
      const quote =
        !key.includes("'") && !/[\r\n]/.test(key)
          ? `'${key}'`
          : !key.includes('"') && !/[\r\n]/.test(key)
            ? `"${key}"`
            : !key.includes("'''") && !key.endsWith("'")
              ? `'''${key}'''`
              : !key.includes('"""') && !key.endsWith('"')
                ? `"""${key}"""`
                : undefined
      if (quote === undefined)
        throw new Error('This table key cannot be represented by a CIF2 quoted string.')
      return `${quote}:${emitValue(entry, version)}`
    })
    .join('\n')}}`
}
function emitEntries(items: readonly CifEntry[], version: CifVersion): string {
  return items
    .map((entry) => {
      if (entry.kind === 'item') {
        const value = emitValue(entry.value, version)
        const separator =
          Array.from(entry.tag.name + ' ' + value.split('\n', 1)[0]).length <= 2048 ? ' ' : '\n'
        return `${entry.tag.name}${separator}${value}\n`
      }
      return `loop_\n${entry.tags.map((tag) => tag.name).join('\n')}\n${entry.rows
        .map((row) => {
          let column = 0
          return row
            .map((value, index) => {
              const emitted = emitValue(value, version)
              const lines = emitted.split('\n')
              const separator =
                index === 0 ? '' : column + 1 + Array.from(lines[0]).length > 2048 ? '\n' : ' '
              column =
                lines.length > 1
                  ? Array.from(lines.at(-1)!).length
                  : (separator === '\n' ? 0 : column + separator.length) +
                    Array.from(emitted).length
              return separator + emitted
            })
            .join('')
        })
        .join('\n')}\n`
    })
    .join('')
}

/** Semantic document serialization; comments and original whitespace are not retained. */
export function writeCifDocument(
  document: CifDocument,
  options: { readonly version?: CifVersion } = {}
): WriteResult {
  const version = options.version ?? document.version
  if (version !== '1' && version !== '2')
    return {
      diagnostics: [
        { severity: 'error', code: 'CIF_VERSION', message: 'CIF output requires version 1 or 2.' }
      ]
    }
  try {
    let text = version === '2' ? '#\\#CIF_2.0\n' : '#\\#CIF_1.1\n'
    for (const block of document.blocks) {
      text += `data_${block.name}\n${emitEntries(block.entries, version)}`
      for (const frame of block.saveFrames)
        text += `save_${frame.name}\n${emitEntries(frame.entries, version)}save_\n`
    }
    const checked = parseCifDocument(text)
    return checked.document ? { text, diagnostics: [] } : { diagnostics: checked.diagnostics }
  } catch (error) {
    return {
      diagnostics: [
        {
          severity: 'error',
          code: 'CIF_DOCUMENT_OUTPUT',
          message: error instanceof Error ? error.message : 'The CIF document cannot be serialized.'
        }
      ]
    }
  }
}
