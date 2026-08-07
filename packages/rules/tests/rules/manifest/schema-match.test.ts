import { describe, expect, test } from 'bun:test';
import { schemaMatchRule } from '../../../src/rules/manifest/schema-match.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  readJson,
  writePlugin,
  PLUGIN_SCHEMA,
} from '../../../tests/helpers.js';

const WRONG_SCHEMA = 'https://example.com/wrong-schema.json';

describe('manifest/schema-match (DOC-1007)', () => {
  test('no diagnostic when $schema matches the expected URL', () => {
    const plugin = makePlugin({ manifest: { $schema: PLUGIN_SCHEMA } });
    expect(checkRule(schemaMatchRule, plugin)).toEqual([]);
  });

  test('a mismatched $schema produces an error diagnostic', () => {
    const plugin = makePlugin({ manifest: { $schema: WRONG_SCHEMA } });
    const diagnostics = checkRule(schemaMatchRule, plugin);
    expect(byCode(diagnostics, 'DOC-1007')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain(PLUGIN_SCHEMA);
    expect(diagnostics[0].message).toContain(WRONG_SCHEMA);
  });

  test('an unknown spec version is left to the spec-version rule', () => {
    const plugin = makePlugin({
      specVersion: '2.0.0',
      manifest: { $schema: WRONG_SCHEMA },
    });
    expect(checkRule(schemaMatchRule, plugin)).toEqual([]);
  });

  test('fix updates the $schema value in the file', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: WRONG_SCHEMA, name: 'valid-plugin' });
      const plugin = makePlugin({
        rootDir: root,
        manifest: { $schema: WRONG_SCHEMA },
      });
      const diagnostics = checkRule(schemaMatchRule, plugin, root);
      expect(diagnostics[0].fix).toBeDefined();
      expect(diagnostics[0].fix?.newText).toContain(PLUGIN_SCHEMA);
      const manifest = readJson<{ $schema: string }>(root, 'plugin.json');
      expect(manifest?.$schema).toBe(WRONG_SCHEMA);
    } finally {
      cleanup(root);
    }
  });

  test('no fix is provided when the file is missing', () => {
    const plugin = makePlugin({ manifest: { $schema: WRONG_SCHEMA } });
    const diagnostics = checkRule(schemaMatchRule, plugin);
    expect(diagnostics[0].fix).toBeUndefined();
  });
});
