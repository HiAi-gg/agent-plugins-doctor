import { describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { directoryLayoutRule } from '../../../src/rules/structure/directory-layout.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  writePlugin,
} from '../../../tests/helpers.js';

describe('structure/directory-layout (DOC-5001)', () => {
  test('no diagnostic when plugin.json exists at the root', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin' });
      const plugin = makePlugin({ rootDir: root });
      expect(checkRule(directoryLayoutRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('a missing plugin.json produces an error diagnostic', () => {
    const root = makeTempDir();
    try {
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(directoryLayoutRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-5001')).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].message).toContain('plugin.json');
    } finally {
      cleanup(root);
    }
  });

  test('a nonexistent root is reported', () => {
    const plugin = makePlugin({ rootDir: '/tmp/doctor-no-such-root-xyz' });
    const diagnostics = checkRule(directoryLayoutRule, plugin);
    expect(byCode(diagnostics, 'DOC-5001')).toHaveLength(1);
  });

  test('a plugin.json that is a directory is not accepted', () => {
    const root = makeTempDir();
    try {
      mkdirSync(join(root, 'plugin.json'));
      const plugin = makePlugin({ rootDir: root });
      expect(
        byCode(checkRule(directoryLayoutRule, plugin, root), 'DOC-5001'),
      ).toHaveLength(1);
    } finally {
      cleanup(root);
    }
  });
});
