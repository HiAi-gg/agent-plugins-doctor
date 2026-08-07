import { describe, expect, test } from 'bun:test';
import { namePatternRule } from '../../../src/rules/manifest/name-pattern.js';
import { byCode, checkRule, makePlugin } from '../../../tests/helpers.js';

describe('manifest/name-pattern (DOC-1002)', () => {
  test('no diagnostic for a valid name', () => {
    const plugin = makePlugin({ manifest: { name: 'my-plugin' } });
    expect(checkRule(namePatternRule, plugin)).toEqual([]);
  });

  test('uppercase characters violate the pattern', () => {
    const plugin = makePlugin({ manifest: { name: 'MyPlugin' } });
    const diagnostics = checkRule(namePatternRule, plugin);
    expect(byCode(diagnostics, 'DOC-1002')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  test('consecutive separators violate the pattern', () => {
    for (const name of [
      'my--plugin',
      'my..plugin',
      '-leading',
      'trailing-',
      '.leading',
    ]) {
      const diagnostics = checkRule(
        namePatternRule,
        makePlugin({ manifest: { name } }),
      );
      expect(byCode(diagnostics, 'DOC-1002')).toHaveLength(1);
    }
  });

  test('names longer than the spec limit are invalid', () => {
    const plugin = makePlugin({ manifest: { name: 'a'.repeat(65) } });
    expect(byCode(checkRule(namePatternRule, plugin), 'DOC-1002')).toHaveLength(
      1,
    );
  });

  test('exactly 64 characters is valid', () => {
    const plugin = makePlugin({ manifest: { name: 'a'.repeat(64) } });
    expect(checkRule(namePatternRule, plugin)).toEqual([]);
  });

  test('fix suggests a normalized name', () => {
    const plugin = makePlugin({ manifest: { name: 'My Plugin!' } });
    const diagnostics = checkRule(namePatternRule, plugin);
    expect(diagnostics[0].fix).toBeDefined();
    const fix = diagnostics[0].fix;
    expect(fix?.kind).toBe('replace');
    expect(fix?.oldText).toBe('"name": "My Plugin!"');
    expect(fix?.newText).toBe('"name": "my-plugin"');
  });

  test('no fix is provided for an unnormalizable name', () => {
    const plugin = makePlugin({ manifest: { name: '!!!' } });
    const diagnostics = checkRule(namePatternRule, plugin);
    expect(diagnostics[0].fix).toBeUndefined();
  });
});
