import { describe, expect, test } from 'bun:test';
import { cwdPatternRule } from '../../../src/rules/mcp/cwd-pattern.js';
import {
  byCode,
  checkRule,
  makeMcp,
  makePlugin,
} from '../../../tests/helpers.js';

describe('mcp/cwd-pattern (DOC-3004)', () => {
  test('no diagnostic for plugin-relative and variable-rooted cwd', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        a: { type: 'stdio', command: 'node', cwd: './bin' },
        b: { type: 'stdio', command: 'node', cwd: '${PLUGIN_ROOT}/bin' },
        c: { type: 'stdio', command: 'node', cwd: '${PLUGIN_DATA}' },
      }),
    });
    expect(checkRule(cwdPatternRule, plugin)).toEqual([]);
  });

  test('an absolute cwd produces a critical diagnostic (traversal)', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', cwd: '/usr/local/bin' },
      }),
    });
    const diagnostics = checkRule(cwdPatternRule, plugin);
    expect(byCode(diagnostics, 'DOC-3004')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('critical');
    expect(diagnostics[0].message).toContain('local');
  });

  test('a parent-traversal cwd produces a critical diagnostic', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', cwd: '../escape' },
      }),
    });
    const diagnostics = checkRule(cwdPatternRule, plugin);
    expect(byCode(diagnostics, 'DOC-3004')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('critical');
  });

  test('a bare relative cwd without ./ produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', cwd: 'bin' },
      }),
    });
    expect(byCode(checkRule(cwdPatternRule, plugin), 'DOC-3004')).toHaveLength(
      1,
    );
  });

  test('a HOME-relative cwd produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', cwd: '~/bin' },
      }),
    });
    expect(byCode(checkRule(cwdPatternRule, plugin), 'DOC-3004')).toHaveLength(
      1,
    );
  });

  test('a missing cwd is fine', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({ local: { type: 'stdio', command: 'node' } }),
    });
    expect(checkRule(cwdPatternRule, plugin)).toEqual([]);
  });
});
