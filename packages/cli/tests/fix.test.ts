import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanup,
  errorPlugin,
  makeTempDir,
  readFile,
  runCli,
  validPlugin,
  warningPlugin,
} from './helpers.js';

describe('fix command', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    cleanup(dir);
  });

  test('--dry-run shows fixes without applying', async () => {
    errorPlugin(dir);
    const before = readFile(dir, 'mcp.json');
    const result = await runCli(['fix', dir, '--dry-run']);

    // The preview lists the fix with its description.
    expect(result.stdout).toContain('Remove duplicate header');
    // Nothing was written to disk.
    expect(readFile(dir, 'mcp.json')).toBe(before);
  });

  test('--yes applies fixes without confirmation', async () => {
    errorPlugin(dir);
    const result = await runCli(['fix', dir, '--yes']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Applied 1 fix');
    expect(result.stdout).toContain('no issues remaining');
  });

  test('fixes are applied correctly', async () => {
    errorPlugin(dir);
    await runCli(['fix', dir, '--yes']);

    // The duplicate header member is gone from the file.
    const mcp = readFile(dir, 'mcp.json') ?? '';
    expect(mcp).not.toContain('authorization');
    expect(mcp).toContain('Authorization');

    // A follow-up check finds no diagnostics.
    const check = await runCli(['check', dir, '--json']);
    const data = JSON.parse(check.stdout) as { diagnostics: unknown[] };
    expect(data.diagnostics).toEqual([]);
    expect(check.exitCode).toBe(0);
  });

  test('re-validation after fix shows improvement', async () => {
    errorPlugin(dir);
    const result = await runCli(['fix', dir, '--yes', '--json']);
    const data = JSON.parse(result.stdout) as {
      applied: number;
      failed: number;
      remaining: { count: number };
    };
    expect(data.applied).toBe(1);
    expect(data.failed).toBe(0);
    // Before the fix there was 1 diagnostic; after re-validation there are 0.
    expect(data.remaining.count).toBe(0);
  });

  test('no fixes available exits 0', async () => {
    validPlugin(dir);
    const result = await runCli(['fix', dir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No fixes available.');
  });

  test('dry-run JSON lists the planned fixes without applying', async () => {
    errorPlugin(dir);
    const before = readFile(dir, 'mcp.json');
    const result = await runCli(['fix', dir, '--dry-run', '--json']);
    const data = JSON.parse(result.stdout) as {
      dryRun: boolean;
      fixesAvailable: number;
      fixes: { code: string; success: boolean }[];
    };
    expect(data.dryRun).toBe(true);
    expect(data.fixesAvailable).toBe(1);
    expect(data.fixes[0].code).toBe('DOC-3006');
    expect(readFile(dir, 'mcp.json')).toBe(before);
  });

  test('unknown-field warnings are fixable too', async () => {
    warningPlugin(dir);
    const result = await runCli(['fix', dir, '--yes', '--json']);
    const data = JSON.parse(result.stdout) as {
      applied: number;
      remaining: { count: number };
    };
    expect(data.applied).toBe(1);
    expect(data.remaining.count).toBe(0);
    const plugin = readFile(dir, 'plugin.json') ?? '';
    expect(plugin).not.toContain('x-extra');
  });

  test('missing directory exits 3', async () => {
    const result = await runCli(['fix', `${dir}/does-not-exist`, '--yes']);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('does not exist');
  });
});
