import { describe, expect, test } from 'bun:test';
import { authorStrictnessRule } from '../../../src/rules/manifest/author-strictness.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  readJson,
  writePlugin,
} from '../../../tests/helpers.js';

describe('manifest/author-strictness (DOC-1006)', () => {
  test('no diagnostic when author only has allowed fields', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, {
        $schema: '',
        name: 'valid-plugin',
        author: {
          name: 'Ada',
          email: 'ada@example.com',
          url: 'https://example.com',
        },
      });
      const plugin = makePlugin({ rootDir: root });
      expect(checkRule(authorStrictnessRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('unknown author fields on disk produce error diagnostics', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, {
        $schema: '',
        name: 'valid-plugin',
        author: { name: 'Ada', phone: '555-0100' },
      });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(authorStrictnessRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-1006')).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].message).toContain('"phone"');
    } finally {
      cleanup(root);
    }
  });

  test('in-memory author is checked when no file exists on disk', () => {
    const plugin = makePlugin({
      manifest: { author: { name: 'Ada', extra: true } },
    });
    const diagnostics = checkRule(authorStrictnessRule, plugin);
    expect(byCode(diagnostics, 'DOC-1006')).toHaveLength(1);
  });

  test('fix removes the unknown author field', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, {
        $schema: '',
        name: 'valid-plugin',
        author: { name: 'Ada', phone: '555-0100', email: 'ada@example.com' },
      });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(authorStrictnessRule, plugin, root);
      const fix = diagnostics[0].fix;
      expect(fix).toBeDefined();
      const author = readJson<{ author: Record<string, unknown> }>(
        root,
        'plugin.json',
      )?.author;
      expect(author?.['phone']).toBe('555-0100');
    } finally {
      cleanup(root);
    }
  });

  test('no fix is provided when the file is missing', () => {
    const plugin = makePlugin({
      manifest: { author: { name: 'Ada', extra: true } },
    });
    const diagnostics = checkRule(authorStrictnessRule, plugin);
    expect(diagnostics[0].fix).toBeUndefined();
  });

  test('a non-object author is ignored', () => {
    const plugin = makePlugin({ manifest: { author: 'Ada' } });
    expect(checkRule(authorStrictnessRule, plugin)).toEqual([]);
  });
});
