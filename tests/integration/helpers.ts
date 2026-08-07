// Shared helpers for cross-package integration tests (tests/integration).
// These tests exercise the real packages together: parser output feeds the
// rules engine, which feeds the report/compatibility layers.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Repository root (two levels up from tests/integration). */
export const REPO_ROOT = resolve(import.meta.dir, '..', '..');

/** Directory containing the on-disk plugin fixtures. */
export const FIXTURES_DIR = join(REPO_ROOT, 'tests', 'fixtures');

/** Absolute path to a fixture plugin directory. */
export function fixturePath(...parts: string[]): string {
  return join(FIXTURES_DIR, ...parts);
}

export function makeTempDir(prefix = 'doctor-integration-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Write a map of relative path -> content under a root directory. */
export function writeTree(root: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

/** Canonical JSON text: 2-space indentation and a trailing newline. */
export function canonicalJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

export function readFile(root: string, relPath: string): string | null {
  const full = join(root, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}
