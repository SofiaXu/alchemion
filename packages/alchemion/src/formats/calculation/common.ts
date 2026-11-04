import type { CalculationResult } from '../../core/calculation'
import type { Diagnostic, StructureSnapshot, Vec3 } from '../../core/types'

export interface CalculationParseOptions {
  readonly format:
    | 'chg'
    | 'chgcar'
    | 'locpot'
    | 'cube'
    | 'contcar'
    | 'xdatcar'
    | 'vasprun'
    | 'outcar'
    | 'alchemion-result'
  readonly name?: string
  /** Explicit quantity and units for Cube, whose header provides neither reliably. */
  readonly quantity?: string
  readonly unit?: string
  readonly reference?: StructureSnapshot
  readonly sha256?: string
  readonly path?: readonly { readonly label?: string; readonly breakBefore?: boolean }[]
}

export type ParsedCalculation = Pick<CalculationResult, 'frames' | 'data'> &
  Partial<Pick<CalculationResult, 'program' | 'initialFrameId' | 'termination' | 'convergence'>> & {
    readonly diagnostics?: readonly Diagnostic[]
  }

export class CalculationParseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly line: number
  ) {
    super(message)
  }
}

export const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?$/
export function vaspNumber(text: string): number {
  return numeric.test(text) ? Number(text.replace(/[dD]/, 'e')) : Number.NaN
}

export function vector(tokens: readonly string[]): Vec3 | undefined {
  if (tokens.length !== 3) return
  const values = tokens.map(vaspNumber)
  if (values.every(Number.isFinite)) return [values[0], values[1], values[2]]
}

export const words = (line: string) => line.match(/\S+/g) ?? []

/** Read linewise without materializing a second copy of an entire volumetric file. */
export class ResultLines {
  private readonly newline = /\r\n?|\n/g
  private offset: number
  line = 0

  constructor(private readonly text: string) {
    this.offset = text.charCodeAt(0) === 0xfeff ? 1 : 0
  }

  next(): string | undefined {
    if (this.offset > this.text.length) return undefined
    this.newline.lastIndex = this.offset
    const newline = this.newline.exec(this.text)
    const result = this.text.slice(this.offset, newline?.index)
    this.offset = newline ? this.newline.lastIndex : this.text.length + 1
    this.line++
    return result
  }

  nonempty(): string | undefined {
    let line: string | undefined
    while ((line = this.next()) !== undefined) if (line.trim()) return line
    return undefined
  }

  fail(code: string, message: string): never {
    throw new CalculationParseError(code, message, Math.max(1, this.line))
  }
}
