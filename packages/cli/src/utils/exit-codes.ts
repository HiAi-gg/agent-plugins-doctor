// Exit code contract for the agent-plugin-doctor CLI.
//
// Priority: 3 > 2 > 1 > 0. When multiple conditions apply, the highest code
// wins. Tool/runtime failures (exceptions) produce 3 and are handled at the
// command level; diagnostic-based exit codes are derived here.

import type { Diagnostic } from '@agent-plugin-doctor/core';
import { INTERNAL_ERROR_CODE } from '@agent-plugin-doctor/rules';

export const EXIT_CODES = {
  SUCCESS: 0, // Valid, no errors
  SPEC_ERRORS: 1, // Spec validation errors
  SECURITY_CRITICAL: 2, // Security-critical findings
  TOOL_FAILURE: 3, // Tool/runtime failure
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export interface ExitCodeOptions {
  /** Treat warnings as errors (used by --strict). */
  strict?: boolean;
}

/**
 * Derive the process exit code from a set of diagnostics.
 *
 * Priority: 3 (internal rule failure) > 2 (critical) > 1 (error, or a warning
 * under strict mode) > 0.
 */
export function computeExitCode(
  diagnostics: Diagnostic[],
  options: ExitCodeOptions = {},
): ExitCode {
  // 3: a rule failed internally while validating.
  if (
    diagnostics.some((diagnostic) => diagnostic.code === INTERNAL_ERROR_CODE)
  ) {
    return EXIT_CODES.TOOL_FAILURE;
  }
  // 2: any security-critical finding.
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'critical')) {
    return EXIT_CODES.SECURITY_CRITICAL;
  }
  // 1: any spec validation error.
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return EXIT_CODES.SPEC_ERRORS;
  }
  // 1: a warning under --strict.
  if (
    options.strict === true &&
    diagnostics.some((diagnostic) => diagnostic.severity === 'warning')
  ) {
    return EXIT_CODES.SPEC_ERRORS;
  }
  // 0: otherwise.
  return EXIT_CODES.SUCCESS;
}
