import { describe, expect, test } from 'bun:test';
import { JsonReportFormatter } from '../src/json.js';
import { makeResult } from './helpers.js';

type JsonRecord = Record<string, unknown>;

describe('JsonReportFormatter', () => {
  test('produces valid, parseable JSON', () => {
    const output = new JsonReportFormatter().format(makeResult());
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test('includes all diagnostic details', () => {
    const parsed = JSON.parse(
      new JsonReportFormatter().format(makeResult()),
    ) as JsonRecord;
    const diagnostics = parsed.diagnostics as JsonRecord[];
    expect(diagnostics).toHaveLength(4);

    const required = diagnostics[0] as JsonRecord;
    expect(required.code).toBe('DOC-1001');
    expect(required.severity).toBe('error');
    expect(required.message).toBe('Missing required field "version".');
    expect(required.ruleId).toBe('manifest-required-fields');
    expect(required.category).toBe('spec');
    expect(required.file).toBe('plugin.json');
    expect(required.range).toBeNull();
    expect(required.fix).toBeNull();

    const patterned = diagnostics[1] as JsonRecord;
    expect(patterned.range).toEqual({
      start: { line: 3, column: 10 },
      end: { line: 3, column: 20 },
    });
    expect(patterned.fix).toEqual({
      kind: 'replace',
      file: 'plugin.json',
      description: 'Rename plugin to "my-plugin"',
      oldText: '"name": "My Plugin"',
      newText: '"name": "my-plugin"',
    });

    const formatting = diagnostics[2] as JsonRecord;
    expect(formatting.fix).toEqual({
      kind: 'replace',
      file: 'plugin.json',
      description: 'Format plugin.json as canonical JSON',
    });
  });

  test('includes correct summary counts', () => {
    const parsed = JSON.parse(
      new JsonReportFormatter().format(makeResult()),
    ) as JsonRecord;
    const summary = parsed.summary as JsonRecord;
    expect(summary.counts).toEqual({
      error: 2,
      warning: 1,
      info: 1,
      critical: 0,
    });
    expect(summary.byCategory).toEqual({ spec: 2, format: 1, structure: 1 });
  });

  test('includes compatibility results and fix availability', () => {
    const parsed = JSON.parse(
      new JsonReportFormatter().format(makeResult()),
    ) as JsonRecord;
    const compatibility = parsed.compatibility as JsonRecord[];
    expect(compatibility).toHaveLength(5);
    expect(compatibility[0]).toEqual({
      clientId: 'vscode',
      clientName: 'VS Code',
      compatible: true,
      issues: [],
      evidence: 'docs',
    });
    expect(parsed.fixesAvailable).toBe(2);
    expect(parsed.compatible).toBe(false);
    expect(parsed.plugin).toEqual({
      name: 'my-plugin',
      specVersion: '1.0.0',
    });
  });

  test('keeps stable field ordering', () => {
    const formatter = new JsonReportFormatter();
    const first = formatter.format(makeResult());
    const second = formatter.format(makeResult());
    // Identical input yields byte-identical output.
    expect(second).toBe(first);

    const parsed = JSON.parse(first) as JsonRecord;
    expect(Object.keys(parsed)).toEqual([
      'plugin',
      'diagnostics',
      'summary',
      'compatibility',
      'fixesAvailable',
      'compatible',
      'elapsedMs',
    ]);
    expect(Object.keys(parsed.summary as JsonRecord)).toEqual([
      'counts',
      'byCategory',
    ]);
    expect(
      Object.keys((parsed.summary as JsonRecord).counts as JsonRecord),
    ).toEqual(['error', 'warning', 'info', 'critical']);
    const diagnostics = parsed.diagnostics as JsonRecord[];
    expect(Object.keys(diagnostics[0])).toEqual([
      'code',
      'severity',
      'message',
      'ruleId',
      'category',
      'file',
      'range',
      'fix',
    ]);
  });

  test('handles a result with no diagnostics', () => {
    const result = makeResult({ diagnostics: [], compatibility: [] });
    const parsed = JSON.parse(
      new JsonReportFormatter().format(result),
    ) as JsonRecord;
    expect(parsed.diagnostics).toEqual([]);
    expect((parsed.summary as JsonRecord).counts).toEqual({
      error: 0,
      warning: 0,
      info: 0,
      critical: 0,
    });
    expect((parsed.summary as JsonRecord).byCategory).toEqual({});
    expect(parsed.compatibility).toEqual([]);
    expect(parsed.fixesAvailable).toBe(0);
    expect(parsed.compatible).toBe(true);
  });
});
