// E2E: v0.0.3 exit code contract with the real CLI binary.
//
// 0 = valid plugin, 1 = validation errors (invalid manifest, Skill, MCP
// server, ...), 2 = security-critical findings (path traversal in an MCP
// stdio command/cwd), 3 = Doctor/tool failure (permission-denied root).
// Path-traversal fixtures must exit 2 via a critical DOC-3008 parser
// diagnostic — never 1.

import { describe, expect, test } from 'bun:test';
import { chmodSync } from 'node:fs';
import { fixturePath, makeTempDir, cleanup, runCli } from './helpers.js';

describe('v0.0.3 exit codes', () => {
  test('valid plugin → exit 0', async () => {
    const result = await runCli([
      'check',
      fixturePath('minimal-plugin'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No issues found');
  });

  test('invalid manifest → exit 1', async () => {
    const result = await runCli([
      'check',
      fixturePath('invalid-plugin'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DOC-1008');
  });

  test('invalid MCP server → exit 1', async () => {
    const result = await runCli([
      'check',
      fixturePath('mcp-per-server/mixed-valid-invalid'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DOC-3008');
  });

  test('MCP cwd traversal → exit 2 (security-critical)', async () => {
    const result = await runCli([
      'check',
      fixturePath('mcp-per-server/cwd-traversal'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('CRITICAL DOC-3008');
  });

  test('MCP command traversal → exit 2 (security-critical)', async () => {
    const result = await runCli([
      'check',
      fixturePath('mcp-per-server/command-traversal'),
      '--no-color',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('CRITICAL DOC-3008');
  });

  // Root bypasses filesystem permissions, and Windows has no POSIX mode bits,
  // so the permission-denied scenario can only be simulated on a POSIX
  // system running as a non-root user.
  const canSimulatePermissionDenied =
    process.platform !== 'win32' &&
    (typeof process.getuid !== 'function' || process.getuid() !== 0);

  test.skipIf(!canSimulatePermissionDenied)(
    'permission-denied root → exit 3 (tool failure)',
    async () => {
      const dir = makeTempDir();
      try {
        chmodSync(dir, 0o000);
        const result = await runCli(['check', dir, '--no-color']);
        expect(result.exitCode).toBe(3);
        expect(result.stderr).toContain('Permission denied');
      } finally {
        // Restore permissions so the directory can be removed.
        chmodSync(dir, 0o755);
        cleanup(dir);
      }
    },
  );
});
