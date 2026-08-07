// Integration: the complete validation pipeline. Load a plugin with the
// parser, validate with the rules engine, attach compatibility results the way
// the CLI does, render reports in every format, and verify exit codes.

import { describe, expect, test } from 'bun:test';
import type {
  CompatibilityResult,
  Diagnostic,
  Plugin,
  ValidationResult,
} from '@agent-plugin-doctor/core';
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';
import { loadPlugin } from '@agent-plugin-doctor/parser';
import {
  createDefaultRegistry,
  ValidationEngine,
  validatePlugin,
} from '@agent-plugin-doctor/rules';
import { generateReport } from '@agent-plugin-doctor/report';
import { toCoreCompatibility } from '../../packages/cli/src/utils/run.js';
import {
  canonicalJson,
  cleanup,
  fixturePath,
  makeTempDir,
  writeTree,
} from './helpers.js';

const engine = new ValidationEngine(createDefaultRegistry());

/** Run the full CLI pipeline (load -> validate -> compatibility merge). */
async function fullValidate(fixture: string): Promise<ValidationResult> {
  const plugin: Plugin = await loadPlugin(fixturePath(fixture));
  const result = await validatePlugin(plugin);
  const compatibility = checkCompatibility(plugin);
  return {
    ...result,
    compatibility: toCoreCompatibility(compatibility.checks),
  };
}

// Fixture -> expected exit code (see tests/fixtures/README.md).
const EXPECTED_EXITS: Record<string, number> = {
  'minimal-plugin': 0,
  'complex-plugin': 0,
  'warning-plugin': 0,
  'security-plugin/symlink-escape': 0,
  'security-plugin/embedded-secrets': 2,
  'security-plugin/path-traversal': 0,
  'edge-cases/empty-plugin': 0,
  'edge-cases/huge-description': 1,
  'edge-cases/max-skills': 0,
  'vendor-extensions/valid-extensions': 0,
  'vendor-extensions/invalid-extensions': 0,
};

describe('full validation pipeline', () => {
  test('fixture exit codes match the documented contract', async () => {
    for (const [fixture, expected] of Object.entries(EXPECTED_EXITS)) {
      const result = await fullValidate(fixture);
      const exit = engine.computeExitCode(result.diagnostics);
      expect(exit, `${fixture} exit code`).toBe(expected);
    }
  });

  test('human report for a clean plugin', async () => {
    const result = await fullValidate('minimal-plugin');
    const report = generateReport(result, {
      format: 'human',
      noColor: true,
    });
    expect(report).toContain('Agent Plugin Doctor');
    expect(report).toContain('Plugin: minimal-plugin');
    expect(report).toContain('Spec: Agent Plugins 1.0.0');
    expect(report).toContain('Result: No issues found');
    expect(report).toContain('Compatibility:');
    expect(report).toContain('Fixes available: 0');
  });

  test('JSON report contains the full pipeline output', async () => {
    const result = await fullValidate('minimal-plugin');
    const report = generateReport(result, { format: 'json' });
    const data = JSON.parse(report) as {
      plugin: { name: string; specVersion: string };
      diagnostics: unknown[];
      summary: { counts: Record<string, number> };
      compatibility: CompatibilityResult[];
      fixesAvailable: number;
      compatible: boolean;
    };
    expect(data.plugin.name).toBe('minimal-plugin');
    expect(data.plugin.specVersion).toBe('1.0.0');
    expect(data.diagnostics).toEqual([]);
    expect(data.summary.counts.error).toBe(0);
    expect(data.fixesAvailable).toBe(0);
    expect(data.compatible).toBe(true);
    expect(data.compatibility).toHaveLength(5);
    expect(data.compatibility.every((c) => c.compatible)).toBe(true);
  });

  test('markdown report for a clean plugin', async () => {
    const result = await fullValidate('minimal-plugin');
    const report = generateReport(result, { format: 'markdown' });
    expect(report).toContain('# Agent Plugin Doctor Report');
    expect(report).toContain('## Plugin');
    expect(report).toContain('**Name:** minimal-plugin');
    expect(report).toContain('## Compatibility');
    expect(report).toContain('| VS Code | ✓ Compatible |');
  });

  test('all formats surface diagnostics for a warning plugin', async () => {
    const result = await fullValidate('warning-plugin');
    expect(result.diagnostics.some((d) => d.code === 'DOC-1004')).toBe(true);
    expect(engine.computeExitCode(result.diagnostics)).toBe(0);
    expect(engine.computeExitCode(result.diagnostics, { strict: true })).toBe(
      1,
    );

    const human = generateReport(result, { format: 'human', noColor: true });
    expect(human).toContain('DOC-1004');
    expect(human).toContain('Warning');

    const json = generateReport(result, { format: 'json' });
    const parsed = JSON.parse(json) as { diagnostics: Diagnostic[] };
    expect(parsed.diagnostics.some((d) => d.code === 'DOC-1004')).toBe(true);

    const markdown = generateReport(result, { format: 'markdown' });
    expect(markdown).toContain('DOC-1004');
  });

  test('critical security findings drive exit code 2 and JSON severity', async () => {
    const result = await fullValidate('security-plugin/embedded-secrets');
    expect(engine.computeExitCode(result.diagnostics)).toBe(2);

    const json = generateReport(result, { format: 'json' });
    const parsed = JSON.parse(json) as { diagnostics: Diagnostic[] };
    const critical = parsed.diagnostics.filter(
      (d) => d.severity === 'critical',
    );
    expect(critical.length).toBeGreaterThan(0);
    expect(critical[0].code).toBe('DOC-4003');
  });

  test('compatibility check merges 5 client results into the pipeline', async () => {
    const result = await fullValidate('complex-plugin');
    expect(result.compatibility).toHaveLength(5);
    const ids = result.compatibility.map((c) => c.clientId).sort();
    expect(ids).toEqual(['codex', 'copilot', 'cursor', 'kiro', 'vscode']);
    for (const entry of result.compatibility) {
      expect(typeof entry.compatible).toBe('boolean');
      expect(Array.isArray(entry.issues)).toBe(true);
      expect(['docs', 'runtime', 'expected', 'none']).toContain(entry.evidence);
    }
  });

  test('compatibility failures surface as incompatible clients', async () => {
    // An SSE-only plugin: codex does not support the legacy SSE transport.
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'sse-plugin',
        }),
        'mcp.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
          mcpServers: {
            remote: { type: 'sse', url: 'https://example.com/mcp' },
          },
        }),
      });
      const plugin = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      const compat = checkCompatibility(plugin);
      const merged: ValidationResult = {
        ...result,
        compatibility: toCoreCompatibility(compat.checks),
      };
      const codex = merged.compatibility.find((c) => c.clientId === 'codex');
      expect(codex?.compatible).toBe(false);
      expect(codex?.issues.join(' ')).toContain('sse');
      const vscode = merged.compatibility.find((c) => c.clientId === 'vscode');
      expect(vscode?.compatible).toBe(true);
    } finally {
      cleanup(dir);
    }
  });
});
