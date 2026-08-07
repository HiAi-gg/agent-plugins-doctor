import { describe, expect, test } from 'bun:test';
import type { Diagnostic } from '@agent-plugin-doctor/core';
import { EXIT_CODES, computeExitCode } from '../src/utils/exit-codes.js';

function diagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    code: 'DOC-1001',
    severity: 'error',
    message: 'test diagnostic',
    ruleId: 'test-rule',
    category: 'spec',
    ...overrides,
  };
}

describe('computeExitCode', () => {
  test('no diagnostics exits 0', () => {
    expect(computeExitCode([])).toBe(EXIT_CODES.SUCCESS);
  });

  test('info and warning diagnostics exit 0', () => {
    const diagnostics = [
      diagnostic({ code: 'DOC-7001', severity: 'info', category: 'format' }),
      diagnostic({ code: 'DOC-1004', severity: 'warning' }),
    ];
    expect(computeExitCode(diagnostics)).toBe(EXIT_CODES.SUCCESS);
  });

  test('error diagnostics exit 1', () => {
    const diagnostics = [diagnostic({ severity: 'error' })];
    expect(computeExitCode(diagnostics)).toBe(EXIT_CODES.SPEC_ERRORS);
  });

  test('critical diagnostics exit 2', () => {
    const diagnostics = [
      diagnostic({
        code: 'DOC-4003',
        severity: 'critical',
        category: 'security',
      }),
    ];
    expect(computeExitCode(diagnostics)).toBe(EXIT_CODES.SECURITY_CRITICAL);
  });

  test('priority: 3 > 2 > 1 > 0', () => {
    // An internal rule failure (DOC-0000) beats a critical finding.
    expect(
      computeExitCode([
        diagnostic({ code: 'DOC-0000', severity: 'error' }),
        diagnostic({
          code: 'DOC-4003',
          severity: 'critical',
          category: 'security',
        }),
      ]),
    ).toBe(EXIT_CODES.TOOL_FAILURE);

    // A critical finding beats plain spec errors.
    expect(
      computeExitCode([
        diagnostic({
          severity: 'critical',
          code: 'DOC-4003',
          category: 'security',
        }),
        diagnostic({ severity: 'error' }),
      ]),
    ).toBe(EXIT_CODES.SECURITY_CRITICAL);

    // An error beats warnings and info.
    expect(
      computeExitCode([
        diagnostic({ severity: 'warning' }),
        diagnostic({ severity: 'info', code: 'DOC-7001', category: 'format' }),
        diagnostic({ severity: 'error' }),
      ]),
    ).toBe(EXIT_CODES.SPEC_ERRORS);

    // Warnings alone exit 0 unless strict mode is enabled.
    expect(computeExitCode([diagnostic({ severity: 'warning' })])).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(
      computeExitCode([diagnostic({ severity: 'warning' })], { strict: true }),
    ).toBe(EXIT_CODES.SPEC_ERRORS);
  });

  test('exit code constants are stable', () => {
    expect(EXIT_CODES).toEqual({
      SUCCESS: 0,
      SPEC_ERRORS: 1,
      SECURITY_CRITICAL: 2,
      TOOL_FAILURE: 3,
    });
  });
});
