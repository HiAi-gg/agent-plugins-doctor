import { describe, expect, test } from 'bun:test';
import { stdioCommandRule } from '../../../src/rules/mcp/stdio-command.js';
import {
  byCode,
  checkRule,
  makeMcp,
  makePlugin,
} from '../../../tests/helpers.js';

describe('mcp/stdio-command (DOC-3002)', () => {
  test('no diagnostic for a single-token command', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', args: ['server.js'] },
      }),
    });
    expect(checkRule(stdioCommandRule, plugin)).toEqual([]);
  });

  test('a command containing whitespace produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node server.js' },
      }),
    });
    const diagnostics = checkRule(stdioCommandRule, plugin);
    expect(byCode(diagnostics, 'DOC-3002')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('single executable token');
  });

  test('a missing command produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({ local: { type: 'stdio' } }),
    });
    expect(
      byCode(checkRule(stdioCommandRule, plugin), 'DOC-3002'),
    ).toHaveLength(1);
  });

  test('an empty command produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({ local: { type: 'stdio', command: '   ' } }),
    });
    expect(
      byCode(checkRule(stdioCommandRule, plugin), 'DOC-3002'),
    ).toHaveLength(1);
  });

  test('remote servers are not checked for a command', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: { type: 'streamable-http', url: 'https://x' },
      }),
    });
    expect(checkRule(stdioCommandRule, plugin)).toEqual([]);
  });
});
