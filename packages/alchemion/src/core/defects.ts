import { finishConstruction, type ConstructionResult } from './construction'
import {
  constructionRandom,
  inverseCell,
  MAX_CONSTRUCTION_ATOMS,
  MAX_CONSTRUCTION_CHECKS,
  periodicBuckets,
  periodicDistance,
  periodicMapping,
  periodicSource,
  shuffled,
  validConstructionSeed,
  wrapPosition
} from './construction-periodic'
import { getElement } from './data'
import { compareStrings } from './derivation'
import { isFiniteVector, isIntegerVector, multiplyMatrixVector, norm, subtract } from './math'
import { failure, success } from './result'
import type {
  Diagnostic,
  JsonValue,
  PeriodicAtom,
  PeriodicStructureSnapshot,
  ScientificResult,
  StructureSnapshot,
  Vec3
} from './types'

export interface InterstitialOptions {
  readonly grid?: number
  readonly minimumDistance?: number
  readonly limit?: number
}

export interface InterstitialCandidate {
  readonly fractional: Vec3
  readonly nearestDistance: number
}

export type DefectOptions =
  | { readonly kind: 'interstitial'; readonly element: string; readonly fractional: Vec3 }
  | {
      readonly kind: 'substitution'
      readonly element: string
      readonly hostElement?: string
      readonly atomIds?: readonly string[]
      readonly amount: { readonly kind: 'count' | 'fraction'; readonly value: number }
      readonly seed: number
    }
  | { readonly kind: 'disorder'; readonly seed: number }

const SITE_TOLERANCE = 1e-7
const OCCUPANCY_TOLERANCE = 1e-8

/** Rank a deterministic fractional grid by exact periodic clearance in Å. */
export function findInterstitials(
  input: StructureSnapshot,
  options: InterstitialOptions = {}
): ScientificResult<readonly InterstitialCandidate[]> {
  if (input?.kind !== 'periodic' || !options)
    return failure('INTERSTITIAL_INPUT', 'Interstitial candidates require a periodic structure.')
  const { grid = 8, minimumDistance = 0.1, limit = 32 } = options
  if (
    !Number.isInteger(grid) ||
    grid < 2 ||
    grid > 32 ||
    !Number.isFinite(minimumDistance) ||
    minimumDistance < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1024
  )
    return failure(
      'INTERSTITIAL_OPTIONS',
      'Use a grid of 2–32, a nonnegative distance and a limit of 1–1024.'
    )
  const source = periodicSource(input)
  if (!source.ok) return source
  const { cell, atoms } = source.value.snapshot
  const inverse = inverseCell(cell)
  const present = atoms.filter(
    ({ occupancy }) => occupancy?.kind !== 'known' || occupancy.value > 0
  )
  if (!inverse || present.length === 0)
    return failure(
      'INTERSTITIAL_INPUT',
      'Clearance requires a valid cell with at least one occupied site.'
    )
  const budget = { remaining: MAX_CONSTRUCTION_CHECKS }
  const candidates: InterstitialCandidate[] = []
  for (let x = 0; x < grid; x++)
    for (let y = 0; y < grid; y++)
      for (let z = 0; z < grid; z++) {
        const fractional: Vec3 = [x / grid, y / grid, z / grid]
        const initial = subtract(fractional, present[0].fractional)
        const rounded: Vec3 = [
          Math.round(initial[0]),
          Math.round(initial[1]),
          Math.round(initial[2])
        ]
        let nearestDistance = norm(multiplyMatrixVector(cell.basis, subtract(initial, rounded)))
        for (const atom of present) {
          if (--budget.remaining < 0)
            return failure(
              'INTERSTITIAL_BUDGET',
              'Interstitial clearance search exceeded its work budget.'
            )
          const candidate = periodicDistance(
            subtract(fractional, atom.fractional),
            cell.basis,
            inverse,
            nearestDistance,
            budget
          )
          if (candidate === undefined)
            return failure(
              'INTERSTITIAL_BUDGET',
              'Interstitial clearance search exceeded its work budget.'
            )
          nearestDistance = Math.min(nearestDistance, candidate)
          if (nearestDistance < minimumDistance) break
        }
        if (nearestDistance >= minimumDistance) candidates.push({ fractional, nearestDistance })
      }
  return success(
    candidates.sort((a, b) => b.nearestDistance - a.nearestDistance).slice(0, limit),
    source.diagnostics
  )
}

interface DisorderSite {
  readonly atoms: PeriodicAtom[]
}

