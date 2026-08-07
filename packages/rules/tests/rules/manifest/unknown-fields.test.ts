import { describe, expect, test } from 'bun:test';
import { unknownFieldsRule } from '../../../src/rules/manifest/unknown-fields.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  readJson,
  writePlugin,
} from '../../../tests/helpers.js';

describe('manifest/unknown-fields (DOC-1004)', () => {
  test('no diagnostic for a manifest with only permitted fields', () => {
    const plugin = makePlugin({
      manifest: { description: 'ok', version: '1.0.0' },
    });
    expect(checkRule(unknownFieldsRule, plugin)).toEqual([]);
  });

  test('unknown fields on disk produce warning diagnostics', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, {
        $schema: '',
        name: 'valid-plugin',
        'x-custom': true,
        'x-other': 1,
      });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(unknownFieldsRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-1004')).toHaveLength(2);
      for (const diagnostic of diagnostics) {
        expect(diagnostic.severity).toBe('warning');
        expect(diagnostic.file).toBe('./plugin.json');
      }
    } finally {
      cleanup(root);
    }
  });

  test('in-memory manifest is checked when no file exists on disk', () => {
    const plugin = makePlugin({ manifest: { 'x-extra': 1 } });
    const diagnostics = checkRule(unknownFieldsRule, plugin);
    expect(byCode(diagnostics, 'DOC-1004')).toHaveLength(1);
  });

  test('fix removes unknown fields from the file', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin', 'x-extra': 1 });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(unknownFieldsRule, plugin, root);
      const fix = diagnostics[0].fix;
      expect(fix).toBeDefined();
      expect(fix?.newText).toBe('');
      const manifest = readJson<Record<string, unknown>>(root, 'plugin.json');
      expect(manifest?.['x-extra']).toBe(1);
    } finally {
      cleanup(root);
    }
  });

  test('no fix is provided when the file is missing', () => {
    const plugin = makePlugin({ manifest: { 'x-extra': 1 } });
    const diagnostics = checkRule(unknownFieldsRule, plugin);
    expect(diagnostics[0].fix).toBeUndefined();
  });
});
