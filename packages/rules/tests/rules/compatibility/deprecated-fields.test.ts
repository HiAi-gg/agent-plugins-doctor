import { describe, expect, test } from 'bun:test';
import {
  deprecatedFieldsRule,
  DEFAULT_DEPRECATED_FIELDS,
} from '../../../src/rules/compatibility/deprecated-fields.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  readJson,
  writePlugin,
} from '../../../tests/helpers.js';

const MAP = {
  legacy: { since: '1.0.0', replacement: 'modern' },
  obsolete: { since: '1.0.0' },
};

describe('compatibility/deprecated-fields (DOC-6002)', () => {
  test('v1.0.0 deprecates no fields (default map is empty)', () => {
    expect(DEFAULT_DEPRECATED_FIELDS).toEqual({});
    const plugin = makePlugin({ manifest: { legacy: 1, obsolete: 2 } });
    expect(checkRule(deprecatedFieldsRule(), plugin)).toEqual([]);
  });

  test('no diagnostic when no deprecated field is used', () => {
    const rule = deprecatedFieldsRule(MAP);
    const plugin = makePlugin({ manifest: { modern: 1 } });
    expect(checkRule(rule, plugin)).toEqual([]);
  });

  test('a deprecated field with a replacement produces a warning', () => {
    const rule = deprecatedFieldsRule(MAP);
    const plugin = makePlugin({ manifest: { legacy: 1, modern: 2 } });
    const diagnostics = checkRule(rule, plugin);
    expect(byCode(diagnostics, 'DOC-6002')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toContain('"legacy"');
    expect(diagnostics[0].message).toContain('"modern"');
  });

  test('a deprecated field without a replacement is reported', () => {
    const rule = deprecatedFieldsRule(MAP);
    const plugin = makePlugin({ manifest: { obsolete: 1 } });
    const diagnostics = checkRule(rule, plugin);
    expect(byCode(diagnostics, 'DOC-6002')).toHaveLength(1);
    expect(diagnostics[0].message).not.toContain('use');
  });

  test('fix renames the deprecated field in the file', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, {
        $schema: '',
        name: 'valid-plugin',
        legacy: 42,
        modern: 1,
      });
      const plugin = makePlugin({
        rootDir: root,
        manifest: { legacy: 42, modern: 1 },
      });
      const rule = deprecatedFieldsRule(MAP);
      const diagnostics = checkRule(rule, plugin, root);
      const fix = diagnostics[0].fix;
      expect(fix).toBeDefined();
      expect(fix?.description).toContain('legacy');
      const manifest = readJson<Record<string, unknown>>(root, 'plugin.json');
      expect(manifest?.['legacy']).toBe(42);
      expect(manifest?.['modern']).toBe(1);
    } finally {
      cleanup(root);
    }
  });

  test('fix removes a deprecated field without a replacement', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin', obsolete: 1 });
      const plugin = makePlugin({ rootDir: root, manifest: { obsolete: 1 } });
      const rule = deprecatedFieldsRule(MAP);
      const diagnostics = checkRule(rule, plugin, root);
      const removal = byCode(diagnostics, 'DOC-6002').find((d) =>
        d.message.includes('obsolete'),
      );
      expect(removal?.fix?.newText).toBe('');
    } finally {
      cleanup(root);
    }
  });
});
