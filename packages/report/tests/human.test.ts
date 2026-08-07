import { describe, expect, test } from 'bun:test';
import { HumanReportFormatter } from '../src/human.js';
import { makeResult } from './helpers.js';

const NO_COLOR: { format: 'human'; noColor: boolean } = {
  format: 'human',
  noColor: true,
};

/** Exact expected output for the example fixture (colors disabled). */
const EXPECTED_OUTPUT = `Agent Plugin Doctor

Plugin: my-plugin
Spec: Agent Plugins 1.0.0

Result: 2 errors, 1 warning, 1 info

ERROR DOC-1001
plugin.json
Missing required field "version".

ERROR DOC-1002
plugin.json:3
Plugin name does not match the required pattern.

WARNING DOC-7001
plugin.json
JSON formatting could be improved.

INFO DOC-5003
README.md
Extra file at plugin root.

Summary:
  Errors: 2
  Warnings: 1
  Info: 1

Compatibility:
  VS Code: ✓
  Cursor: ✓
  GitHub Copilot: ✓
  ChatGPT & Codex: ✓
  Kiro: ✓

Fixes available: 2
Run with --fix to apply safe fixes.
`;

describe('HumanReportFormatter', () => {
  test('formats a validation result correctly', () => {
    const formatter = new HumanReportFormatter(NO_COLOR);
    const output = formatter.format(makeResult());
    expect(output).toBe(EXPECTED_OUTPUT);
  });

  test('applies colors when enabled', () => {
    process.env.FORCE_COLOR = '3';
    try {
      const formatter = new HumanReportFormatter({ format: 'human' });
      const output = formatter.format(makeResult());
      expect(output).toContain('\u001B[');
      expect(output).not.toBe(
        new HumanReportFormatter(NO_COLOR).format(makeResult()),
      );
    } finally {
      delete process.env.FORCE_COLOR;
    }
  });

  test('disables colors with the noColor option', () => {
    const formatter = new HumanReportFormatter({
      format: 'human',
      noColor: true,
    });
    const output = formatter.format(makeResult());
    expect(output).not.toContain('\u001B[');
  });

  test('groups diagnostics by file', () => {
    const output = new HumanReportFormatter(NO_COLOR).format(makeResult());
    const error1001 = output.indexOf('ERROR DOC-1001');
    const error1002 = output.indexOf('ERROR DOC-1002');
    const warning = output.indexOf('WARNING DOC-7001');
    const info = output.indexOf('INFO DOC-5003');
    expect(error1001).toBeGreaterThan(-1);
    // plugin.json group (errors first, then warning) precedes README.md.
    expect(error1002).toBeGreaterThan(error1001);
    expect(warning).toBeGreaterThan(error1002);
    expect(info).toBeGreaterThan(warning);
    // File lines are shown for each diagnostic.
    expect(output).toContain('plugin.json:3');
    expect(output).toContain('README.md');
  });

  test('shows correct summary counts', () => {
    const output = new HumanReportFormatter(NO_COLOR).format(makeResult());
    expect(output).toContain('Result: 2 errors, 1 warning, 1 info');
    expect(output).toContain('Summary:');
    expect(output).toContain('  Errors: 2');
    expect(output).toContain('  Warnings: 1');
    expect(output).toContain('  Info: 1');
    expect(output).not.toContain('Critical:');
  });

  test('shows the compatibility matrix', () => {
    const output = new HumanReportFormatter(NO_COLOR).format(makeResult());
    expect(output).toContain('Compatibility:');
    expect(output).toContain('  VS Code: ✓');
    expect(output).toContain('  Cursor: ✓');
    expect(output).toContain('  GitHub Copilot: ✓');
    expect(output).toContain('  ChatGPT & Codex: ✓');
    expect(output).toContain('  Kiro: ✓');
  });

  test('shows fix availability', () => {
    const output = new HumanReportFormatter(NO_COLOR).format(makeResult());
    expect(output).toContain('Fixes available: 2');
    expect(output).toContain('Run with --fix to apply safe fixes.');
  });

  test('shows incompatible clients with their issues', () => {
    const result = makeResult({
      compatibility: [
        {
          clientId: 'kiro',
          clientName: 'Kiro',
          level: 'unsupported',
          compatible: false,
          working: [],
          unsupported: ['mcp-sse'],
          issues: ['Client "Kiro" does not support legacy SSE MCP servers'],
          evidence: 'docs',
        },
      ],
    });
    const output = new HumanReportFormatter(NO_COLOR).format(result);
    expect(output).toContain('  Kiro: ✗ (unsupported)');
    expect(output).toContain('    Unsupported: mcp-sse');
    expect(output).toContain(
      '    Client "Kiro" does not support legacy SSE MCP servers',
    );
  });

  test('handles a result with no diagnostics', () => {
    const result = makeResult({ diagnostics: [], compatibility: [] });
    const output = new HumanReportFormatter(NO_COLOR).format(result);
    expect(output).toContain('Result: No issues found');
    expect(output).toContain('Fixes available: 0');
    expect(output).not.toContain('Summary:');
    expect(output).not.toContain('Compatibility:');
  });

  test('verbose output includes rule id and category', () => {
    const formatter = new HumanReportFormatter({
      format: 'human',
      verbose: true,
      noColor: true,
    });
    const output = formatter.format(makeResult());
    expect(output).toContain('Rule: manifest-name-pattern (spec)');
    expect(output).toContain('Rule: format-json-formatting (format)');
  });
});
