import { IStructure } from '../structure'

export interface IWriter {
  write(structure: IStructure): string
}

export interface IParser {
  parse(data: string): IStructure
}
