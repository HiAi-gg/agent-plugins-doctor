import { describe, expect, test } from 'bun:test';
import { compatibilityLengthRule } from '../../../src/rules/skill/compatibility-length.js';
import {
  byCode,
  checkRule,
  makePlugin,
  makeSkill,
} from '../../../tests/helpers.js';

describe('skill/compatibility-length (DOC-2004)', () => {
  test('no diagnostic when compatibility is absent', () => {
    expect(
      checkRule(compatibilityLengthRule, makePlugin({ skills: [makeSkill()] })),
    ).toEqual([]);
  });

  test('no diagnostic for a short compatibility string', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ compatibility: 'claude >= 1.0' })],
    });
    expect(checkRule(compatibilityLengthRule, plugin)).toEqual([]);
  });

  test('a compatibility string over 500 characters produces an error', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ compatibility: 'c'.repeat(501) })],
    });
    const diagnostics = checkRule(compatibilityLengthRule, plugin);
    expect(byCode(diagnostics, 'DOC-2004')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('501');
  });

  test('exactly 500 characters is allowed', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ compatibility: 'c'.repeat(500) })],
    });
    expect(checkRule(compatibilityLengthRule, plugin)).toEqual([]);
  });
});
