import type { Diagnostic, DiagnosticContext, StructureSnapshot } from '../core/types'

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((item) => item.severity === 'error')

/** Scientific losses are blocking until explicitly accepted for this export. */
export function lossDiagnostic(
  code: string,
  message: string,
  allowLoss: boolean,
  context?: DiagnosticContext,
  sourceLocation?: Diagnostic['sourceLocation']
): Diagnostic {
  return {
    severity: allowLoss ? 'warning' : 'error',
    code,
    message,
    ...(context ? { context } : {}),
    ...(sourceLocation ? { sourceLocation } : {})
  }
}

/** Retain unrepresented input semantics across edits, even when the AST is discarded. */
export function inheritedLossDiagnostics(
  snapshot: StructureSnapshot,
  allowLoss: boolean,
  target?: 'mol' | 'poscar'
): Diagnostic[] {
  const metadata = snapshot.metadata?.alchemionFormats
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  const record = metadata as Readonly<Record<string, unknown>>
  if (record.schemaVersion !== 1 || !Array.isArray(record.losses)) return []
  const diagnostics = record.losses.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const loss = entry as Partial<Diagnostic>
    if (typeof loss.code !== 'string' || typeof loss.message !== 'string') return []
    return [lossDiagnostic(loss.code, loss.message, allowLoss, loss.context, loss.sourceLocation)]
  })
  if (target) {
    const visit = (value: unknown, path: string) => {
      if (!value || typeof value !== 'object') return
      if (
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).standardUncertainty === 'number'
      )
        diagnostics.push(
          lossDiagnostic(
            'FORMAT_SOURCE_MEASUREMENT_LOSS',
            'This format cannot represent the original coordinate-frame measurement uncertainty.',
            allowLoss,
            { format: target, field: path }
          )
        )
      for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`)
    }
    visit(record.sourceMeasurements, 'sourceMeasurements')
  }
  return diagnostics
}
