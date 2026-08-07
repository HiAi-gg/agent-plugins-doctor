// E2E: exit codes with the scan-based pipeline (scanPlugin).
// Malformed user input must be a validation error (exit 1) with a parser
// diagnostic — never a tool failure (exit 3).

import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, makeTempDir, runCli } from './helpers.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

/** Write a plugin tree (relPath -> content) under root. */
function writeTree(root: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(root, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

describe('exit codes with scanPlugin', () => {
  test('malformed plugin.json exits 1, not 3', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, { 'plugin.json': '{ invalid json' });
      const result = await runCli(['check', dir, '--no-color']);
      expect(result.exitCode).toBe(1); // validation error, not tool failure
      expect(result.stdout).toContain('DOC-1008');
    } finally {
      cleanup(dir);
    }
  });

  test('malformed SKILL.md exits 1 with DOC-2099', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': JSON.stringify({
          $schema: PLUGIN_SCHEMA,
          name: 'bad-skill',
        }),
        'skills/bad/SKILL.md': 'no frontmatter here',
      });
      const result = await runCli(['check', dir, '--no-color']);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('DOC-2099');
      expect(result.stdout).toContain('skills/bad/SKILL.md');
    } finally {
      cleanup(dir);
    }
  });

  test('missing $schema exits 1 with DOC-1008', async () => {
    const dir = makeTempDir();
    try {
      // No $schema: the manifest is schema-invalid, which the parser reports
      // as a DOC-1008 manifest load error (rules cannot run on a null plugin).
      writeTree(dir, {
        'plugin.json': JSON.stringify({ name: 'no-schema' }),
      });
      const result = await runCli(['check', dir, '--no-color']);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('DOC-1008');
    } finally {
      cleanup(dir);
    }
  });

  test('inaccessible root still exits 3 (tool failure)', async () => {
    const dir = makeTempDir();
    try {
      const missing = join(dir, 'does-not-exist');
      const result = await runCli(['check', missing]);
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('does not exist');
    } finally {
      cleanup(dir);
    }
  });

  test('valid plugin still exits 0', async () => {
    const dir = makeTempDir();
    try {
      // Canonical 2-space formatting + trailing newline avoids DOC-7001.
      writeTree(dir, {
        'plugin.json':
          JSON.stringify(
            { $schema: PLUGIN_SCHEMA, name: 'clean-plugin' },
            null,
            2,
          ) + '\n',
      });
      const result = await runCli(['check', dir, '--no-color']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No issues found');
    } finally {
      cleanup(dir);
    }
  });
});
