import type { Diagnostic, DiagnosticContext, ScientificResult } from './types'

export function success<T>(value: T, diagnostics: readonly Diagnostic[] = []): ScientificResult<T> {
  return { ok: true, value, diagnostics }
}

export function failure(
  code: string,
  message: string,
  context?: DiagnosticContext
): ScientificResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code, message, ...(context ? { context } : {}) }]
  }
}

export function failureFrom(diagnostics: readonly Diagnostic[]): ScientificResult<never> {
  return { ok: false, diagnostics }
}
