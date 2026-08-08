import { describe, expect, test } from 'bun:test';
import { pathTraversalRule } from '../../../src/rules/security/path-traversal.js';
import {
  byCode,
  checkRule,
  makeMcp,
  makePlugin,
  makeSkill,
} from '../../../tests/helpers.js';

describe('security/path-traversal (DOC-4001)', () => {
  test('no diagnostic for well-contained paths', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ directory: 'skills/summarize' })],
      extensions: [
        {
          namespace: 'com.example.client',
          data: {},
          path: 'com.example.client',
        },
      ],
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', cwd: './bin' },
      }),
    });
    expect(checkRule(pathTraversalRule, plugin)).toEqual([]);
  });

  test('a parent-traversal skill directory is critical', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'x', directory: 'skills/../escape' })],
    });
    const diagnostics = checkRule(pathTraversalRule, plugin);
    expect(byCode(diagnostics, 'DOC-4001')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('critical');
    expect(diagnostics[0].message).toContain('..');
  });

  test('an absolute extension path is critical', () => {
    const plugin = makePlugin({
      extensions: [
        { namespace: 'com.example.client', data: {}, path: '/etc/passwd' },
      ],
    });
    const diagnostics = checkRule(pathTraversalRule, plugin);
    expect(byCode(diagnostics, 'DOC-4001')).toHaveLength(1);
  });

  test('a traversing stdio cwd is critical', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', cwd: './../../x' },
      }),
    });
    const diagnostics = checkRule(pathTraversalRule, plugin);
    expect(byCode(diagnostics, 'DOC-4001')).toHaveLength(1);
    expect(diagnostics[0].file).toContain('mcp.json');
  });

  test('a traversing stdio command is critical', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: '../bin/server' },
      }),
    });
    const diagnostics = checkRule(pathTraversalRule, plugin);
    expect(byCode(diagnostics, 'DOC-4001')).toHaveLength(1);
    expect(diagnostics[0].file).toContain('command');
  });

  test('a plugin-relative stdio command is not traversal', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: './server.js' },
      }),
    });
    expect(checkRule(pathTraversalRule, plugin)).toEqual([]);
  });

  test('variable-rooted cwd is not traversal', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', cwd: '${PLUGIN_ROOT}/bin' },
      }),
    });
    expect(checkRule(pathTraversalRule, plugin)).toEqual([]);
  });

  test('every traversing path is reported', () => {
    const plugin = makePlugin({
      skills: [
        makeSkill({ name: 'a', directory: 'skills/../x' }),
        makeSkill({ name: 'b', directory: 'skills/../y' }),
      ],
    });
    expect(
      byCode(checkRule(pathTraversalRule, plugin), 'DOC-4001'),
    ).toHaveLength(2);
  });
});
