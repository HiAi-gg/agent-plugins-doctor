import { describe, expect, test } from 'bun:test';
import type { Diagnostic } from '@agent-plugin-doctor/core';
import { MarkdownReportFormatter } from '../src/markdown.js';
import { makeResult } from './helpers.js';

/** Exact expected output for the example fixture. */
const EXPECTED_OUTPUT = `# Agent Plugin Doctor Report

## Plugin
- **Name:** my-plugin
- **Spec Version:** 1.0.0

## Summary
| Severity | Count |
|----------|-------|
| Error | 2 |
| Warning | 1 |
| Info | 1 |

## Diagnostics

### Errors

#### DOC-1001: Required Fields
**File:** plugin.json

Missing required field "version".

#### DOC-1002: Name Pattern
**File:** plugin.json:3

Plugin name does not match the required pattern.

### Warnings

#### DOC-7001: JSON Formatting
**File:** plugin.json

JSON formatting could be improved.

### Info

#### DOC-5003: Extra Files
**File:** README.md

Extra file at plugin root.

## Compatibility

| Client | Status |
|--------|--------|
| VS Code | ✓ Compatible |
| Cursor | ✓ Compatible |
| GitHub Copilot | ✓ Compatible |
| ChatGPT & Codex | ✓ Compatible |
| Kiro | ✓ Compatible |

## Fixes
2 fixes available. Run \`agent-plugin-doctor fix\` to apply.
`;

describe('MarkdownReportFormatter', () => {
  test('formats a validation result as GitHub-flavored Markdown', () => {
    const output = new MarkdownReportFormatter().format(makeResult());
    expect(output).toBe(EXPECTED_OUTPUT);
  });

  test('includes a correct summary table', () => {
    const output = new MarkdownReportFormatter().format(makeResult());
    expect(output).toContain('| Severity | Count |');
    expect(output).toContain('|----------|-------|');
    expect(output).toContain('| Error | 2 |');
    expect(output).toContain('| Warning | 1 |');
    expect(output).toContain('| Info | 1 |');
  });

  test('groups diagnostics by severity', () => {
    const output = new MarkdownReportFormatter().format(makeResult());
    const errors = output.indexOf('### Errors');
    const warnings = output.indexOf('### Warnings');
    const info = output.indexOf('### Info');
    expect(errors).toBeGreaterThan(-1);
    expect(warnings).toBeGreaterThan(errors);
    expect(info).toBeGreaterThan(warnings);
    // Each section contains only its own codes.
    const errorsSection = output.slice(errors, warnings);
    expect(errorsSection).toContain('DOC-1001');
    expect(errorsSection).toContain('DOC-1002');
    expect(errorsSection).not.toContain('DOC-7001');
    const warningsSection = output.slice(warnings, info);
    expect(warningsSection).toContain('DOC-7001');
    expect(warningsSection).not.toContain('DOC-5003');
    const infoSection = output.slice(info);
    expect(infoSection).toContain('DOC-5003');
  });

  test('includes a compatibility matrix table', () => {
    const output = new MarkdownReportFormatter().format(makeResult());
    expect(output).toContain('| Client | Status |');
    expect(output).toContain('|--------|--------|');
    expect(output).toContain('| VS Code | ✓ Compatible |');
    expect(output).toContain('| Cursor | ✓ Compatible |');
    expect(output).toContain('| GitHub Copilot | ✓ Compatible |');
    expect(output).toContain('| ChatGPT & Codex | ✓ Compatible |');
    expect(output).toContain('| Kiro | ✓ Compatible |');
  });

  test('shows incompatible clients in the matrix', () => {
    const result = makeResult({
      compatibility: [
        {
          clientId: 'kiro',
          clientName: 'Kiro',
          compatible: false,
          issues: ['Client "Kiro" does not support legacy SSE MCP servers'],
          evidence: 'docs',
        },
      ],
    });
    const output = new MarkdownReportFormatter().format(result);
    expect(output).toContain('| Kiro | ✗ Incompatible |');
  });

  test('shows fix availability', () => {
    const output = new MarkdownReportFormatter().format(makeResult());
    expect(output).toContain(
      '2 fixes available. Run `agent-plugin-doctor fix` to apply.',
    );
  });

  test('uses collapsible details for long severity lists', () => {
    const many: Diagnostic[] = Array.from({ length: 8 }, (_, i) => ({
      code: 'DOC-1002',
      severity: 'error',
      message: `Error number ${i}`,
      ruleId: 'manifest-name-pattern',
      category: 'spec',
      file: `plugin-${i}.json`,
    }));
    const output = new MarkdownReportFormatter().format(
      makeResult({ diagnostics: many, compatibility: [] }),
    );
    expect(output).toContain('<details>');
    expect(output).toContain('<summary>Errors (8)</summary>');
  });

  test('omits empty sections for a clean result', () => {
    const result = makeResult({ diagnostics: [], compatibility: [] });
    const output = new MarkdownReportFormatter().format(result);
    expect(output).toContain('# Agent Plugin Doctor Report');
    expect(output).not.toContain('## Diagnostics');
    expect(output).not.toContain('## Summary');
    expect(output).not.toContain('## Compatibility');
    expect(output).toContain('## Fixes');
    expect(output).toContain('No fixes available.');
  });
});
