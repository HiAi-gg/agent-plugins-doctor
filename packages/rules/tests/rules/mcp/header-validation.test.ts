import { describe, expect, test } from 'bun:test';
import { headerValidationRule } from '../../../src/rules/mcp/header-validation.js';
import { applyFixes } from '../../../src/fixes.js';
import {
  byCode,
  checkRule,
  cleanup,
  makeMcp,
  makePlugin,
  makeTempDir,
  readFile,
  readJson,
  writeTree,
} from '../../../tests/helpers.js';

function writeMcpJson(root: string, servers: Record<string, unknown>): void {
  writeTree(root, {
    'mcp.json':
      JSON.stringify({ $schema: '', mcpServers: servers }, null, 2) + '\n',
  });
}

describe('mcp/header-validation (DOC-3006)', () => {
  test('no diagnostic for unique string headers', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer x', 'X-Custom': '1' },
        },
      }),
    });
    expect(checkRule(headerValidationRule, plugin)).toEqual([]);
  });

  test('case-insensitive duplicate headers produce an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'a', authorization: 'b' },
        },
      }),
    });
    const diagnostics = checkRule(headerValidationRule, plugin);
    expect(byCode(diagnostics, 'DOC-3006')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('authorization');
  });

  test('a non-string header value produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: {
          type: 'sse',
          url: 'https://example.com/sse',
          headers: { Count: 3 },
        },
      }),
    });
    const diagnostics = checkRule(headerValidationRule, plugin);
    expect(byCode(diagnostics, 'DOC-3006')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('string');
  });

  test('fix removes the duplicate header, keeping the first', () => {
    const root = makeTempDir();
    try {
      writeMcpJson(root, {
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'first', authorization: 'second' },
        },
      });
      const plugin = makePlugin({
        rootDir: root,
        mcpConfig: makeMcp({
          remote: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'first', authorization: 'second' },
          },
        }),
      });
      const diagnostics = checkRule(headerValidationRule, plugin, root);
      expect(diagnostics[0].fix).toBeDefined();
      const config = readJson<{
        mcpServers: Record<string, { headers: Record<string, string> }>;
      }>(root, 'mcp.json');
      const headers = config?.mcpServers.remote.headers;
      expect(headers?.['Authorization']).toBe('first');
      expect(headers?.['authorization']).toBe('second');
    } finally {
      cleanup(root);
    }
  });

  test('fixes for three case-variant duplicates converge in one pass', async () => {
    const root = makeTempDir();
    try {
      const headers = {
        Authorization: 'first',
        authorization: 'second',
        AUTHORIZATION: 'third',
      };
      writeMcpJson(root, {
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers,
        },
      });
      const plugin = makePlugin({
        rootDir: root,
        mcpConfig: makeMcp({
          remote: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            headers,
          },
        }),
      });
      const diagnostics = checkRule(headerValidationRule, plugin, root);
      const fixable = diagnostics.filter((d) => d.fix !== undefined);
      expect(byCode(diagnostics, 'DOC-3006')).toHaveLength(2);

      // One pass must remove BOTH duplicates (each diagnostic targets its own
      // span); a second pass is a byte-identical no-op.
      const first = await applyFixes(root, fixable);
      expect(first.failed).toBe(0);
      expect(first.applied).toBe(2);
      const afterFirst = readFile(root, 'mcp.json');
      expect(afterFirst).not.toContain('authorization');
      expect(afterFirst).not.toContain('AUTHORIZATION');

      const second = await applyFixes(root, fixable);
      expect(second.applied).toBe(0);
      expect(second.failed).toBe(0);
      expect(readFile(root, 'mcp.json')).toBe(afterFirst);
    } finally {
      cleanup(root);
    }
  });
});
