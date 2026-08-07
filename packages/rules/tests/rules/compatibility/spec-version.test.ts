import { describe, expect, test } from 'bun:test';
import { specVersionRule } from '../../../src/rules/compatibility/spec-version.js';
import { byCode, checkRule, makePlugin } from '../../../tests/helpers.js';

describe('compatibility/spec-version (DOC-6001)', () => {
  test('no diagnostic for a supported spec version', () => {
    expect(
      checkRule(specVersionRule, makePlugin({ specVersion: '1.0.0' })),
    ).toEqual([]);
  });

  test('an unsupported spec version produces an error diagnostic', () => {
    const plugin = makePlugin({ specVersion: '9.9.9' });
    const diagnostics = checkRule(specVersionRule, plugin);
    expect(byCode(diagnostics, 'DOC-6001')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('9.9.9');
    expect(diagnostics[0].category).toBe('compatibility');
  });

  test('an empty spec version is unsupported', () => {
    const plugin = makePlugin({ specVersion: '' });
    expect(byCode(checkRule(specVersionRule, plugin), 'DOC-6001')).toHaveLength(
      1,
    );
  });
});
