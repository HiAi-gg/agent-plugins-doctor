// E2E: `check` command against every fixture with the real CLI binary.
// Expected exit codes come from tests/fixtures/README.md.

import { describe, expect, test } from 'bun:test';
import { fixturePath, REPO_ROOT, runCli } from './helpers.js';

// Fixture (relative to tests/fixtures) -> expected exit code.
const FIXTURE_EXITS: Record<string, number> = {
  'minimal-plugin': 0,
  'complex-plugin': 0,
  'invalid-plugin': 3,
  'warning-plugin': 0,
  'security-plugin/symlink-escape': 0,
  'security-plugin/embedded-secrets': 2,
  'security-plugin/path-traversal': 0,
  'edge-cases/empty-plugin': 0,
  'edge-cases/huge-description': 1,
  'edge-cases/max-skills': 0,
  'edge-cases/unicode-names': 3,
  'vendor-extensions/valid-extensions': 0,
  'vendor-extensions/invalid-extensions': 0,
  'legacy-plugin': 3,
  'future-spec': 3,
  // Phase 12/13: simulated Builder-generated output must validate cleanly.
  'builder-generated/from-init': 0,
  'builder-generated/from-migrate-claude': 0,
  'builder-generated/from-migrate-cursor': 0,
  'builder-generated/from-create': 0,
};

describe('e2e check command', () => {
  test(
    'every fixture exits with its documented exit code',
    async () => {
      for (const [fixture, expected] of Object.entries(FIXTURE_EXITS)) {
        const result = await runCli([
          'check',
          fixturePath(fixture),
          '--no-color',
        ]);
        expect(
          result.exitCode,
          `check ${fixture}: ${result.stderr.trim()}`,
        ).toBe(expected);
      }
    },
    { timeout: 60_000 },
  ); // 18 sequential CLI spawns; Windows spawns are slow (~300ms each)

  test('self-hosting: the repository validates itself cleanly', async () => {
    const result = await runCli(['check', '.', '--no-color'], REPO_ROOT);
    expect(result.stdout).toContain('Agent Plugin Doctor');
    expect(result.stdout).toContain('Plugin: agent-plugin-doctor');
    expect(result.stdout).toContain('Result: No issues found');
    expect(result.stdout).toContain('Compatibility:');
    expect(result.exitCode).toBe(0);
  });

  test('minimal-plugin reports no diagnostics', async () => {
    const result = await runCli([
      'check',
      fixturePath('minimal-plugin'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Result: No issues found');
    expect(result.stdout).toContain('Fixes available: 0');
  });

  test('invalid-plugin is a load failure', async () => {
    const result = await runCli([
      'check',
      fixturePath('invalid-plugin'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('Failed to load plugin');
  });

  test('warning-plugin exits 0, and 1 with --strict', async () => {
    const relaxed = await runCli([
      'check',
      fixturePath('warning-plugin'),
      '--no-color',
    ]);
    expect(relaxed.exitCode).toBe(0);
    expect(relaxed.stdout).toContain('DOC-1004');

    const strict = await runCli([
      'check',
      fixturePath('warning-plugin'),
      '--strict',
      '--no-color',
    ]);
    expect(strict.exitCode).toBe(1);
  });

  test('embedded secrets exit 2 with a critical diagnostic', async () => {
    const result = await runCli([
      'check',
      fixturePath('security-plugin', 'embedded-secrets'),
      '--json',
    ]);
    expect(result.exitCode).toBe(2);
    const data = JSON.parse(result.stdout) as {
      diagnostics: { severity: string; code: string }[];
    };
    expect(data.diagnostics.some((d) => d.severity === 'critical')).toBe(true);
    expect(data.diagnostics.some((d) => d.code === 'DOC-4003')).toBe(true);
  });

  test('JSON output from check is parseable and complete', async () => {
    const result = await runCli([
      'check',
      fixturePath('minimal-plugin'),
      '--json',
    ]);
    const data = JSON.parse(result.stdout) as {
      plugin: { name: string };
      diagnostics: unknown[];
      summary: { counts: Record<string, number> };
      compatibility: unknown[];
    };
    expect(data.plugin.name).toBe('minimal-plugin');
    expect(data.diagnostics).toEqual([]);
    expect(data.summary.counts.error).toBe(0);
    expect(data.compatibility).toHaveLength(5);
    expect(result.exitCode).toBe(0);
  });
});
