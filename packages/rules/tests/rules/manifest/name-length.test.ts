import { describe, expect, test } from 'bun:test';
import { nameLengthRule } from '../../../src/rules/manifest/name-length.js';
import { byCode, checkRule, makePlugin } from '../../../tests/helpers.js';

describe('manifest/name-length (DOC-1003)', () => {
  test('no diagnostic for short names', () => {
    expect(
      checkRule(nameLengthRule, makePlugin({ manifest: { name: 'short' } })),
    ).toEqual([]);
  });

  test('exactly 64 characters is allowed', () => {
    const plugin = makePlugin({ manifest: { name: 'a'.repeat(64) } });
    expect(checkRule(nameLengthRule, plugin)).toEqual([]);
  });

  test('65 characters produce an error diagnostic', () => {
    const plugin = makePlugin({ manifest: { name: 'a'.repeat(65) } });
    const diagnostics = checkRule(nameLengthRule, plugin);
    expect(byCode(diagnostics, 'DOC-1003')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('65');
  });

  test('a missing name is ignored (reported by required-fields)', () => {
    const plugin = makePlugin({ manifest: { name: undefined } });
    expect(checkRule(nameLengthRule, plugin)).toEqual([]);
  });
});