function realizeDisorder(
  snapshot: PeriodicStructureSnapshot,
  random: () => number
): ScientificResult<{ atoms: PeriodicAtom[]; vacancyCount: number }> {
  const { cell, atoms } = snapshot
  const inverse = inverseCell(cell)
  if (!inverse) return failure('DISORDER_CELL', 'Disorder requires a valid periodic cell.')
  const buckets = periodicBuckets<DisorderSite>(cell, inverse, SITE_TOLERANCE)
  const sites: DisorderSite[] = []
  const budget = { remaining: MAX_CONSTRUCTION_CHECKS }
  for (const atom of atoms) {
    let match: DisorderSite | undefined
    if (atom.occupancy?.kind !== 'known')
      return failure(
        'DISORDER_OCCUPANCY_UNKNOWN',
        'Every alternative site requires a known occupancy.',
        { atomId: atom.id }
      )
    for (const candidate of buckets.near(atom.fractional)) {
      const distance = buckets.distance(atom.fractional, candidate.point, budget)
      if (distance === undefined)
        return failure('DISORDER_BUDGET', 'Disorder grouping exceeded its work budget.')
      if (distance > SITE_TOLERANCE) continue
      if (match)
        return failure(
          'DISORDER_SITE_AMBIGUOUS',
          'One atom matches multiple co-located site groups.',
          { atomId: atom.id }
        )
      match = candidate.value
    }
    if (match) {
      match.atoms.push(atom)
    } else {
      const site = { atoms: [atom] }
      buckets.add(atom.fractional, site)
      sites.push(site)
    }
  }
  const patterns = new Map<string, { sites: DisorderSite[]; probabilities: number[] }>()
  for (const site of sites) {
    site.atoms.sort((a, b) => compareStrings(a.element, b.element))
    const weights = site.atoms.map(({ occupancy }) =>
      occupancy?.kind === 'known' ? occupancy.value : 0
    )
    const sum = weights.reduce((total, weight) => total + weight, 0)
    if (
      sum > 1 + OCCUPANCY_TOLERANCE ||
      new Set(site.atoms.map(({ element }) => element)).size !== weights.length
    )
      return failure(
        'DISORDER_SITE_CONFLICT',
        'Co-located alternatives must have distinct elements and total occupancy at most one.',
        { atomIds: site.atoms.map(({ id }) => id), sum }
      )
    const probabilities = [
      ...weights.map((weight) => weight / Math.max(1, sum)),
      Math.max(0, 1 - sum)
    ]
    const key = JSON.stringify([site.atoms.map(({ element }) => element), probabilities])
    const pattern = patterns.get(key)
    if (pattern) pattern.sites.push(site)
    else patterns.set(key, { sites: [site], probabilities })
  }
  const selected = new Set<string>()
  let vacancyCount = 0
  for (const { sites: matching, probabilities } of patterns.values()) {
    const quotas = probabilities.map((probability, index) => {
      const exact = probability * matching.length
      return { index, count: Math.floor(exact), remainder: exact - Math.floor(exact) }
    })
    const missing = matching.length - quotas.reduce((total, { count }) => total + count, 0)
    if (missing < 0 || missing > quotas.length)
      return failure(
        'DISORDER_QUOTA',
        'The requested occupancy quotas cannot be represented by site counts.'
      )
    const ranked = [...quotas].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    for (const quota of ranked.slice(0, missing)) quota.count++
    const ordering = shuffled(matching, random)
    let position = 0
    for (const quota of quotas)
      for (let count = 0; count < quota.count; count++) {
        const atom = ordering[position++].atoms[quota.index]
        if (atom) selected.add(atom.id)
        else vacancyCount++
      }
  }
  return success({
    atoms: atoms
      .filter(({ id }) => selected.has(id))
      .map((atom) => ({
        ...atom,
        occupancy: { kind: 'known', value: 1 }
      })),
    vacancyCount
  })
}

