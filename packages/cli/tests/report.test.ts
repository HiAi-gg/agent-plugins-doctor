import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  cleanup,
  errorPlugin,
  makeTempDir,
  readFile,
  runCli,
  validPlugin,
} from './helpers.js';

describe('report command', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    cleanup(dir);
  });

  test('human format output is correct', async () => {
    validPlugin(dir);
    const result = await runCli(['report', dir, '--no-color']);
    expect(result.stdout).toContain('Agent Plugin Doctor');
    expect(result.stdout).toContain('Plugin: valid-plugin');
    expect(result.stdout).toContain('Result: No issues found');
    expect(result.stdout).toContain('Compatibility:');
    expect(result.exitCode).toBe(0);
  });

  test('JSON format output is valid', async () => {
    validPlugin(dir);
    const result = await runCli(['report', dir, '--format', 'json']);
    const data = JSON.parse(result.stdout) as {
      plugin: { name: string };
      diagnostics: unknown[];
      summary: { counts: Record<string, number> };
      compatibility: unknown[];
    };
    expect(data.plugin.name).toBe('valid-plugin');
    expect(data.diagnostics).toEqual([]);
    expect(data.summary.counts.error).toBe(0);
    expect(data.compatibility).toHaveLength(5);
  });

  test('Markdown format output is valid', async () => {
    validPlugin(dir);
    const result = await runCli(['report', dir, '--format', 'markdown']);
    expect(result.stdout).toContain('# Agent Plugin Doctor Report');
    expect(result.stdout).toContain('## Plugin');
    expect(result.stdout).toContain('## Compatibility');
    expect(result.stdout).toContain('| VS Code | ✓ Compatible |');
  });

  test('--output writes to file', async () => {
    validPlugin(dir);
    const outFile = join(dir, 'report.json');
    const result = await runCli([
      'report',
      dir,
      '--format',
      'json',
      '--output',
      outFile,
    ]);
    expect(result.stdout).toContain('Report written to');

    const written = readFile(dir, 'report.json');
    expect(written).not.toBeNull();
    // The file contains valid JSON report data.
    const data = JSON.parse(written as string) as { plugin: { name: string } };
    expect(data.plugin.name).toBe('valid-plugin');
  });

  test('file output matches stdout', async () => {
    validPlugin(dir);
    const toStdout = await runCli(['report', dir, '--format', 'markdown']);
    const outFile = join(dir, 'report.md');
    await runCli(['report', dir, '--format', 'markdown', '--output', outFile]);

    const written = readFile(dir, 'report.md');
    expect(written).toBe(toStdout.stdout);
  });

  test('report exit code reflects diagnostics', async () => {
    errorPlugin(dir);
    const result = await runCli(['report', dir, '--format', 'json']);
    expect(result.exitCode).toBe(1);
  });

  test('unknown format exits 3', async () => {
    validPlugin(dir);
    const result = await runCli(['report', dir, '--format', 'xml']);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('Unknown report format');
  });
});
