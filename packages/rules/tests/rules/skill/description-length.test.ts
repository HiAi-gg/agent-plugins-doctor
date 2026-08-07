import { describe, expect, test } from 'bun:test';
import { descriptionLengthRule } from '../../../src/rules/skill/description-length.js';
import {
  byCode,
  checkRule,
  makePlugin,
  makeSkill,
} from '../../../tests/helpers.js';

describe('skill/description-length (DOC-2003)', () => {
  test('no diagnostic for a short description', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ description: 'Short' })],
    });
    expect(checkRule(descriptionLengthRule, plugin)).toEqual([]);
  });

  test('a description of exactly 1024 characters is allowed', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ description: 'd'.repeat(1024) })],
    });
    expect(checkRule(descriptionLengthRule, plugin)).toEqual([]);
  });

  test('a description over 1024 characters produces an error', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ description: 'd'.repeat(1025) })],
    });
    const diagnostics = checkRule(descriptionLengthRule, plugin);
    expect(byCode(diagnostics, 'DOC-2003')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('1025');
  });
});