export function buildDefects(
  input: StructureSnapshot,
  options: DefectOptions
): ScientificResult<ConstructionResult<PeriodicStructureSnapshot>> {
  if (
    input?.kind !== 'periodic' ||
    !options ||
    !['interstitial', 'substitution', 'disorder'].includes(options.kind)
  )
    return failure(
      'DEFECT_INPUT',
      'A periodic structure and a supported defect operation are required.'
    )
  if (options.kind !== 'disorder' && !getElement(options.element))
    return failure('DEFECT_ELEMENT', 'The inserted element must be a recognized element symbol.')
  if (options.kind !== 'interstitial' && !validConstructionSeed(options.seed))
    return failure('DEFECT_SEED', 'The seed must be an unsigned 32-bit integer.')
  const source = periodicSource(input)
  if (!source.ok) return source
  const { snapshot } = source.value
  const diagnostics: Diagnostic[] = [...source.diagnostics]
  const mapping = periodicMapping(source.value)
  let atoms: readonly PeriodicAtom[] = snapshot.atoms
  let parameters: Record<string, JsonValue>
  if (options.kind === 'interstitial') {
    if (!isFiniteVector(options.fractional) || !isIntegerVector(options.fractional.map(Math.floor)))
      return failure(
        'INTERSTITIAL_POSITION',
        'An interstitial needs a finite, safely wrappable fractional triple.'
      )
    if (atoms.length >= MAX_CONSTRUCTION_ATOMS)
      return failure('DEFECT_BUDGET', 'Inserting an interstitial exceeds the atom budget.')
    const fractional = wrapPosition(options.fractional)
    const inverse = inverseCell(snapshot.cell)!
    const buckets = periodicBuckets(snapshot.cell, inverse, SITE_TOLERANCE)
    const budget = { remaining: MAX_CONSTRUCTION_CHECKS }
    for (const atom of atoms) {
      if (atom.occupancy?.kind === 'known' && atom.occupancy.value === 0) continue
      const distance = buckets.distance(fractional, atom.fractional, budget)
      if (distance === undefined)
        return failure('DEFECT_BUDGET', 'Interstitial validation exceeded its work budget.')
      if (distance <= SITE_TOLERANCE)
        return failure(
          'INTERSTITIAL_OVERLAP',
          'The interstitial coincides with an existing periodic site.',
          { atomId: atom.id }
        )
    }
    const id = 'defect:interstitial'
    atoms = [
      ...atoms,
      { id, element: options.element, fractional, occupancy: { kind: 'known', value: 1 } }
    ]
    mapping.atoms.push({ id, origins: [] })
    parameters = { kind: options.kind, element: options.element, fractional }
  } else if (options.kind === 'substitution') {
    const { amount, atomIds, hostElement, seed, element } = options
    const sourceIds = new Set(input.atoms.map(({ id }) => id))
    if (
      (!hostElement && !atomIds?.length) ||
      (hostElement !== undefined && !getElement(hostElement)) ||
      (atomIds !== undefined &&
        (!Array.isArray(atomIds) || atomIds.some((id) => !sourceIds.has(id))))
    )
      return failure(
        'SUBSTITUTION_SELECTION',
        'Specify a valid host element or a selection of existing source atom IDs.'
      )
    if (
      !amount ||
      !Number.isFinite(amount.value) ||
      amount.value <= 0 ||
      (amount.kind === 'count'
        ? !Number.isSafeInteger(amount.value)
        : amount.kind !== 'fraction' || amount.value > 1)
    )
      return failure('SUBSTITUTION_AMOUNT', 'Specify a positive count or a fraction in (0, 1].')
    const selection = atomIds === undefined ? undefined : new Set(atomIds)
    const ids = new Map(mapping.atoms.map(({ id, origins }) => [id, origins[0]?.sourceId]))
    const eligible = atoms.filter(
      (atom) =>
        atom.element !== element &&
        (hostElement === undefined || atom.element === hostElement) &&
        (selection === undefined || selection.has(ids.get(atom.id) ?? ''))
    )
    if (eligible.some(({ occupancy }) => occupancy?.kind !== 'known' || occupancy.value !== 1))
      return failure(
        'SUBSTITUTION_OCCUPANCY',
        'Realize partial or unknown occupancy before substituting selected sites.'
      )
    const count =
      amount.kind === 'count' ? amount.value : Math.round(amount.value * eligible.length)
    if (count === 0 || count > eligible.length)
      return failure(
        'SUBSTITUTION_QUOTA',
        'The substitution quota rounds to zero or exceeds the eligible site count.',
        { count, eligible: eligible.length }
      )
    const selected = new Set(
      shuffled(eligible, constructionRandom(seed))
        .slice(0, count)
        .map(({ id }) => id)
    )
    atoms = atoms.map((atom) => {
      if (!selected.has(atom.id)) return atom
      const { isotope, oxidationState, formalCharge, radical, ...site } = atom
      if ([isotope, oxidationState, formalCharge, radical].some((value) => value !== undefined))
        diagnostics.push({
          severity: 'warning',
          code: 'SUBSTITUTION_CHEMISTRY_CLEARED',
          message: 'Element-specific properties were removed at a substituted site.',
          context: { atomId: atom.id }
        })
      return { ...site, element }
    })
    parameters = {
      kind: options.kind,
      seed,
      element,
      eligibleCount: eligible.length,
      count,
      actualFraction: count / eligible.length
    }
  } else {
    const result = realizeDisorder(snapshot, constructionRandom(options.seed))
    if (!result.ok) return result
    atoms = result.value.atoms
    parameters = { kind: options.kind, seed: options.seed, vacancyCount: result.value.vacancyCount }
  }
  const atomIds = new Set(atoms.map(({ id }) => id))
  const bonds = snapshot.bonds.filter(({ endpoints }) =>
    endpoints.every(({ sourceAtomId }) => atomIds.has(sourceAtomId))
  )
  const bondIds = new Set(bonds.map(({ id }) => id))
  if (bonds.length !== snapshot.bonds.length)
    diagnostics.push({
      severity: 'warning',
      code: 'DEFECT_BONDS_REMOVED',
      message: 'Explicit bonds to unrealized alternatives or vacancies were removed.',
      context: { count: snapshot.bonds.length - bonds.length }
    })
  return finishConstruction(
    { ...snapshot, atoms, bonds },
    mapping.atoms.filter(({ id }) => atomIds.has(id)),
    mapping.bonds.filter(({ id }) => bondIds.has(id)),
    parameters,
    diagnostics
  )
}
