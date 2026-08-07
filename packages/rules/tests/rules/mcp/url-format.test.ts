import { describe, expect, test } from 'bun:test';
import { urlFormatRule } from '../../../src/rules/mcp/url-format.js';
import {
  byCode,
  checkRule,
  makeMcp,
  makePlugin,
} from '../../../tests/helpers.js';

describe('mcp/url-format (DOC-3005)', () => {
  test('no diagnostic for absolute http/https URLs', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        a: { type: 'streamable-http', url: 'https://example.com/mcp' },
        b: { type: 'sse', url: 'http://example.com:8080/sse' },
      }),
    });
    expect(checkRule(urlFormatRule, plugin)).toEqual([]);
  });

  test('a non-URL string produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: { type: 'streamable-http', url: 'not a url' },
      }),
    });
    const diagnostics = checkRule(urlFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-3005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  test('a non-http protocol produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: { type: 'sse', url: 'ftp://example.com/mcp' },
      }),
    });
    const diagnostics = checkRule(urlFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-3005')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('protocol');
  });

  test('userinfo in the URL produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: {
          type: 'streamable-http',
          url: 'https://user:pass@example.com/mcp',
        },
      }),
    });
    const diagnostics = checkRule(urlFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-3005')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('userinfo');
  });

  test('a fragment in the URL produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp#section',
        },
      }),
    });
    const diagnostics = checkRule(urlFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-3005')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('fragment');
  });

  test('a relative URL produces an error', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({ remote: { type: 'streamable-http', url: '/mcp' } }),
    });
    expect(byCode(checkRule(urlFormatRule, plugin), 'DOC-3005')).toHaveLength(
      1,
    );
  });
});
