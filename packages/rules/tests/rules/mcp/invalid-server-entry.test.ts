import { describe, expect, test } from 'bun:test';
import { invalidServerEntryRule } from '../../../src/rules/mcp/invalid-server-entry.js';
import {
  byCode,
  checkRule,
  makeMcp,
  makePlugin,
} from '../../../tests/helpers.js';

describe('mcp/invalid-server-entry (DOC-3008)', () => {
  test('no diagnostic when every server entry is valid', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node' },
        remote: { type: 'sse', url: 'https://example.com/mcp' },
      }),
    });
    expect(checkRule(invalidServerEntryRule, plugin)).toEqual([]);
  });

  test('each null entry is reported as an error diagnostic', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        good: { type: 'stdio', command: 'node' },
        bad: null, // preserved invalid entry (schema violation)
        worse: null, // preserved invalid entry (command traversal)
      }),
    });
    const diagnostics = checkRule(invalidServerEntryRule, plugin);
    expect(byCode(diagnostics, 'DOC-3008')).toHaveLength(2);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].category).toBe('mcp');
    expect(diagnostics[0].file).toBe('./mcp.json');
    expect(diagnostics[0].message).toContain('bad');
    expect(diagnostics[1].message).toContain('worse');
  });

  test('no diagnostic when mcpConfig is absent', () => {
    const plugin = makePlugin();
    expect(checkRule(invalidServerEntryRule, plugin)).toEqual([]);
  });
});
