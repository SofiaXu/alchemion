import { createAdapter as three } from './three'
import { createAdapter as babylon } from './babylon'
import type { AdapterFactory, Candidate } from './contracts'

export const candidateFactories: Partial<Record<Candidate, AdapterFactory>> = { three, babylon }
export { candidates } from './candidates'
