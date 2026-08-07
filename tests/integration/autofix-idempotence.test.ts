// Integration: every rule autofix must be deterministic, idempotent, minimal,
// and formatting-preserving. This suite drives each autofix through the real
// fix pipeline and asserts:
//
//   1. One pass fixes the plugin (applyFixes reports no failures).
//   2. Re-loading and re-validating yields no *fixable* diagnostics — the
//      fixed state is stable (idempotence).
//   3. Applying the original fixes a second time changes nothing byte-for-byte.
//   4. Two fresh copies of the same plugin converge to identical output
//      (determinism).
//
// Rules whose diagnostics can be produced from disk (via loadPlugin) are
// exercised with the full load -> validate -> apply -> reload -> validate
// loop. Rules that the parser shadows (SDK-only: DOC-1002, DOC-1006,
// DOC-1007, DOC-3003) are exercised by constructing the in-memory Plugin the
// way the SDK does, with a matching on-disk file so the fixes apply. DOC-6002
// is a factory with an empty default map, so it is exercised with a custom
// deprecation map.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type {
  Diagnostic,
  McpConfig,
  Plugin,
  PluginManifest,
} from '@agent-plugin-doctor/core';
import { loadPlugin } from '@agent-plugin-doctor/parser';
import type { FixResult } from '@agent-plugin-doctor/rules';
import { applyFixes, validatePlugin } from '@agent-plugin-doctor/rules';
import { deprecatedFieldsRule } from '../../packages/rules/src/rules/compatibility/deprecated-fields.js';
import { cleanup, makeTempDir, readFile, writeTree } from './helpers.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

function canonical(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

function makeSdkPlugin(
  rootDir: string,
  manifest: Record<string, unknown>,
  mcpConfig?: McpConfig,
): Plugin {
  return {
    rootDir,
    specVersion: '1.0.0',
    manifest: manifest as unknown as PluginManifest,
    mcpConfig,
    skills: [],
    extensions: [],
  };
}

/** Load, validate, and apply every fixable diagnostic in one pass. */
async function fixOnce(dir: string): Promise<FixResult> {
  const { plugin } = await loadPlugin(dir);
  const result = await validatePlugin(plugin);
  const fixable = result.diagnostics.filter((d) => d.fix !== undefined);
  return applyFixes(dir, fixable);
}

/** Validate a freshly loaded plugin and return the still-fixable diagnostics. */
async function stillFixable(dir: string): Promise<Diagnostic[]> {
  const { plugin } = await loadPlugin(dir);
  const result = await validatePlugin(plugin);
  return result.diagnostics.filter((d) => d.fix !== undefined);
}

/**
 * Full disk pipeline idempotence: apply fixes, then assert that a reloaded
 * plugin has nothing left to fix and that a second application is a no-op.
 */
async function expectDiskIdempotent(dir: string): Promise<void> {
  const first = await fixOnce(dir);
  expect(first.failed).toBe(0);
  const fixable2 = await stillFixable(dir);
  expect(fixable2, 'no fixable diagnostics remain after one pass').toEqual([]);
  const second = await applyFixes(dir, fixable2);
  expect(second.applied).toBe(0);
  expect(second.failed).toBe(0);
}

/**
 * SDK-path idempotence: apply the given (pre-computed) fixes, assert the file
 * changed, then assert that applying the same fixes again changes nothing and
 * that re-validating the same in-memory plugin produces no fixable
 * diagnostics (a stale model must not keep offering fixes).
 */
async function expectSdkIdempotent(
  dir: string,
  diagnostics: Diagnostic[],
  files: string[],
): Promise<void> {
  const snapshot = (): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    for (const file of files) out[file] = readFile(dir, file);
    return out;
  };
  const before = snapshot();
  const first = await applyFixes(dir, diagnostics);
  expect(first.failed).toBe(0);
  expect(first.applied).toBeGreaterThan(0);
  const afterFirst = snapshot();
  expect(afterFirst).not.toEqual(before);
  const second = await applyFixes(dir, diagnostics);
  expect(second.applied).toBe(0);
  expect(second.failed).toBe(0);
  expect(snapshot()).toEqual(afterFirst);
}

