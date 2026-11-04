import { deriveStructure } from '../../core/bonds'
import { computeBrillouinZone } from '../../core/brillouin-zone'
import { analyzeCoordination } from '../../core/coordination'
import { reciprocalLattice } from '../../core/reciprocal'
import { failure } from '../../core/result'
import type { ScientificResult } from '../../core/types'
import type { ComputationResult } from './types'
import type { TransportTask } from './protocol'

/** The only algorithm dispatcher used by both execution modes. */
export function runComputationTask(
  task: TransportTask
): ScientificResult<ComputationResult['value']> {
  switch (task?.kind) {
    case 'coordination':
      return analyzeCoordination(task.snapshot, task.options)
    case 'derive':
      return deriveStructure(task.snapshot, task.options)
    case 'reciprocal':
      return reciprocalLattice(task.cell)
    case 'brillouin-zone':
      return computeBrillouinZone(task.cell, task.options)
    default:
      return failure('COMPUTATION_TASK', 'Unknown computation task category.')
  }
}
