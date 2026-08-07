import { describe, expect, test } from 'bun:test';
import { reservedEnvKeysRule } from '../../../src/rules/mcp/reserved-env-keys.js';
import {
  byCode,
  checkRule,
  cleanup,
  makeMcp,
  makePlugin,
  makeTempDir,
  readJson,
  writeTree,
} from '../../../tests/helpers.js';

function writeMcpJson(root: string, servers: Record<string, unknown>): void {
  writeTree(root, {
    'mcp.json':
      JSON.stringify({ $schema: '', mcpServers: servers }, null, 2) + '\n',
  });
}

describe('mcp/reserved-env-keys (DOC-3003)', () => {
  test('no diagnostic for ordinary env keys', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', env: { PATH: '/usr/bin' } },
      }),
    });
    expect(checkRule(reservedEnvKeysRule, plugin)).toEqual([]);
  });

  test('PLUGIN_ROOT in env produces an error diagnostic', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: {
          type: 'stdio',
          command: 'node',
          env: { PLUGIN_ROOT: '/tmp/x' },
        },
      }),
    });
    const diagnostics = checkRule(reservedEnvKeysRule, plugin);
    expect(byCode(diagnostics, 'DOC-3003')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('PLUGIN_ROOT');
  });

  test('PLUGIN_DATA also triggers a diagnostic', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: {
          type: 'stdio',
          command: 'node',
          env: { PLUGIN_DATA: '/tmp/d' },
        },
      }),
    });
    expect(
      byCode(checkRule(reservedEnvKeysRule, plugin), 'DOC-3003'),
    ).toHaveLength(1);
  });

  test('fix removes the reserved env key from the file', () => {
    const root = makeTempDir();
    try {
      writeMcpJson(root, {
        local: {
          type: 'stdio',
          command: 'node',
          env: { PATH: '/usr/bin', PLUGIN_ROOT: '/x' },
        },
      });
      const plugin = makePlugin({
        rootDir: root,
        mcpConfig: makeMcp({
          local: {
            type: 'stdio',
            command: 'node',
            env: { PATH: '/usr/bin', PLUGIN_ROOT: '/x' },
          },
        }),
      });
      const diagnostics = checkRule(reservedEnvKeysRule, plugin, root);
      expect(diagnostics[0].fix).toBeDefined();
      const config = readJson<{
        mcpServers: Record<string, { env: Record<string, string> }>;
      }>(root, 'mcp.json');
      expect(config?.mcpServers.local.env['PLUGIN_ROOT']).toBe('/x');
    } finally {
      cleanup(root);
    }
  });
});
