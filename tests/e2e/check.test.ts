// E2E: `check` command against every fixture with the real CLI binary.
// Expected exit codes come from tests/fixtures/README.md.

import { describe, expect, test } from 'bun:test';
import { fixturePath, REPO_ROOT, runCli } from './helpers.js';

// Fixture (relative to tests/fixtures) -> expected exit code.
const FIXTURE_EXITS: Record<string, number> = {
  'minimal-plugin': 0,
  'complex-plugin': 0,
  'unicode-skill-name': 0,
  // Schema-invalid manifests surface as DOC-1008 parser diagnostics (exit 1),
  // not load failures (exit 3): parse errors are validation errors now.
  'invalid-plugin': 1,
  'warning-plugin': 0,
  'security-plugin/symlink-escape': 0,
  'security-plugin/embedded-secrets': 2,
  // The traversal cwd fails the schema's cwd pattern: the entry is preserved
  // as invalid and reported as a critical DOC-3008 (security-critical, exit 2).
  'security-plugin/path-traversal': 2,
  'edge-cases/empty-plugin': 0,
  'edge-cases/huge-description': 1,
  'edge-cases/max-skills': 0,
  'edge-cases/unicode-names': 1,
  'vendor-extensions/valid-extensions': 0,
  // A non-object `extensions` field is now reported as DOC-1009 (exit 1),
  // not silently stripped (P1 #6).
  'vendor-extensions/invalid-extensions': 1,
  'non-object-extensions': 1,
  'unsupported-version': 1,
  'legacy-plugin': 1,
  'future-spec': 1,
  // Phase 12/13: simulated Builder-generated output must validate cleanly.
  'builder-generated/from-init': 0,
  'builder-generated/from-migrate-claude': 0,
  'builder-generated/from-migrate-cursor': 0,
  'builder-generated/from-create': 0,
  // Real Builder output (cloned + built from agent-plugin-builder commit
  // 7a0b9bd8) must validate cleanly too.
  'builder-generated/real-builder/init': 0,
  'builder-generated/real-builder/create-skills': 0,
  'builder-generated/real-builder/create-mcp': 0,
  'builder-generated/real-builder/migrate-claude': 0,
  'builder-generated/real-builder/migrate-cursor': 0,
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
  ); // 23 sequential CLI spawns; Windows spawns are slow (~300ms each)

  test('self-hosting: the repository validates itself cleanly', async () => {
    const result = await runCli(['check', '.', '--no-color'], REPO_ROOT);
    expect(result.stdout).toContain('Agent Plugin Doctor');
    expect(result.stdout).toContain('Plugin: agent-plugins-doctor');
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

  test('invalid-plugin is a validation error, not a load failure', async () => {
    // Schema violations in plugin.json are DOC-1008 parser diagnostics now
    // (exit 1) instead of a thrown load error (exit 3).
    const result = await runCli([
      'check',
      fixturePath('invalid-plugin'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DOC-1008');
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
