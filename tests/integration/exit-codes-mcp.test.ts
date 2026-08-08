// Integration: exit code semantics for MCP diagnostics.
//
// Exit code contract (0 = valid, 1 = validation error, 2 = security-critical,
// 3 = tool/internal failure). Invalid MCP server entries are validation
// errors (exit 1) unless the entry escapes the plugin root — an escaping
// stdio command/cwd is a security-critical finding (exit 2). This file locks
// the mapping for the mcp-per-server fixtures through the real
// `computeExitCode` exported by @agent-plugins-doctor/cli.

import { describe, expect, test } from 'bun:test';
import { computeExitCode } from '@agent-plugins-doctor/cli';
import { loadPlugin } from '@agent-plugins-doctor/parser';
import { validatePlugin } from '@agent-plugins-doctor/rules';
import { fixturePath } from './helpers.js';

describe('MCP exit codes', () => {
  test('invalid transport -> exit 1', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/mixed-valid-invalid'),
    );
    const result = await validatePlugin(plugin);
    const allDiagnostics = [...parseDiagnostics, ...result.diagnostics];
    expect(allDiagnostics.some((d) => d.code === 'DOC-3008')).toBe(true);
    expect(computeExitCode(allDiagnostics)).toBe(1);
  });

  test('reserved env key -> exit 1', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/reserved-env'),
    );
    const result = await validatePlugin(plugin);
    const allDiagnostics = [...parseDiagnostics, ...result.diagnostics];
    expect(allDiagnostics.some((d) => d.code === 'DOC-3008')).toBe(true);
    expect(computeExitCode(allDiagnostics)).toBe(1);
  });

  test('cwd traversal -> exit 2 (security-critical)', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/cwd-traversal'),
    );
    const result = await validatePlugin(plugin);
    const allDiagnostics = [...parseDiagnostics, ...result.diagnostics];
    // The parser emits the traversal as a critical DOC-3008.
    expect(
      allDiagnostics.some(
        (d) => d.code === 'DOC-3008' && d.severity === 'critical',
      ),
    ).toBe(true);
    expect(computeExitCode(allDiagnostics)).toBe(2);
  });

  test('command traversal -> exit 2 (security-critical)', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/command-traversal'),
    );
    const result = await validatePlugin(plugin);
    const allDiagnostics = [...parseDiagnostics, ...result.diagnostics];
    // The parser emits the traversal as a critical DOC-3008.
    expect(
      allDiagnostics.some(
        (d) => d.code === 'DOC-3008' && d.severity === 'critical',
      ),
    ).toBe(true);
    expect(computeExitCode(allDiagnostics)).toBe(2);
  });

  test('internal rule failure -> exit 3, even alongside critical', () => {
    // DOC-0000 (a rule threw internally) is a tool failure (3) and outranks
    // every diagnostic-derived code: 3 > 2 > 1 > 0.
    expect(
      computeExitCode([
        {
          code: 'DOC-0000',
          severity: 'error',
          message: 'rule threw',
          ruleId: 'some-rule',
          category: 'spec',
        },
        {
          code: 'DOC-3008',
          severity: 'critical',
          message: 'traversal',
          ruleId: 'parser',
          category: 'mcp',
        },
      ]),
    ).toBe(3);
  });
});
