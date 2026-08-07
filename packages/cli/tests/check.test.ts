import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  canonicalJson,
  cleanup,
  errorPlugin,
  makeTempDir,
  mixedPlugin,
  PLUGIN_SCHEMA,
  runCli,
  securityPlugin,
  validPlugin,
  warningPlugin,
  writeTree,
} from './helpers.js';

describe('check command', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    cleanup(dir);
  });

  test('valid plugin exits 0', async () => {
    validPlugin(dir);
    const result = await runCli(['check', dir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Result: No issues found');
  });

  test('invalid plugin exits 1', async () => {
    errorPlugin(dir);
    const result = await runCli(['check', dir]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DOC-3006');
  });

  test('malformed skill exits 1 with a parser diagnostic, not 3', async () => {
    // A skill with unparseable frontmatter must surface as a validation error
    // (DOC-2099, exit 1) instead of being silently dropped or failing the tool.
    writeTree(dir, {
      'plugin.json': canonicalJson({
        $schema: PLUGIN_SCHEMA,
        name: 'bad-skill',
      }),
      'skills/good/SKILL.md':
        '---\nname: good\ndescription: Good skill\n---\nBody\n',
      'skills/bad/SKILL.md': 'no frontmatter here',
    });
    const result = await runCli(['check', dir]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DOC-2099');
    expect(result.stdout).toContain('skills/bad/SKILL.md');
  });

  test('security issue exits 2', async () => {
    securityPlugin(dir);
    const result = await runCli(['check', dir]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('DOC-4003');
  });

  test('missing directory exits 3', async () => {
    const missing = join(dir, 'does-not-exist');
    const result = await runCli(['check', missing]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('does not exist');
  });

  test('JSON output is valid', async () => {
    validPlugin(dir);
    const result = await runCli(['check', dir, '--json']);
    const data = JSON.parse(result.stdout) as {
      plugin: { name: string };
      diagnostics: unknown[];
      summary: { counts: Record<string, number> };
      compatibility: unknown[];
    };
    expect(data.plugin.name).toBe('valid-plugin');
    expect(data.diagnostics).toEqual([]);
    expect(data.summary.counts.critical).toBe(0);
    expect(data.compatibility).toHaveLength(5);
    expect(result.exitCode).toBe(0);
  });

  test('Markdown output is valid', async () => {
    validPlugin(dir);
    const result = await runCli(['check', dir, '--markdown']);
    expect(result.stdout).toContain('# Agent Plugin Doctor Report');
    expect(result.stdout).toContain('| Client | Status |');
    expect(result.stdout).toContain('✓ Compatible');
  });

  test('--strict treats warnings as errors', async () => {
    warningPlugin(dir);
    const relaxed = await runCli(['check', dir]);
    expect(relaxed.exitCode).toBe(0);

    const strict = await runCli(['check', dir, '--strict']);
    expect(strict.exitCode).toBe(1);
    expect(strict.stdout).toContain('DOC-1004');
  });

  test('--rule filters rules correctly', async () => {
    mixedPlugin(dir);
    const result = await runCli([
      'check',
      dir,
      '--rule',
      'manifest-unknown-fields',
      '--json',
    ]);
    const data = JSON.parse(result.stdout) as {
      diagnostics: { code: string }[];
    };
    const codes = data.diagnostics.map((d) => d.code);
    expect(codes).toContain('DOC-1004');
    expect(codes).not.toContain('DOC-3006');
    // With only a warning selected, the plugin passes.
    expect(result.exitCode).toBe(0);
  });

  test('--exclude-rule excludes rules correctly', async () => {
    mixedPlugin(dir);
    const result = await runCli([
      'check',
      dir,
      '--exclude-rule',
      'mcp-header-validation',
      '--json',
    ]);
    const data = JSON.parse(result.stdout) as {
      diagnostics: { code: string }[];
    };
    const codes = data.diagnostics.map((d) => d.code);
    expect(codes).not.toContain('DOC-3006');
    expect(codes).toContain('DOC-1004');
  });

  test('--verbose adds rule details to human output', async () => {
    errorPlugin(dir);
    const result = await runCli(['check', dir, '--verbose', '--no-color']);
    expect(result.stdout).toContain('Rule: mcp-header-validation');
  });
});
