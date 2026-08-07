import { describe, expect, test } from 'bun:test';
import {
  bodySizeRule,
  countTokens,
} from '../../../src/rules/skill/body-size.js';
import {
  byCode,
  checkRule,
  makePlugin,
  makeSkill,
} from '../../../tests/helpers.js';

describe('skill/body-size (DOC-2006)', () => {
  test('no diagnostic for a small body', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ body: '# Title\nSmall body' })],
    });
    expect(checkRule(bodySizeRule, plugin)).toEqual([]);
  });

  test('a body at the 5000-token limit produces a warning', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ body: 'word '.repeat(5000) })],
    });
    const diagnostics = checkRule(bodySizeRule, plugin);
    expect(byCode(diagnostics, 'DOC-2006')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
  });

  test('a body over the limit reports the token count', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ body: 'word '.repeat(5001) })],
    });
    const diagnostics = checkRule(bodySizeRule, plugin);
    expect(diagnostics[0].message).toContain('5001');
  });

  test('countTokens splits on whitespace', () => {
    expect(countTokens('one two three')).toBe(3);
    expect(countTokens('')).toBe(0);
    expect(countTokens('   ')).toBe(0);
  });
});
