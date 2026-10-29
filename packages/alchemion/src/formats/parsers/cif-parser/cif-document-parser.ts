import { TokenStream } from '../common/token-stream'

export type CifDataValue =
  | string
  | number
  | false // ?
  | null // .
  | Array<CifDataValue>
  | { [key: string]: CifDataValue }

export interface CifDataBlock {
  [key: string]: CifDataValue
  saveFrames: CifDataBlock[]
  blockName: string
}

export interface CifDocument {
  version: '1.1' | '2.0'
  data: CifDataBlock[]
}

export class CifDocumentParser {
  private isCif1Only: boolean
  private overwriteMode: 'replace' | 'merge' | 'ignore'
  constructor(
    options: Partial<{
      isCif1Only: boolean
      overwriteMode: 'replace' | 'merge' | 'ignore'
    }> = {}
  ) {
    this.isCif1Only = options?.isCif1Only ?? false
    this.overwriteMode = options?.overwriteMode ?? 'replace'
  }
  parse(tokenStream: TokenStream): CifDocument {
    const document: CifDocument = {
      version: this.parseVersion(tokenStream),
      data: []
    }
    if (this.isCif1Only && document.version === '2.0') {
      throw Error('CIF 2.0 is not supported yet.')
    }
    this.skipComments(tokenStream)
    while (true) {
      const token = tokenStream.peek()
      if (!token) {
        break
      }
      if (token.type === 'Identifier') {
        if (/^data_/i.test(token.value)) {
          const dataBlock = this.parseDataBlock(tokenStream, document.version)
          document.data.push(dataBlock)
        } else {
          throw Error('Invalid CIF format.')
        }
      } else if (token.type === 'Symbol') {
        if (token.value === '#') {
          this.skipComments(tokenStream)
        } else {
          throw Error('Invalid CIF format.')
        }
      } else if (token.type === 'WhiteSpace' || token.type === 'NewLine') {
        tokenStream.next()
      } else {
        throw Error('Invalid CIF format.')
      }
    }
    return document
  }
  private parseDataBlock(tokenStream: TokenStream, version: '1.1' | '2.0'): CifDataBlock {
    let token = tokenStream.next()
    if (!token) {
      throw Error(
        `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
      )
    }
    let name = token.value.substring(5)
    if (!this.checkTagName(name, version)) {
      throw Error(
        `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
      )
    }
    while (true) {
      token = tokenStream.peek()
      if (!token) {
        throw Error(
          `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
        )
      }
      if (token.type === 'NewLine' || token.type === 'WhiteSpace') {
        break
      } else {
        if (!this.checkTagName(token.value, version)) {
          throw Error(
            `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
          )
        }
        name += token.value
        tokenStream.next()
      }
    }
    const block: CifDataBlock = {
      saveFrames: [],
      blockName: name
    }
    this.skipComments(tokenStream)
    while (true) {
      tokenStream.skipWhiteSpace()
      token = tokenStream.peek()

      if (!token) {
        break
      }
      if (token.type === 'Identifier') {
        if (/^loop_$/i.test(token.value)) {
          this.parseLoopBlock(tokenStream, block, version)
        } else if (/^save_/i.test(token.value)) {
          const saveFrames = this.parseSaveFrame(tokenStream, version)
          block.saveFrames.push(saveFrames)
        } else if (/^data_/i.test(token.value)) {
          // end of block
          break
        } else if (/^stop_/i.test(token.value)) {
          // stop only use in loop block
          throw Error('Invalid CIF format.')
        } else if (/^global_/i.test(token.value)) {
          // ignore global block
          tokenStream.next()
        } else {
          const tag = this.parseDataItemTag(tokenStream, version)
          const isNewLine = tokenStream.skipWhiteSpace()
          token = tokenStream.peek()
          const value = this.parseDataItemValue(tokenStream, version, isNewLine)
          block[tag] = value
        }
      } else if (token.type === 'Symbol') {
        if (token.value === '#') {
          this.skipComments(tokenStream)
        } else {
          throw Error(
            `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
          )
        }
      } else {
        throw Error(
          `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
        )
      }
    }
    return block
  }
  private parseLoopBlock(tokenStream: TokenStream, block: CifDataBlock, version: '1.1' | '2.0') {
    let token = tokenStream.next()
    if (!token) {
      throw Error(
        `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
      )
    }
    const tags: (string | null)[] = []
    while (true) {
      tokenStream.skipWhiteSpace()
      token = tokenStream.peek()
      if (!token) {
        throw Error(
          `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
        )
      }
      if (token.value.startsWith('_')) {
        const tag = this.parseDataItemTag(tokenStream, version)
        if (block[tag]) {
          switch (this.overwriteMode) {
            case 'replace':
              block[tag] = []
              tags.push(tag)
              break
            case 'ignore':
              tags.push(null)
              break
            case 'merge': {
              if (!Array.isArray(block[tag])) {
                const temp = block[tag]
                block[tag] = [temp]
                break
              }
              tags.push(tag)
            }
          }
        } else {
          block[tag] = []
          tags.push(tag)
        }
        tokenStream.next()
      } else {
        break
      }
    }
    let isNewLine = false
    let colIndex = 0
    let tag: string | null
    while (true) {
      token = tokenStream.peek()
      if (!token) {
        break
      }
      if (token.value.startsWith('_')) {
        break
      }
      if (/(^loop_$)|(^data_)|(^save_)|(^stop_)|(^global_)/i.test(token.value)) {
        break
      }
      if (token.type === 'Symbol' && token.value === '#') {
        this.skipComments(tokenStream)
        isNewLine = true
        continue
      }
      const value = this.parseDataItemValue(tokenStream, version, isNewLine)

      tag = tags[colIndex]
      if (tag) {
        ;(block[tag] as Array<CifDataValue>).push(value)
      }
      colIndex++
      if (colIndex >= tags.length) {
        colIndex = 0
      }
      isNewLine = tokenStream.skipWhiteSpace()
    }
  }
  private parseSaveFrame(tokenStream: TokenStream, version: '1.1' | '2.0'): CifDataBlock {
    let token = tokenStream.next()
    if (!token) {
      throw Error(
        `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
      )
    }
    let name = token.value.substring(5)
    if (!this.checkTagName(name, version)) {
      throw Error(
        `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
      )
    }
    while (true) {
      token = tokenStream.peek()
      if (!token) {
        throw Error(
          `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
        )
      }
      if (token.type === 'NewLine' || token.type === 'WhiteSpace') {
        break
      } else {
        if (!this.checkTagName(token.value, version)) {
          throw Error(
            `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
          )
        }
        name += token.value
        tokenStream.next()
      }
    }
    const saveFrame: CifDataBlock = {
      saveFrames: [],
      blockName: name
    }
    this.skipComments(tokenStream)
    while (true) {
      tokenStream.skipWhiteSpace()
      token = tokenStream.peek()
      if (!token) {
        break
      }
      if (token.type === 'Identifier') {
        if (/^save_/i.test(token.value)) {
          if (token.value.length === 5) {
            tokenStream.next()
            break
          }
          const saveFrames = this.parseSaveFrame(tokenStream, version)
          saveFrame.saveFrames.push(saveFrames)
        } else if (/^loop_$/i.test(token.value)) {
          this.parseLoopBlock(tokenStream, saveFrame, version)
        } else {
          const tag = this.parseDataItemTag(tokenStream, version)
          const isNewLine = tokenStream.skipWhiteSpace()
          const value = this.parseDataItemValue(tokenStream, version, isNewLine)
          saveFrame[tag] = value
        }
      } else if (token.type === 'Symbol') {
        if (token.value === '#') {
          this.skipComments(tokenStream)
        } else {
          throw Error('Invalid CIF format.')
        }
      } else {
        throw Error('Invalid CIF format.')
      }
    }
    return saveFrame
  }
  private parseDataItemValue(
    tokenStream: TokenStream,
    version: '1.1' | '2.0',
    isNewLine: boolean
  ): CifDataValue {
    let token = tokenStream.peek()
    if (!token) {
      throw Error(
        `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
      )
    }
    if (token?.type === 'Symbol' && token.value === '#') {
      this.skipComments(tokenStream)
      isNewLine = true
      token = tokenStream.peek()
    }
    if (!token) {
      throw Error(
        `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
      )
    }
    if (token.type === 'Symbol') {
      if (token.value === '"') {
        return this.parseQuotedString(tokenStream, version, '"')
      }
      if (token.value === "'") {
        return this.parseQuotedString(tokenStream, version, "'")
      }
      if (token.value === '[' && !this.isCif1Only && version === '2.0') {
        return this.parseArray(tokenStream, version)
      }
      if (token.value === '{' && !this.isCif1Only && version === '2.0') {
        return this.parseDictionary(tokenStream, version)
      }
      if (isNewLine && token.value === ';') {
        return this.parseTextField(tokenStream, version)
      }
    }
    return this.parseUnquotedString(tokenStream, version, isNewLine)
  }
  private parseArray(tokenStream: TokenStream, version: '1.1' | '2.0'): CifDataValue {
    const values: Array<CifDataValue> = []
    let token = tokenStream.next()
    let isNewLine = tokenStream.skipWhiteSpace()
    while (true) {
      token = tokenStream.peek()
      if (!token) {
        throw Error(
          `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
        )
      }
      if (token.type === 'Symbol' && token.value === ']') {
        tokenStream.next()
        break
      }
      if (token.type === 'Symbol' && token.value === '#') {
        this.skipComments(tokenStream)
        // cif comment always ends with a new line
        isNewLine = true
        continue
      }
      if (token?.type === 'WhiteSpace' || token?.type === 'NewLine') {
        isNewLine = tokenStream.skipWhiteSpace()
        continue
      }
      const value = this.parseDataItemValue(tokenStream, version, isNewLine)
      values.push(value)
    }
    return values
  }
  private parseDictionary(tokenStream: TokenStream, version: '1.1' | '2.0'): CifDataValue {
    const dict: { [key: string]: CifDataValue } = {}
    let token = tokenStream.next()
    let isNewLine = tokenStream.skipWhiteSpace()
    while (true) {
      token = tokenStream.peek()
      if (!token) {
        throw Error(
          `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
        )
      }
      if (token.type === 'Symbol' && token.value === '}') {
        tokenStream.next()
        break
      }
      if (token.type === 'Symbol' && token.value === '#') {
        this.skipComments(tokenStream)
        // cif comment always ends with a new line
        isNewLine = true
        continue
      }
      if (token?.type === 'WhiteSpace' || token?.type === 'NewLine') {
        isNewLine = tokenStream.skipWhiteSpace()
        continue
      }
      if (token.value === "'" || token.value === '"') {
        const key = this.parseQuotedString(tokenStream, version, token.value)
        token = tokenStream.nextNoWhiteSpace()
        if (!token) {
          throw Error(
            `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
          )
        }
        if (token.value !== ':') {
          throw Error('Invalid CIF format.')
        }
        isNewLine = tokenStream.skipWhiteSpace()
        const value = this.parseDataItemValue(tokenStream, version, isNewLine)
        dict[key] = value
      } else {
        throw Error('Invalid CIF format.')
      }
    }
    return dict
  }
  private parseTextField(tokenStream: TokenStream, version: '1.1' | '2.0'): CifDataValue {
    const token = tokenStream.peek()
    let line = tokenStream.peekLineRaw()
    if (line.substring(0, 1) !== ';') {
      throw Error(
        `Invalid CIF format.\nvalue: "${line}"\ncol: ${(token?.column ?? 0) + 1}\nrow: ${(token?.row ?? 0) + 1}`
      )
    }
    const data = line.substring(1)
    if (data !== '') {
      if ((version === '1.1' || this.isCif1Only) && !this.isAllVer1AnyPrintChar(data)) {
        throw Error(`Invalid CIF format.\nvalue: "${line}"\nline: ${tokenStream.rowPosition}`)
      }
      if (!this.isAllVer2AllChar(line)) {
        throw Error(`Invalid CIF format.\nvalue: "${line}"\nline: ${tokenStream.rowPosition}`)
      }
    }
    let value = data + '\n'
    tokenStream.skipLine(true)
    let textLead
    while (true) {
      line = tokenStream.peekLineRaw()
      if (!line && tokenStream.rowRemain <= 0) {
        throw Error(`Invalid CIF format.\nvalue: "${line}"\nline: ${tokenStream.rowPosition}`)
      }
      if (line !== '') {
        textLead = line.substring(0, 1)
        if (textLead === ';') {
          // remove last \n
          value = value.substring(0, value.length - 1)
          tokenStream.next()
          tokenStream.next()
          break
        }
        if ((this.isCif1Only || version === '1.1') && !this.isAllVer1TextLeadChar(textLead)) {
          throw Error(`Invalid CIF format.\nvalue: "${line}"\nline: ${tokenStream.rowPosition}`)
        }
        if ((version === '1.1' || this.isCif1Only) && !this.isAllVer1AnyPrintChar(line)) {
          throw Error(`Invalid CIF format.\nvalue: "${line}"\nline: ${tokenStream.rowPosition}`)
        }
        if (!this.isAllVer2AllChar(line)) {
          throw Error(`Invalid CIF format.\nvalue: "${line}"\nline: ${tokenStream.rowPosition}`)
        }
      }
      value += line + '\n'
      tokenStream.skipLine(true)
    }
    return value
  }
  private parseUnquotedString(
    tokenStream: TokenStream,
    version: '1.1' | '2.0',
    isNewLine: boolean
  ): CifDataValue {
    let value = ''
    let token = tokenStream.next()
    if (!token) {
      throw Error(
        `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
      )
    }
    const textLead = token.value.substring(0, 1)
    if (isNewLine) {
      if (this.isCif1Only || version === '1.1') {
        if (!this.isAllVer1OrdinaryChar(textLead) && textLead !== ';') {
          throw Error(
            `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
          )
        }
      }
      if (!this.isAllVer2OrdinaryChar(textLead) && textLead !== ';') {
        throw Error(
          `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
        )
      }
    } else {
      if (this.isCif1Only || version === '1.1') {
        if (!this.isAllVer1OrdinaryChar(textLead) && textLead !== ';') {
          throw Error(
            `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
          )
        }
      }
      if (!this.isAllVer2OrdinaryChar(textLead) && textLead !== ';') {
        throw Error(
          `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
        )
      }
    }
    value += token.value
    while (true) {
      token = tokenStream.peek()
      if (!token) {
        break
      }
      if (token.type === 'WhiteSpace' || token.type === 'NewLine') {
        break
      }
      if (this.isCif1Only || version === '1.1') {
        if (!this.isAllVer1NonBlankChar(token.value)) {
          break
        }
      } else if (!this.isAllVer2RestrictChar(token.value)) {
        break
      }
      value += token.value
      tokenStream.next()
    }
    if (/^[+-]?\d+$/.test(value)) {
      return parseInt(value)
    } else if (/^[+-]?\d+(\.\d+|\.)?([eE]|[eE][+-]?\d+)?$/.test(value)) {
      return parseFloat(value)
    }
    if (value === '.') {
      return null
    }
    if (value === '?') {
      return false
    }
    return value
  }
  private parseQuotedString(
    tokenStream: TokenStream,
    version: '1.1' | '2.0',
    quote: '"' | "'"
  ): string {
    let value = ''
    let token = tokenStream.peek()
    let token2 = tokenStream.peek2()
    let token3 = tokenStream.peekN(3)
    let isTripleQuote = false
    if (
      token2?.value === quote &&
      token3?.value === quote &&
      !this.isCif1Only &&
      version === '2.0'
    ) {
      isTripleQuote = true
      tokenStream.next()
      tokenStream.next()
      tokenStream.next()
    } else {
      tokenStream.next()
    }
    while (true) {
      token = tokenStream.peek()
      if (!token) {
        throw Error(
          `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
        )
      }
      if (token.type === 'Symbol' && token.value === quote) {
        if (isTripleQuote) {
          token2 = tokenStream.peek2()
          token3 = tokenStream.peekN(3)
          if (token2?.value === quote && token3?.value === quote) {
            tokenStream.next()
            tokenStream.next()
            tokenStream.next()
            break
          }
        } else {
          token2 = tokenStream.peek2()
          if (
            (version === '1.1' || this.isCif1Only) &&
            (token2?.type === 'WhiteSpace' || token2?.type === 'NewLine')
          ) {
            tokenStream.next()
            break
          } else if (
            token2?.type === 'WhiteSpace' ||
            token2?.type === 'NewLine' ||
            token2?.value === '#' ||
            token2?.value === ':' ||
            token2?.value === '}' ||
            token2?.value === ']'
          ) {
            tokenStream.next()
            break
          }
        }
      }
      if (!isTripleQuote && token.type === 'NewLine') {
        throw Error(
          `Invalid CIF format.\nvalue: "${value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
        )
      }
      value += token.value
      tokenStream.next()
    }
    if (value === '') {
      return ''
    }
    if (this.isCif1Only || version === '1.1') {
      if (!this.isAllVer1AnyPrintChar(value)) {
        throw Error(
          `Invalid CIF format.\nvalue: "${value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
        )
      }
    }
    if (!this.isAllVer2AllChar(value)) {
      throw Error(
        `Invalid CIF format.\nvalue: "${value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
      )
    }
    return value
  }
  private parseDataItemTag(tokenStream: TokenStream, version: '1.1' | '2.0'): string {
    const token = tokenStream.peek()
    if (!token) {
      throw Error(
        `Invalid CIF format.\nvalue: "${tokenStream.prev()?.value}"\ncol: ${tokenStream.prev()?.column ?? 0 + 1}\nrow: ${tokenStream.prev()?.row ?? 0 + 1}`
      )
    }
    if (token.type !== 'Identifier') {
      throw Error(
        `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
      )
    }
    if (!token.value.startsWith('_')) {
      throw Error(
        `Invalid CIF format.\nvalue: "${token.value}"\ncol: ${token.column + 1}\nrow: ${token.row + 1}`
      )
    }
    let key = token.value.substring(1)
    tokenStream.next()
    while (true) {
      const peek = tokenStream.peek()
      if (!peek) {
        throw Error('Invalid CIF format.')
      }
      if (peek.type !== 'WhiteSpace' && peek.type !== 'NewLine') {
        key += peek.value
        tokenStream.next()
      } else {
        break
      }
    }
    if (!this.checkTagName(key, version)) {
      throw Error('Invalid CIF format.')
    }
    return key
  }
  private skipComments(tokenStream: TokenStream) {
    while (true) {
      const token = tokenStream.peek()
      if (!token) {
        break
      }
      if (token.value === '#') {
        tokenStream.next()
        tokenStream.skipLine(true)
        tokenStream.skipWhiteSpace()
      } else {
        break
      }
    }
  }
  private parseVersion(tokenStream: TokenStream): '1.1' | '2.0' {
    const peek = tokenStream.peek()
    if (peek?.type === 'Symbol' && peek?.value === '#') {
      const line = tokenStream.peekLineRaw()
      if (line.startsWith('#\\#CIF_2.0')) {
        tokenStream.skipLine()
        tokenStream.skipWhiteSpace()
        return '2.0'
      }
      if (line.startsWith('#\\#CIF_1.1')) {
        tokenStream.skipLine()
        tokenStream.skipWhiteSpace()
        return '1.1'
      }
    }
    return this.isCif1Only ? '1.1' : '2.0'
  }
  private checkTagName(name: string, version: '1.1' | '2.0'): boolean {
    if (version === '1.1' || this.isCif1Only) {
      return this.isAllVer1NonBlankChar(name)
    }
    return this.isAllVer2NonBlankChar(name)
  }
  private isAllVer1OrdinaryChar(chars: string): boolean {
    return /^[!%&()*+,\-./0123456789:<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ^abcdefghijklmnopqrstuvwxyz{|}~]+$/.test(
      chars
    )
  }
  private isAllVer1NonBlankChar(chars: string): boolean {
    return /^[!%&()*+,\-./0123456789:<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ\\^`abcdefghijklmnopqrstuvwxyz{|}~"#$'_;[\]]+$/.test(
      chars
    )
  }
  private isAllVer1TextLeadChar(chars: string): boolean {
    return /^[!%&()*+,\-./0123456789:<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ\\^`abcdefghijklmnopqrstuvwxyz{|}~"#$'_[\]\t ]+$/.test(
      chars
    )
  }
  private isAllVer1AnyPrintChar(chars: string): boolean {
    return /^[!%&()*+,\-./0123456789:<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ\\^`abcdefghijklmnopqrstuvwxyz{|}~"#$'_;[\]\t ]+$/.test(
      chars
    )
  }
  private isAllVer2AllChar(chars: string): boolean {
    // todo: regex is not support \u{10000}-\u{10FFFF}
    // CIF2 intentionally permits TAB, LF and CR.
    // eslint-disable-next-line no-control-regex
    return /^[\u0009\u000A\u000D\u0020-\u007E\u00A0-\uD7FF\uE000-\uFDCF\uFDF0-\uFFFD]+$/.test(chars)
  }
  private isAllVer2RestrictChar(chars: string): boolean {
    return /^[\u0021-\u005A\u005C\u005E-\u007A\u007C\u007E\u00A0-\uD7FF\uE000-\uFDCF\uFDF0-\uFFFD]+$/.test(
      chars
    )
  }
  private isAllVer2NonBlankChar(chars: string): boolean {
    return /^[\u0021-\u007E\u00A0-\uD7FF\uE000-\uFDCF\uFDF0-\uFFFD]+$/.test(chars)
  }
  private isAllVer2OrdinaryChar(chars: string): boolean {
    return /^[!%&(-9<-Z^`a-~\u00A0-\uD7FF\uE000-\uFDCF\uFDF0-\uFFFD]+$/.test(chars)
  }
}
