import { describe, expect, test } from 'bun:test';
import type { Diagnostic, Severity } from '@agent-plugin-doctor/core';
import { generateReport, getFormatter } from '../src/index.js';
import { makeResult } from './helpers.js';

describe('report integration', () => {
  test('all three formats carry identical diagnostic data', () => {
    const result = makeResult();
    const human = generateReport(result, { format: 'human', noColor: true });
    const json = generateReport(result, { format: 'json' });
    const markdown = generateReport(result, { format: 'markdown' });

    // Every code and message appears in every format.
    const parsedMessages = (
      JSON.parse(json) as {
        diagnostics: { code: string; message: string }[];
      }
    ).diagnostics;
    for (const diagnostic of result.diagnostics) {
      expect(human).toContain(diagnostic.code);
      expect(markdown).toContain(diagnostic.code);
      expect(parsedMessages.some((d) => d.code === diagnostic.code)).toBe(true);
      expect(human).toContain(diagnostic.message);
      expect(markdown).toContain(diagnostic.message);
      expect(parsedMessages.some((d) => d.message === diagnostic.message)).toBe(
        true,
      );
    }

    // Counts agree across formats.
    const parsed = JSON.parse(json) as {
      summary: {
        counts: Record<Severity, number>;
      };
      fixesAvailable: number;
      compatibility: unknown[];
    };
    expect(parsed.summary.counts).toEqual({
      error: 2,
      warning: 1,
      info: 1,
      critical: 0,
    });
    expect(human).toContain('Result: 2 errors, 1 warning, 1 info');
    expect(markdown).toContain('| Error | 2 |');
    expect(parsed.fixesAvailable).toBe(2);
    expect(human).toContain('Fixes available: 2');
    expect(parsed.compatibility).toHaveLength(5);
    expect(markdown.match(/\| VS Code \| ✓ Compatible \|/g)).toHaveLength(1);
    expect(human).toContain('  VS Code: ✓');
  });

  test('handles empty diagnostics across all formats', () => {
    const result = makeResult({ diagnostics: [], compatibility: [] });
    const human = generateReport(result, { format: 'human', noColor: true });
    const json = generateReport(result, { format: 'json' });
    const markdown = generateReport(result, { format: 'markdown' });

    const parsed = JSON.parse(json) as {
      diagnostics: unknown[];
      summary: { counts: Record<Severity, number> };
      fixesAvailable: number;
    };
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.summary.counts).toEqual({
      error: 0,
      warning: 0,
      info: 0,
      critical: 0,
    });
    expect(parsed.fixesAvailable).toBe(0);
    expect(human).toContain('Result: No issues found');
    expect(markdown).not.toContain('## Diagnostics');
    // All formats stay consistent: no diagnostics means no error counts.
    expect(human).not.toContain('Errors:');
    expect(markdown).not.toContain('| Error |');
  });

  test('handles large diagnostic sets', () => {
    const diagnostics: Diagnostic[] = Array.from({ length: 200 }, (_, i) => ({
      code: i % 2 === 0 ? 'DOC-1001' : 'DOC-7001',
      severity: (i % 3 === 0
        ? 'error'
        : i % 3 === 1
          ? 'warning'
          : 'info') as Severity,
      message: `Diagnostic number ${i}`,
      ruleId: 'manifest-name-pattern',
      category: 'spec',
      file: `file-${i % 5}.json`,
    }));
    const errorCount = diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error',
    ).length;
    const result = makeResult({ diagnostics, compatibility: [] });

    const human = generateReport(result, { format: 'human', noColor: true });
    const json = generateReport(result, { format: 'json' });
    const markdown = generateReport(result, { format: 'markdown' });

    const parsed = JSON.parse(json) as {
      diagnostics: unknown[];
      summary: { counts: Record<Severity, number> };
    };
    expect(parsed.diagnostics).toHaveLength(200);
    expect(
      parsed.summary.counts.error +
        parsed.summary.counts.warning +
        parsed.summary.counts.info,
    ).toBe(200);
    expect(human).toContain(`Result: ${errorCount} errors`);
    expect(markdown).toContain(`<summary>Errors (${errorCount})</summary>`);
    expect(human).toContain('Fixes available: 0');
  });

  test('getFormatter dispatches to the right formatter', () => {
    const result = makeResult();
    expect(
      getFormatter('human', { format: 'human', noColor: true }).format(result),
    ).toContain('Agent Plugin Doctor');
    expect(() => JSON.parse(getFormatter('json').format(result))).not.toThrow();
    expect(getFormatter('markdown').format(result)).toContain(
      '# Agent Plugin Doctor Report',
    );
  });

  test('getFormatter rejects unknown formats', () => {
    expect(() => getFormatter('xml' as never)).toThrow(/Unknown report format/);
  });
});