/** Recursively collect every file in a directory as relative path -> text. */
function collectTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    const abs = join(dir, rel);
    if (statSync(abs).isDirectory()) {
      for (const entry of readdirSync(abs)) walk(join(rel, entry));
    } else {
      out[rel] = readFileSync(abs, 'utf8');
    }
  };
  walk('');
  return out;
}

/** Determinism: two fresh copies of the same plugin must converge identically. */
async function expectDeterministic(
  files: Record<string, string>,
): Promise<void> {
  const a = makeTempDir();
  const b = makeTempDir();
  try {
    writeTree(a, files);
    writeTree(b, files);
    await fixOnce(a);
    await fixOnce(b);
    expect(collectTree(a)).toEqual(collectTree(b));
  } finally {
    cleanup(a);
    cleanup(b);
  }
}

describe('autofix idempotence', () => {
  // --- Disk-reachable rules: full load -> validate -> apply -> reload loop ---

  test('DOC-1004 unknown-fields removal is idempotent', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'unknown-field',
          description: 'd',
          'x-extra': 1,
        }),
      });
      await expectDiskIdempotent(dir);
      const manifest = readFile(dir, 'plugin.json');
      expect(manifest).not.toContain('x-extra');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-2001 skill-name-match rename is idempotent', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
        }),
        'skills/summarizer/SKILL.md':
          '---\nname: summarize\ndescription: d\n---\n# Body\n',
      });
      await expectDiskIdempotent(dir);
      expect(readFile(dir, 'skills/summarize/SKILL.md')).not.toBeNull();
      expect(readFile(dir, 'skills/summarizer/SKILL.md')).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-2005 allowed-tools whitespace normalization is idempotent', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
        }),
        'skills/tool-test/SKILL.md':
          '---\nname: tool-test\ndescription: d\nallowed-tools: Bash,  Read\n---\n# B\n',
      });
      await expectDiskIdempotent(dir);
      // The whitespace is normalized; the comma artifact warning remains but
      // carries no fix (fixing the artifact would change semantics).
      const fixed = readFile(dir, 'skills/tool-test/SKILL.md');
      expect(fixed).toContain('allowed-tools: Bash, Read');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-3006 duplicate-header removal is idempotent', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({ $schema: PLUGIN_SCHEMA, name: 'p' }),
        'mcp.json': canonical({
          $schema: MCP_SCHEMA,
          mcpServers: {
            remote: {
              type: 'streamable-http',
              url: 'https://example.com/mcp',
              headers: { Authorization: 'first', authorization: 'second' },
            },
          },
        }),
      });
      await expectDiskIdempotent(dir);
      const mcp = readFile(dir, 'mcp.json') ?? '';
      expect(mcp).not.toContain('authorization');
      expect(mcp).toContain('Authorization');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-5002 skill-directory-name rename is idempotent', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
        }),
        'skills/Bad-Name/SKILL.md':
          '---\nname: good-name\ndescription: d\n---\n# Body\n',
      });
      await expectDiskIdempotent(dir);
      expect(readFile(dir, 'skills/good-name/SKILL.md')).not.toBeNull();
      expect(readFile(dir, 'skills/Bad-Name/SKILL.md')).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-7001 json-formatting reformat is idempotent', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json':
          JSON.stringify(
            { $schema: PLUGIN_SCHEMA, name: 'p', description: 'd' },
            null,
            4,
          ) + '\n',
      });
      await expectDiskIdempotent(dir);
      expect(readFile(dir, 'plugin.json')).toBe(
        canonical({ $schema: PLUGIN_SCHEMA, name: 'p', description: 'd' }),
      );
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-7002 frontmatter-style normalization is idempotent', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
        }),
        'skills/s1/SKILL.md':
          '---\r\nname: s1\r\ndescription: d\r\n---\r\n# Body\r\n',
      });
      await expectDiskIdempotent(dir);
      const fixed = readFile(dir, 'skills/s1/SKILL.md') ?? '';
      expect(fixed).not.toContain('\r');
      // The markdown body is preserved byte-for-byte.
      expect(fixed).toContain('# Body');
    } finally {
      cleanup(dir);
    }
  });

  // --- SDK-only rules: in-memory plugin + byte-level double-apply ---

  test('DOC-1002 name-pattern normalization is idempotent (SDK path)', async () => {
    const dir = makeTempDir();
    try {
      // Odd spacing around the key exercises the whitespace-tolerant fix.
      writeTree(dir, {
        'plugin.json':
          '{\n  "$schema": ' +
          JSON.stringify(PLUGIN_SCHEMA) +
          ',\n  "name" :  "My Plugin!",\n  "description": "d"\n}\n',
      });
      const plugin = makeSdkPlugin(dir, {
        $schema: PLUGIN_SCHEMA,
        name: 'My Plugin!',
        description: 'd',
      });
      // Exclude the JSON-formatting rule so the targeted name fix is isolated
      // (its whitespace tolerance and format preservation are under test).
      const result = await validatePlugin(plugin, {
        excludeRules: ['format-json-formatting'],
      });
      const fixable = result.diagnostics.filter((d) => d.fix !== undefined);
      expect(fixable.map((d) => d.code)).toContain('DOC-1002');
      await expectSdkIdempotent(dir, fixable, ['plugin.json']);
      // Only the name value changed; spacing elsewhere is preserved.
      const fixed = readFile(dir, 'plugin.json') ?? '';
      expect(fixed).toContain('"name" :  "my-plugin"');
      expect(fixed).toContain('"description": "d"');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-1006 author-strictness removal is idempotent (SDK path)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
          author: { name: 'A', phone: '555' },
        }),
      });
      const plugin = makeSdkPlugin(dir, {
        $schema: PLUGIN_SCHEMA,
        name: 'p',
        description: 'd',
        author: { name: 'A', phone: '555' },
      });
      const result = await validatePlugin(plugin);
      const fixable = result.diagnostics.filter((d) => d.fix !== undefined);
      expect(fixable.map((d) => d.code)).toContain('DOC-1006');
      await expectSdkIdempotent(dir, fixable, ['plugin.json']);
      const fixed = readFile(dir, 'plugin.json') ?? '';
      expect(fixed).not.toContain('phone');
      expect(fixed).toContain('"name": "A"');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-1007 schema-match rewrite is idempotent (SDK path)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: 'https://example.com/wrong-schema.json',
          name: 'p',
          description: 'd',
        }),
      });
      const plugin = makeSdkPlugin(dir, {
        $schema: 'https://example.com/wrong-schema.json',
        name: 'p',
        description: 'd',
      });
      const result = await validatePlugin(plugin);
      const fixable = result.diagnostics.filter((d) => d.fix !== undefined);
      expect(fixable.map((d) => d.code)).toContain('DOC-1007');
      await expectSdkIdempotent(dir, fixable, ['plugin.json']);
      const fixed = readFile(dir, 'plugin.json') ?? '';
      expect(fixed).toContain(PLUGIN_SCHEMA);
      expect(fixed).not.toContain('wrong-schema');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-3003 reserved-env-key removal is idempotent (SDK path)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({ $schema: PLUGIN_SCHEMA, name: 'p' }),
        'mcp.json': canonical({
          $schema: MCP_SCHEMA,
          mcpServers: {
            local: {
              type: 'stdio',
              command: 'node',
              env: { PATH: '/usr/bin', PLUGIN_ROOT: '/x' },
            },
          },
        }),
      });
      const mcpConfig: McpConfig = {
        $schema: MCP_SCHEMA,
        mcpServers: {
          local: {
            type: 'stdio',
            command: 'node',
            env: { PATH: '/usr/bin', PLUGIN_ROOT: '/x' },
          },
        },
      };
      const plugin = makeSdkPlugin(
        dir,
        { $schema: PLUGIN_SCHEMA, name: 'p' },
        mcpConfig,
      );
      const result = await validatePlugin(plugin);
      const fixable = result.diagnostics.filter((d) => d.fix !== undefined);
      expect(fixable.map((d) => d.code)).toContain('DOC-3003');
      await expectSdkIdempotent(dir, fixable, ['mcp.json']);
      const fixed = readFile(dir, 'mcp.json') ?? '';
      expect(fixed).not.toContain('PLUGIN_ROOT');
      expect(fixed).toContain('PATH');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-6002 deprecated-fields rename is idempotent (factory)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
          legacy: { value: 1 },
        }),
      });
      const rule = deprecatedFieldsRule({
        legacy: { since: '0.9.0', replacement: 'modern' },
      });
      const plugin = makeSdkPlugin(dir, {
        $schema: PLUGIN_SCHEMA,
        name: 'p',
        description: 'd',
        legacy: { value: 1 },
      });
      const ctx = { plugin, rootDir: dir };
      const diagnostics = rule.check(ctx).map((diagnostic) => {
        const fix = rule.fix?.(ctx, diagnostic) ?? undefined;
        if (fix !== undefined) diagnostic.fix = fix;
        return diagnostic;
      });
      expect(diagnostics.map((d) => d.code)).toContain('DOC-6002');
      await expectSdkIdempotent(dir, diagnostics, ['plugin.json']);
      const fixed = readFile(dir, 'plugin.json') ?? '';
      expect(fixed).not.toContain('legacy');
      expect(fixed).toContain('"modern"');
    } finally {
      cleanup(dir);
    }
  });

  test('DOC-6002 deprecated-fields removal is idempotent (factory)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
          legacy: { value: 1 },
        }),
      });
      const rule = deprecatedFieldsRule({ legacy: { since: '0.9.0' } });
      const plugin = makeSdkPlugin(dir, {
        $schema: PLUGIN_SCHEMA,
        name: 'p',
        description: 'd',
        legacy: { value: 1 },
      });
      const ctx = { plugin, rootDir: dir };
      const diagnostics = rule.check(ctx).map((diagnostic) => {
        const fix = rule.fix?.(ctx, diagnostic) ?? undefined;
        if (fix !== undefined) diagnostic.fix = fix;
        return diagnostic;
      });
      expect(diagnostics.map((d) => d.code)).toContain('DOC-6002');
      await expectSdkIdempotent(dir, diagnostics, ['plugin.json']);
      expect(readFile(dir, 'plugin.json')).not.toContain('legacy');
    } finally {
      cleanup(dir);
    }
  });

  // --- Determinism, convergence, and regressions ---

  test('every disk autofix is deterministic: same input -> same output', async () => {
    await expectDeterministic({
      'plugin.json': canonical({
        $schema: PLUGIN_SCHEMA,
        name: 'det',
        description: 'd',
        'x-extra': 1,
      }),
    });
    await expectDeterministic({
      'plugin.json': canonical({ $schema: PLUGIN_SCHEMA, name: 'p' }),
      'mcp.json': canonical({
        $schema: MCP_SCHEMA,
        mcpServers: {
          remote: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'a', authorization: 'b' },
          },
        },
      }),
    });
    await expectDeterministic({
      'plugin.json': canonical({
        $schema: PLUGIN_SCHEMA,
        name: 'p',
        description: 'd',
      }),
      'skills/wrong/SKILL.md':
        '---\r\nname: right\ndescription: d\r\n---\r\n# Body\r\n',
    });
  });

  test('multiple fixes on the same files converge in one pass', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        // Unknown field (DOC-1004) + 4-space formatting (DOC-7001).
        'plugin.json':
          JSON.stringify(
            {
              $schema: PLUGIN_SCHEMA,
              name: 'conv',
              description: 'd',
              'x-extra': 1,
            },
            null,
            4,
          ) + '\n',
        // Duplicate headers (DOC-3006) + 4-space formatting (DOC-7001).
        'mcp.json':
          JSON.stringify(
            {
              $schema: MCP_SCHEMA,
              mcpServers: {
                remote: {
                  type: 'streamable-http',
                  url: 'https://example.com/mcp',
                  headers: { Authorization: 'a', authorization: 'b' },
                },
              },
            },
            null,
            4,
          ) + '\n',
        // Name mismatch (DOC-2001/DOC-5002 rename) + CRLF (DOC-7002) +
        // allowed-tools whitespace (DOC-2005) on the same skill.
        'skills/wrong-name/SKILL.md':
          '---\r\nname: right-name\r\ndescription: d\r\nallowed-tools: Bash,  Read\r\n---\r\n# Body\r\n',
      });
      const first = await fixOnce(dir);
      expect(first.failed).toBe(0);
      const fixable2 = await stillFixable(dir);
      expect(fixable2).toEqual([]);
      // The renamed skill file lives at its new path with normalized content.
      const moved = readFile(dir, 'skills/right-name/SKILL.md');
      expect(moved).not.toBeNull();
      expect(moved).not.toContain('\r');
      expect(moved).toContain('allowed-tools: Bash, Read');
      // JSON files are valid and canonical.
      expect(readFile(dir, 'plugin.json')).toBe(
        canonical({ $schema: PLUGIN_SCHEMA, name: 'conv', description: 'd' }),
      );
    } finally {
      cleanup(dir);
    }
  });

  test('three case-variant duplicate headers converge in one pass (regression)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({ $schema: PLUGIN_SCHEMA, name: 'p' }),
        'mcp.json': canonical({
          $schema: MCP_SCHEMA,
          mcpServers: {
            remote: {
              type: 'streamable-http',
              url: 'https://example.com/mcp',
              headers: {
                Authorization: 'first',
                authorization: 'second',
                AUTHORIZATION: 'third',
              },
            },
          },
        }),
      });
      await expectDiskIdempotent(dir);
      const mcp = readFile(dir, 'mcp.json') ?? '';
      expect(mcp).not.toContain('authorization');
      expect(mcp).not.toContain('AUTHORIZATION');
      expect(mcp).toContain('"Authorization": "first"');
    } finally {
      cleanup(dir);
    }
  });

  test('rename and content fixes on one skill converge in one pass (regression)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonical({
          $schema: PLUGIN_SCHEMA,
          name: 'p',
          description: 'd',
        }),
        // Name mismatch (rename) plus CRLF frontmatter (content fix): the
        // content fix must land in the file before the directory moves.
        'skills/wrong-name/SKILL.md':
          '---\r\nname: right-name\r\ndescription: d\r\n---\r\n# Body\r\n',
      });
      const first = await fixOnce(dir);
      expect(first.failed).toBe(0);
      expect(first.applied).toBeGreaterThan(0);
      const fixable2 = await stillFixable(dir);
      expect(fixable2).toEqual([]);
      const moved = readFile(dir, 'skills/right-name/SKILL.md');
      expect(moved).not.toBeNull();
      expect(moved).not.toContain('\r');
    } finally {
      cleanup(dir);
    }
  });

  test('formatting is preserved by targeted fixes (SDK path)', async () => {
    const dir = makeTempDir();
    try {
      // A name fix must not reformat the rest of the file: only the value
      // token of "name" changes.
      writeTree(dir, {
        'plugin.json':
          '{\n  "$schema": ' +
          JSON.stringify(PLUGIN_SCHEMA) +
          ',\n  "description": "d",\n  "name" :  "My Plugin!"\n}\n',
      });
      const plugin = makeSdkPlugin(dir, {
        $schema: PLUGIN_SCHEMA,
        name: 'My Plugin!',
        description: 'd',
      });
      const result = await validatePlugin(plugin, {
        excludeRules: ['format-json-formatting'],
      });
      const fixable = result.diagnostics.filter((d) => d.fix !== undefined);
      await applyFixes(dir, fixable);
      const fixed = readFile(dir, 'plugin.json') ?? '';
      // The odd spacing around "name" is preserved; only the value changed.
      expect(fixed).toContain('"description": "d",');
      expect(fixed).toContain('"name" :  "my-plugin"');
      expect(fixed).not.toContain('"name" :  "My Plugin!"');
    } finally {
      cleanup(dir);
    }
  });
});
