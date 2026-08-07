import { describe, expect, test } from 'bun:test';
import { requiredFieldsRule } from '../../../src/rules/manifest/required-fields.js';
import { byCode, checkRule, makePlugin } from '../../../tests/helpers.js';

describe('manifest/required-fields (DOC-1001)', () => {
  test('no diagnostic when $schema and name are present', () => {
    const diagnostics = checkRule(requiredFieldsRule, makePlugin());
    expect(diagnostics).toEqual([]);
  });

  test('missing name produces an error diagnostic', () => {
    const plugin = makePlugin({ manifest: { name: undefined } });
    const diagnostics = checkRule(requiredFieldsRule, plugin);
    expect(byCode(diagnostics, 'DOC-1001')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('"name"');
    expect(diagnostics[0].file).toBe('./plugin.json');
  });

  test('missing $schema produces an error diagnostic', () => {
    const plugin = makePlugin({ manifest: { $schema: undefined } });
    const diagnostics = checkRule(requiredFieldsRule, plugin);
    expect(byCode(diagnostics, 'DOC-1001')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('"$schema"');
  });

  test('empty or whitespace-only names are treated as missing', () => {
    expect(
      checkRule(requiredFieldsRule, makePlugin({ manifest: { name: '' } })),
    ).toHaveLength(1);
    expect(
      checkRule(requiredFieldsRule, makePlugin({ manifest: { name: '   ' } })),
    ).toHaveLength(1);
  });
});
