// E2E: `fix` command with the real CLI binary. Fixes run against temporary
// copies of fixtures so the on-disk fixtures are never mutated.

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  cleanup,
  copyFixture,
  makeTempDir,
  readFile,
  runCli,
} from './helpers.js';

describe('e2e fix command', () => {
  test('invalid-plugin: fix reports validation errors without touching files', async () => {
    const dir = makeTempDir();
    try {
      copyFixture('invalid-plugin', join(dir, 'plugin'));
      const beforePlugin = readFile(join(dir, 'plugin'), 'plugin.json');

      // Schema violations surface as DOC-1008 diagnostics (exit 1) and there
      // are no safe fixes for a manifest that could not be loaded.
      const dryRun = await runCli(['fix', join(dir, 'plugin'), '--dry-run']);
      expect(dryRun.exitCode).toBe(1);
      expect(dryRun.stdout).toContain('No fixes available.');
      expect(readFile(join(dir, 'plugin'), 'plugin.json')).toBe(beforePlugin);

      const apply = await runCli(['fix', join(dir, 'plugin'), '--yes']);
      expect(apply.exitCode).toBe(1);
      expect(readFile(join(dir, 'plugin'), 'plugin.json')).toBe(beforePlugin);

      // A follow-up check reports the same validation error.
      const check = await runCli(['check', join(dir, 'plugin')]);
      expect(check.exitCode).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  test('warning-plugin: dry-run previews fixes without changing files', async () => {
    const dir = makeTempDir();
    try {
      copyFixture('warning-plugin', join(dir, 'plugin'));
      const before = readFile(join(dir, 'plugin'), 'plugin.json');

      const result = await runCli([
        'fix',
        join(dir, 'plugin'),
        '--dry-run',
        '--no-color',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 fix available');
      expect(result.stdout).toContain('DOC-1004');
      expect(readFile(join(dir, 'plugin'), 'plugin.json')).toBe(before);
    } finally {
      cleanup(dir);
    }
  });

  test('warning-plugin: fix --yes applies the fix and re-check improves', async () => {
    const dir = makeTempDir();
    try {
      copyFixture('warning-plugin', join(dir, 'plugin'));

      const result = await runCli([
        'fix',
        join(dir, 'plugin'),
        '--yes',
        '--no-color',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Applied 1 fix');
      expect(result.stdout).toContain('no issues remaining');

      // The unknown field was removed from the manifest.
      const plugin = readFile(join(dir, 'plugin'), 'plugin.json') ?? '';
      expect(plugin).not.toContain('unknownField');

      // A follow-up check finds no issues.
      const check = await runCli(['check', join(dir, 'plugin'), '--json']);
      const data = JSON.parse(check.stdout) as { diagnostics: unknown[] };
      expect(data.diagnostics).toEqual([]);
      expect(check.exitCode).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  test('fix is idempotent: a second run has nothing left to fix', async () => {
    const dir = makeTempDir();
    try {
      copyFixture('warning-plugin', join(dir, 'plugin'));
      await runCli(['fix', join(dir, 'plugin'), '--yes']);

      const second = await runCli([
        'fix',
        join(dir, 'plugin'),
        '--yes',
        '--no-color',
      ]);
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain('No fixes available.');
    } finally {
      cleanup(dir);
    }
  });

  test('fix --json reports applied/remaining counts', async () => {
    const dir = makeTempDir();
    try {
      copyFixture('warning-plugin', join(dir, 'plugin'));
      const result = await runCli([
        'fix',
        join(dir, 'plugin'),
        '--yes',
        '--json',
      ]);
      const data = JSON.parse(result.stdout) as {
        plugin: string;
        dryRun: boolean;
        applied: number;
        failed: number;
        remaining: { count: number };
      };
      expect(data.plugin).toBe('warning-plugin');
      expect(data.dryRun).toBe(false);
      expect(data.applied).toBe(1);
      expect(data.failed).toBe(0);
      expect(data.remaining.count).toBe(0);
    } finally {
      cleanup(dir);
    }
  });
});
