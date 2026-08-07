// E2E: `report` command with the real CLI binary.

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  cleanup,
  fixturePath,
  makeTempDir,
  readFile,
  runCli,
} from './helpers.js';

describe('e2e report command', () => {
  test('human report contains plugin info and compatibility', async () => {
    const result = await runCli([
      'report',
      fixturePath('minimal-plugin'),
      '--no-color',
    ]);
    expect(result.stdout).toContain('Agent Plugin Doctor');
    expect(result.stdout).toContain('Plugin: minimal-plugin');
    expect(result.stdout).toContain('Spec: Agent Plugins 1.0.0');
    expect(result.stdout).toContain('Result: No issues found');
    expect(result.stdout).toContain('Compatibility:');
    expect(result.stdout).toContain('Fixes available: 0');
    expect(result.exitCode).toBe(0);
  });

  test('JSON report is valid JSON with pipeline data', async () => {
    const result = await runCli([
      'report',
      fixturePath('minimal-plugin'),
      '--format',
      'json',
    ]);
    const data = JSON.parse(result.stdout) as {
      plugin: { name: string; specVersion: string };
      diagnostics: unknown[];
      summary: { counts: Record<string, number> };
      compatibility: unknown[];
      compatible: boolean;
    };
    expect(data.plugin.name).toBe('minimal-plugin');
    expect(data.plugin.specVersion).toBe('1.0.0');
    expect(data.diagnostics).toEqual([]);
    expect(data.summary.counts.error).toBe(0);
    expect(data.compatibility).toHaveLength(5);
    expect(data.compatible).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test('markdown report is valid markdown with a compatibility matrix', async () => {
    const result = await runCli([
      'report',
      fixturePath('minimal-plugin'),
      '--format',
      'markdown',
    ]);
    expect(result.stdout).toContain('# Agent Plugin Doctor Report');
    expect(result.stdout).toContain('## Plugin');
    expect(result.stdout).toContain('**Name:** minimal-plugin');
    expect(result.stdout).toContain('## Compatibility');
    expect(result.stdout).toContain('| Client | Status |');
    expect(result.stdout).toContain('| VS Code | ✓ Compatible |');
    expect(result.exitCode).toBe(0);
  });

  test('--output writes the report to a file', async () => {
    const dir = makeTempDir();
    try {
      const outFile = join(dir, 'report.md');
      const result = await runCli([
        'report',
        fixturePath('minimal-plugin'),
        '--format',
        'markdown',
        '--output',
        outFile,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Report written to');

      const written = readFile(dir, 'report.md');
      expect(written).not.toBeNull();
      expect(written).toContain('# Agent Plugin Doctor Report');

      // File content matches what would have gone to stdout.
      const toStdout = await runCli([
        'report',
        fixturePath('minimal-plugin'),
        '--format',
        'markdown',
      ]);
      expect(written).toBe(toStdout.stdout);
    } finally {
      cleanup(dir);
    }
  });

  test('report exit code reflects diagnostics', async () => {
    const result = await runCli([
      'report',
      fixturePath('security-plugin', 'embedded-secrets'),
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(2);
  });

  test('unknown format exits 3', async () => {
    const result = await runCli([
      'report',
      fixturePath('minimal-plugin'),
      '--format',
      'xml',
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('Unknown report format');
  });
});
