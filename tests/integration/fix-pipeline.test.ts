// Integration: the fix pipeline. Validate a plugin, apply the auto-fixes with
// the rules fix engine, re-load and re-validate (the way the CLI fix command
// does), and verify improvement, dry-run safety, and idempotence.

import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '@agent-plugins-doctor/parser';
import {
  applyFixes,
  createDefaultRegistry,
  ValidationEngine,
  validatePlugin,
} from '@agent-plugins-doctor/rules';
import {
  canonicalJson,
  cleanup,
  makeTempDir,
  readFile,
  writeTree,
} from './helpers.js';

const engine = new ValidationEngine(createDefaultRegistry());

const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

/** A plugin with one fixable error: duplicate HTTP header (DOC-3006). */
function duplicateHeaderPlugin(dir: string): void {
  writeTree(dir, {
    'plugin.json': canonicalJson({ $schema: PLUGIN_SCHEMA, name: 'dup' }),
    'mcp.json': canonicalJson({
      $schema: MCP_SCHEMA,
      mcpServers: {
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer abc',
            authorization: 'Bearer xyz',
          },
        },
      },
    }),
  });
}

/** A plugin with one fixable warning: unknown manifest field (DOC-1004). */
function unknownFieldPlugin(dir: string): void {
  writeTree(dir, {
    'plugin.json': canonicalJson({
      $schema: PLUGIN_SCHEMA,
      name: 'unknown-field',
      'x-extra': 1,
    }),
  });
}

describe('fix pipeline', () => {
  test('fixable diagnostics carry an executable fix', async () => {
    const dir = makeTempDir();
    try {
      duplicateHeaderPlugin(dir);
      const { plugin } = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      const headerDiag = result.diagnostics.find((d) => d.code === 'DOC-3006');
      expect(headerDiag).toBeDefined();
      expect(headerDiag?.fix).toBeDefined();
      expect(headerDiag?.fix?.kind).toBe('replace');
      expect(headerDiag?.fix?.file).toBe('./mcp.json');
    } finally {
      cleanup(dir);
    }
  });

  test('dry-run applies nothing', async () => {
    const dir = makeTempDir();
    try {
      duplicateHeaderPlugin(dir);
      const before = readFile(dir, 'mcp.json');
      const { plugin } = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      const fixable = result.diagnostics.filter((d) => d.fix !== undefined);

      const outcome = await applyFixes(dir, fixable, { dryRun: true });
      expect(outcome.applied).toBe(fixable.length);
      expect(outcome.failed).toBe(0);
      expect(readFile(dir, 'mcp.json')).toBe(before);
    } finally {
      cleanup(dir);
    }
  });

  test('apply fixes, re-load, re-validate: improvement to clean', async () => {
    const dir = makeTempDir();
    try {
      duplicateHeaderPlugin(dir);
      const { plugin } = await loadPlugin(dir);
      const before = await validatePlugin(plugin);
      expect(before.diagnostics.length).toBeGreaterThan(0);
      expect(engine.computeExitCode(before.diagnostics)).toBe(1);

      const fixable = before.diagnostics.filter((d) => d.fix !== undefined);
      const outcome = await applyFixes(dir, fixable);
      expect(outcome.failed).toBe(0);
      expect(outcome.applied).toBeGreaterThan(0);

      // The duplicate header is gone from the file.
      const mcp = readFile(dir, 'mcp.json') ?? '';
      expect(mcp).not.toContain('authorization');
      expect(mcp).toContain('Authorization');

      // Re-load from disk (in-memory state is stale) and re-validate.
      const { plugin: reloaded } = await loadPlugin(dir);
      const after = await validatePlugin(reloaded);
      expect(after.diagnostics).toEqual([]);
      expect(engine.computeExitCode(after.diagnostics)).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  test('running the fix twice is idempotent', async () => {
    const dir = makeTempDir();
    try {
      unknownFieldPlugin(dir);
      const { plugin } = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      const fixable = result.diagnostics.filter((d) => d.fix !== undefined);
      expect(fixable.length).toBe(1);

      const first = await applyFixes(dir, fixable);
      expect(first.applied).toBe(1);

      // Second run: the target state is already reached, so nothing applies.
      const { plugin: reloaded } = await loadPlugin(dir);
      const again = await validatePlugin(reloaded);
      const stillFixable = again.diagnostics.filter((d) => d.fix !== undefined);
      expect(stillFixable).toEqual([]);

      const second = await applyFixes(dir, stillFixable);
      expect(second.applied).toBe(0);
      expect(second.failed).toBe(0);
      expect(readFile(dir, 'plugin.json')).not.toContain('x-extra');
    } finally {
      cleanup(dir);
    }
  });

  test('validatePlugin with fix:true applies fixes in one pass', async () => {
    const dir = makeTempDir();
    try {
      unknownFieldPlugin(dir);
      const { plugin } = await loadPlugin(dir);
      // The engine applies fixes during validation when options.fix is set.
      await validatePlugin(plugin, { fix: true });

      const { plugin: reloaded } = await loadPlugin(dir);
      const after = await validatePlugin(reloaded);
      expect(after.diagnostics).toEqual([]);
      expect(readFile(dir, 'plugin.json')).not.toContain('x-extra');
    } finally {
      cleanup(dir);
    }
  });
});
