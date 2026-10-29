import { getElement } from '../core/data'
import type { BrillouinZone } from '../core/brillouin-zone'
import type { ReciprocalLattice } from '../core/reciprocal'
import { reciprocalPoint } from '../core/reciprocal'
import type { DerivedStructure, Diagnostic, StructureSnapshot, Vec3 } from '../core/types'
import type { RenderFrame } from './internal-contracts'
import type { ViewerOptions } from './types'

// Project-authored palette. These values are display choices, not an imported CPK/Jmol table.
const palette: Readonly<Record<string, string>> = {
  H: '#ededed',
  C: '#404852',
  N: '#376bc5',
  O: '#d94748',
  F: '#70bb67',
  P: '#e99440',
  S: '#d6b83e',
  Cl: '#60a86f',
  Br: '#986346',
  I: '#9874b5'
}
function color(hex: string): Vec3 {
  return [1, 3, 5].map((index) => {
    const s = parseInt(hex.slice(index, index + 2), 16) / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as unknown as Vec3
}
export function createRenderFrame(
  source: StructureSnapshot,
  derived: DerivedStructure,
  options: ViewerOptions,
  auxiliary: { reciprocal?: ReciprocalLattice; zone?: BrillouinZone } = {}
): { frame: RenderFrame; diagnostics: readonly Diagnostic[] } {
  const sources = new Map(source.atoms.map((atom) => [atom.id, atom]))
  const diagnostics: Diagnostic[] = []
  const missing = new Set<string>()
  const atoms = derived.atoms.map((instance) => {
    const atom = sources.get(instance.sourceAtomId)
    if (!atom) throw new Error('RENDER_SOURCE: a display atom has no source.')
    const style = options.elementStyles[atom.element]
    const radius =
      options.renderMode === 'ball-and-stick'
        ? (style?.ballRadius ?? options.ballRadius)
        : (style?.spaceFillingRadius ?? getElement(atom.element)?.vanDerWaalsRadius?.value)
    if (radius === undefined && !missing.has(atom.element)) {
      missing.add(atom.element)
      diagnostics.push({
        severity: 'warning',
        code: 'VDW_RADIUS_MISSING',
        message: `No compiled vdW radius for ${atom.element}; the configured ${options.missingRadius} Å visual fallback is displayed.`,
        context: { element: atom.element, visualFallback: options.missingRadius }
      })
    }
    return {
      instance,
      color: color(style?.color ?? palette[atom.element] ?? '#79a8b8'),
      radius: (radius ?? options.missingRadius) * options.atomScale
    }
  })
  const instances = new Map(atoms.map((atom) => [atom.instance.id, atom]))
  const bonds =
    options.renderMode === 'ball-and-stick'
      ? derived.bonds.map((bond) => {
          const a = instances.get(bond.endpoints[0]),
            b = instances.get(bond.endpoints[1])
          if (!a || !b) throw new Error('RENDER_BOND: a display bond has a missing endpoint.')
          return {
            bond,
            a: a.instance.cartesian,
            b: b.instance.cartesian,
            color: [0.28, 0.31, 0.35] as Vec3,
            radius: options.bondRadius
          }
        })
      : []
  if (
    source.kind === 'molecular' &&
    (options.showLattice || options.showReciprocalLattice || options.showBrillouinZone)
  )
    diagnostics.push({
      severity: 'warning',
      code: 'VIEWER_PERIODIC_UNAVAILABLE',
      message:
        'A molecular structure has no direct or reciprocal cell; periodic helpers are hidden.'
    })
  const reciprocalPoints: Vec3[] = []
  if (source.kind === 'periodic' && auxiliary.reciprocal) {
    for (let h = -1; h <= 1; h++)
      for (let k = -1; k <= 1; k++)
        for (let l = -1; l <= 1; l++) {
          const point = reciprocalPoint(source.cell, [h, k, l])
          if (!point.ok) throw new Error(point.diagnostics[0].message)
          reciprocalPoints.push(point.value)
        }
  }
  return {
    frame: {
      atoms,
      bonds,
      options,
      ...(source.kind === 'periodic' ? { cell: source.cell, ...auxiliary, reciprocalPoints } : {})
    },
    diagnostics
  }
}
