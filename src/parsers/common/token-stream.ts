export interface Token {
  type: 'Identifier' | 'Symbol' | 'Number' | 'WhiteSpace' | 'NewLine' | 'Unknown'
  value: string
  row: number
  column: number
}
export class TokenStream {
  private data: string[] = []
  private tokens: Token[] = []
  private index = 0
  private row = 0
  private column = 0
  constructor(data: string) {
    this.data = data.split(/\r\n|\n|\r/g)
  }
  peek(): Token | undefined {
    if (this.index === this.tokens.length) {
      this.tokenizeNext()
    }
    return this.tokens[this.index]
  }
  peek2(): Token | undefined {
    return this.peekN(2)
  }
  next(): Token | undefined {
    if (this.index === this.tokens.length) {
      this.tokenizeNext()
    }
    return this.tokens[this.index++]
  }
  nextNoWhiteSpace(): Token | undefined {
    let token = this.next()
    while (token?.type === 'WhiteSpace' || token?.type === 'NewLine') {
      token = this.next()
    }
    return token
  }
  skipLine(noTokenize = false) {
    if (noTokenize) {
      this.row++
      this.column = 0
      return
    }
    while (this.peek()?.type !== 'NewLine') {
      this.next()
    }
    this.next()
  }
  getLine(): Token[] {
    const result: Token[] = []
    while (this.peek()?.type !== 'NewLine') {
      const next = this.next()
      if (next === undefined) {
        return result
      }
      result.push(next)
    }
    this.next()
    return result
  }
  peekLineRaw(): string {
    return this.data[this.row]
  }
  skipWhiteSpace(): boolean {
    let isNewLine = false
    while (this.peek()?.type === 'WhiteSpace' || this.peek()?.type === 'NewLine') {
      isNewLine = this.next()?.type === 'NewLine' || isNewLine
    }
    return isNewLine
  }
  hasNext(): boolean {
    try {
      this.peek()
      return true
    } catch (e) {
      return false
    }
  }
  reset() {
    this.index = 0
  }
  prev(): Token | undefined {
    return this.tokens[this.index - 1]
  }
  peekN(n: number): Token | undefined {
    n = n - 1
    if (this.index + n >= this.tokens.length) {
      for (let i = 0; i < n; i++) {
        try {
          this.tokenizeNext()
        } catch (e) {
          return undefined
        }
      }
    }
    return this.tokens[this.index + n]
  }
  get streamPosition() {
    return this.index
  }
  set streamPosition(value: number) {
    if (value < 0) {
      throw Error('Invalid stream position')
    }
    if (value > this.tokens.length) {
      throw Error('Invalid stream position')
    }
    this.index = value
  }
  get rowLength() {
    return this.data.length
  }
  get rowRemain() {
    return this.data.length - this.row
  }
  get rowPosition() {
    return this.row + 1
  }
  get columnPosition() {
    return this.column + 1
  }
  private tokenizeNext() {
    const line = this.data[this.row]
    if (line === undefined) {
      return
    }
    let token = ''
    let char = line[this.column]
    if (char === undefined) {
      this.row++
      this.column = 0
      this.tokens.push({
        type: 'NewLine',
        value: '\n',
        row: this.row,
        column: this.column
      })
      return
    }
    const type = this.getType(char)
    if (type === 'Symbol') {
      token += char
      this.column++
      this.tokens.push({
        type: type,
        value: token,
        row: this.row,
        column: this.column
      })
      return
    }
    let nowType = ''
    while (char) {
      token += char
      this.column++
      char = line[this.column]
      nowType = this.getType(char)
      if (type === 'Identifier' && nowType === 'Number') {
        continue
      }
      if (nowType !== type) {
        break
      }
    }
    this.tokens.push({
      type: type,
      value: token,
      row: this.row,
      column: this.column
    })
  }
  private getType(char?: string): 'Identifier' | 'Symbol' | 'Number' | 'WhiteSpace' | 'NewLine' {
    if (char === undefined) {
      return 'NewLine'
    }
    if (char.match(/\d/)) {
      return 'Number'
    }
    if (char.match(/\s/)) {
      return 'WhiteSpace'
    }
    if (char.charCodeAt(0) < 32) {
      return 'WhiteSpace'
    }
    if (char.match(/[\[\]\{\};:'",.\/?<>+=\-\(\)*&\\|^%$#@!~`]/)) {
      return 'Symbol'
    }
    return 'Identifier'
  }
}
