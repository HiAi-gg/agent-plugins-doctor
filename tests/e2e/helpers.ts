// Shared helpers for end-to-end CLI tests (tests/e2e).
// E2E tests spawn the real `agent-plugins-doctor` binary as a subprocess and
// run it against the on-disk fixture plugins, so they verify the shipped CLI
// contract (exit codes, output formats, filesystem behavior).

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Repository root (two levels up from tests/e2e). */
export const REPO_ROOT = resolve(import.meta.dir, '..', '..');

/** The actual CLI binary shipped in packages/cli/bin. */
export const CLI_BIN = join(
  REPO_ROOT,
  'packages',
  'cli',
  'bin',
  'agent-plugins-doctor',
);

/** Directory containing the on-disk plugin fixtures. */
export const FIXTURES_DIR = join(REPO_ROOT, 'tests', 'fixtures');

/** Absolute path to a fixture plugin directory. */
export function fixturePath(...parts: string[]): string {
  return join(FIXTURES_DIR, ...parts);
}

export function makeTempDir(prefix = 'doctor-e2e-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Copy a fixture plugin (relative path under tests/fixtures) to `dest`. */
export function copyFixture(relPath: string, dest: string): void {
  cpSync(fixturePath(relPath), dest, { recursive: true });
}

export function readFile(root: string, relPath: string): string | null {
  const full = join(root, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the real CLI binary as a subprocess and capture stdout, stderr, and the
 * process exit code. The binary is executed with the bun runtime (the shebang
 * is `#!/usr/bin/env bun`) so resolution is identical to running it directly.
 */
export async function runCli(
  args: string[],
  cwd: string = REPO_ROOT,
): Promise<CliResult> {
  const proc = Bun.spawn({
    cmd: [process.execPath, CLI_BIN, ...args],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}
