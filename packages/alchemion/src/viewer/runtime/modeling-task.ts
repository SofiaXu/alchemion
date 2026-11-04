import { finishConstruction } from '../../core/construction'
import type { ConstructionResult } from '../../core/construction'
import { createCrystal } from '../../core/crystal-builder'
import { buildDefects, findInterstitials } from '../../core/defects'
import { createInterface, findInterfaceMatches, placeAdsorbate } from '../../core/interface-builder'
import { addHydrogens, attachFragment } from '../../core/molecular'
import { buildNanotube, cropCluster } from '../../core/nano'
import { packMolecules } from '../../core/packing'
import { buildPolymer } from '../../core/polymer'
import { failure } from '../../core/result'
import { createSupercell } from '../../core/supercell'
import { createSlab, listSlabTerminations } from '../../core/surface'
import type {
  Matrix3,
  MolecularStructureSnapshot,
  PeriodicStructureSnapshot,
  ScientificResult,
  StructureSnapshot,
  Vec3
} from '../../core/types'
import type { CrystalSymmetryOptions } from './spglib/crystal-symmetry'

export type ModelingTask =
  | { readonly kind: 'crystal'; readonly options: Parameters<typeof createCrystal>[0] }
  | {
      readonly kind: 'symmetry'
      readonly source: PeriodicStructureSnapshot
      readonly options?: CrystalSymmetryOptions
    }
  | {
      readonly kind: 'supercell'
      readonly source: StructureSnapshot
      readonly matrix: Matrix3 | Vec3
    }
  | {
      readonly kind: 'slab'
      readonly source: StructureSnapshot
      readonly options: Parameters<typeof createSlab>[1]
    }
  | { readonly kind: 'terminations'; readonly source: StructureSnapshot; readonly hkl: Vec3 }
  | {
      readonly kind: 'interface'
      readonly source: PeriodicStructureSnapshot
      readonly other: PeriodicStructureSnapshot
      readonly search: NonNullable<Parameters<typeof findInterfaceMatches>[2]>
      readonly candidate?: number
      readonly options: Omit<Parameters<typeof createInterface>[2], 'match'>
    }
  | {
      readonly kind: 'adsorbate'
      readonly source: PeriodicStructureSnapshot
      readonly other: MolecularStructureSnapshot
      readonly options: Parameters<typeof placeAdsorbate>[2]
    }
  | {
      readonly kind: 'interstitials'
      readonly source: StructureSnapshot
      readonly options?: Parameters<typeof findInterstitials>[1]
    }
  | {
      readonly kind: 'defects'
      readonly source: StructureSnapshot
      readonly options: Parameters<typeof buildDefects>[1]
    }
  | {
      readonly kind: 'fragment'
      readonly source: MolecularStructureSnapshot
      readonly fragment: Parameters<typeof attachFragment>[1]
      readonly options: Parameters<typeof attachFragment>[2]
    }
  | {
      readonly kind: 'hydrogens'
      readonly source: MolecularStructureSnapshot
      readonly atomIds?: readonly string[]
    }
  | { readonly kind: 'polymer'; readonly options: Parameters<typeof buildPolymer>[0] }
  | { readonly kind: 'packing'; readonly options: Parameters<typeof packMolecules>[0] }
  | { readonly kind: 'nanotube'; readonly options: Parameters<typeof buildNanotube>[0] }
  | {
      readonly kind: 'cluster'
      readonly source: StructureSnapshot
      readonly options: Parameters<typeof cropCluster>[1]
    }

export async function runModelingTask(
  task: ModelingTask
): Promise<ScientificResult<ConstructionResult>> {
  switch (task?.kind) {
    case 'crystal':
      return createCrystal(task.options)
    case 'symmetry': {
      const { analyzeCrystalSymmetry } = await import('./spglib/crystal-symmetry')
      return analyzeCrystalSymmetry(task.source, task.options)
    }
    case 'supercell': {
      const result = createSupercell(task.source, task.matrix)
      if (!result.ok) return result
      const { snapshot, atomMapping, bondMapping } = result.value
      return finishConstruction(
        snapshot,
        atomMapping.map(({ atomId, source, equivalentSources }) => ({
          id: atomId,
          origins: [source, ...equivalentSources].map((endpoint) => ({
            input: 'source',
            sourceId: endpoint.sourceAtomId,
            endpoint
          }))
        })),
        bondMapping.map(({ bondId, sourceBondId }) => ({
          id: bondId,
          origins: [{ input: 'source', sourceId: sourceBondId }]
        })),
        { matrix: task.matrix },
        result.diagnostics
      )
    }
    case 'slab':
      return createSlab(task.source, task.options)
    case 'terminations': {
      const result = listSlabTerminations(task.source, task.hkl)
      return result.ok
        ? finishConstruction(
            task.source,
            [],
            [],
            { terminations: result.value.map((entry) => ({ ...entry })) },
            result.diagnostics
          )
        : result
    }
    case 'interface': {
      const matches = findInterfaceMatches(task.source, task.other, task.search)
      if (!matches.ok) return matches
      const available = matches.value.map((match) => ({ ...match }))
      if (task.candidate === undefined)
        return finishConstruction(task.source, [], [], { matches: available }, matches.diagnostics)
      const match = matches.value[task.candidate]
      if (!match)
        return failure('INTERFACE_CANDIDATE', 'Choose one of the interface matching candidates.')
      return createInterface(task.source, task.other, { ...task.options, match })
    }
    case 'adsorbate':
      return placeAdsorbate(task.source, task.other, task.options)
    case 'interstitials': {
      const result = findInterstitials(task.source, task.options)
      return result.ok
        ? finishConstruction(
            task.source,
            [],
            [],
            { sites: result.value.map((entry) => ({ ...entry })) },
            result.diagnostics
          )
        : result
    }
    case 'defects':
      return buildDefects(task.source, task.options)
    case 'fragment':
      return attachFragment(task.source, task.fragment, task.options)
    case 'hydrogens':
      return addHydrogens(task.source, task.atomIds)
    case 'polymer':
      return buildPolymer(task.options)
    case 'packing':
      return packMolecules(task.options)
    case 'nanotube':
      return buildNanotube(task.options)
    case 'cluster':
      return cropCluster(task.source, task.options)
    default:
      return failure('MODELING_TASK', 'Unknown structure construction task.')
  }
}
