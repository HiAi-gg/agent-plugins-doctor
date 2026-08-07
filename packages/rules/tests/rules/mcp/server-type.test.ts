import { describe, expect, test } from 'bun:test';
import { serverTypeRule } from '../../../src/rules/mcp/server-type.js';
import {
  byCode,
  checkRule,
  makeMcp,
  makePlugin,
} from '../../../tests/helpers.js';

describe('mcp/server-type (DOC-3001)', () => {
  test('no diagnostic for supported server types', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node' },
        http: { type: 'streamable-http', url: 'https://example.com/mcp' },
        legacy: { type: 'sse', url: 'https://example.com/sse' },
      }),
    });
    expect(checkRule(serverTypeRule, plugin)).toEqual([]);
  });

  test('an unsupported type produces an error diagnostic', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({ bad: { type: 'http', url: 'https://x' } }),
    });
    const diagnostics = checkRule(serverTypeRule, plugin);
    expect(byCode(diagnostics, 'DOC-3001')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('bad');
    expect(diagnostics[0].file).toBe('./mcp.json');
  });

  test('a missing type produces an error diagnostic', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({ odd: { command: 'node' } }),
    });
    expect(byCode(checkRule(serverTypeRule, plugin), 'DOC-3001')).toHaveLength(
      1,
    );
  });

  test('no diagnostic when mcp.json is absent', () => {
    expect(checkRule(serverTypeRule, makePlugin())).toEqual([]);
  });

  test('every invalid server is reported', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        a: { type: 'weird' },
        b: { type: 'other' },
      }),
    });
    expect(byCode(checkRule(serverTypeRule, plugin), 'DOC-3001')).toHaveLength(
      2,
    );
  });
});
