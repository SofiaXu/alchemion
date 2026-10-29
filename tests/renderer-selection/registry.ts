import { createAdapter as three } from './three'
import type { AdapterFactory, Candidate } from './contracts'

export const candidateFactories: Partial<Record<Candidate, AdapterFactory>> = { three }
export { candidates } from './candidates'
