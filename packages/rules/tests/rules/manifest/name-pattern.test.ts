import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { namePatternRule } from '../../../src/rules/manifest/name-pattern.js';
import { applyFixes } from '../../../src/fixes.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  readJson,
  writePlugin,
} from '../../../tests/helpers.js';

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

  test('fix rewrites the name value in the file', async () => {
    const root = makeTempDir();
    try {
      writePlugin(root, {
        $schema: '',
        name: 'My Plugin!',
        description: 'd',
      });
      const plugin = makePlugin({
        rootDir: root,
        manifest: { name: 'My Plugin!' },
      });
      const diagnostics = checkRule(namePatternRule, plugin, root);
      expect(diagnostics[0].fix).toBeDefined();
      const fix = diagnostics[0].fix;
      expect(fix?.kind).toBe('replace');
      expect(fix?.oldText).toBe('"My Plugin!"');
      expect(fix?.newText).toBe('"my-plugin"');
      const outcome = await applyFixes(root, diagnostics);
      expect(outcome.failed).toBe(0);
      const manifest = readJson<{ name: string }>(root, 'plugin.json');
      expect(manifest?.name).toBe('my-plugin');
    } finally {
      cleanup(root);
    }
  });

  test('fix is whitespace-tolerant and leaves other members untouched', async () => {
    const root = makeTempDir();
    try {
      // "name" :  "My Plugin!" — space before the colon, two after it.
      writePlugin(root, {
        $schema: '',
        name: 'My Plugin!',
        description: 'd',
      });
      const raw = readFileSync(join(root, 'plugin.json'), 'utf8');
      writeFileSync(
        join(root, 'plugin.json'),
        raw.replace('"name": "My Plugin!"', '"name" :  "My Plugin!"'),
      );
      const plugin = makePlugin({
        rootDir: root,
        manifest: { name: 'My Plugin!', description: 'd' },
      });
      const diagnostics = checkRule(namePatternRule, plugin, root);
      expect(diagnostics[0].fix).toBeDefined();
      const outcome = await applyFixes(root, diagnostics);
      expect(outcome.failed).toBe(0);
      const manifest = readJson<{
        name: string;
        description: string;
      }>(root, 'plugin.json');
      expect(manifest?.name).toBe('my-plugin');
      expect(manifest?.description).toBe('d');
    } finally {
      cleanup(root);
    }
  });

  test('no fix is provided when the file is missing', () => {
    const plugin = makePlugin({ manifest: { name: 'My Plugin!' } });
    const diagnostics = checkRule(namePatternRule, plugin);
    expect(diagnostics[0].fix).toBeUndefined();
  });

  test('no fix is provided for an unnormalizable name', () => {
    const plugin = makePlugin({ manifest: { name: '!!!' } });
    const diagnostics = checkRule(namePatternRule, plugin);
    expect(diagnostics[0].fix).toBeUndefined();
  });
});
