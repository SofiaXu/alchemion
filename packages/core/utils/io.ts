import { Structure } from '../structure'

export interface IWriter {
  write(structure: Structure): string
}

export interface IParser {
  parse(data: string): Structure
}
