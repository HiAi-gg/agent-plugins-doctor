import { describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { extraFilesRule } from '../../../src/rules/structure/extra-files.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  writeTree,
} from '../../../tests/helpers.js';

describe('structure/extra-files (DOC-5003)', () => {
  test('no diagnostic for an expected root layout', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': '{}',
        'mcp.json': '{}',
        'README.md': '# readme',
        LICENSE: 'MIT',
        'docs/guide.md': '# guide',
      });
      mkdirSync(join(root, 'com.example.client'));
      const plugin = makePlugin({ rootDir: root });
      expect(checkRule(extraFilesRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('unexpected files produce info diagnostics', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': '{}',
        'random.txt': 'hi',
        'notes.log': 'x',
      });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(extraFilesRule, plugin, root);
      const extra = byCode(diagnostics, 'DOC-5003');
      expect(extra).toHaveLength(2);
      expect(extra[0].severity).toBe('info');
      expect(extra.some((d) => d.message.includes('random.txt'))).toBe(true);
    } finally {
      cleanup(root);
    }
  });

  test('unexpected directories are reported as directories', () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'plugin.json': '{}' });
      mkdirSync(join(root, 'random-dir'));
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(extraFilesRule, plugin, root);
      const scriptDiag = byCode(diagnostics, 'DOC-5003').find((d) =>
        d.message.includes('random-dir'),
      );
      expect(scriptDiag?.message).toContain('directory');
    } finally {
      cleanup(root);
    }
  });

  test('a nonexistent root is skipped', () => {
    const plugin = makePlugin({ rootDir: '/tmp/doctor-no-such-root-xyz' });
    expect(checkRule(extraFilesRule, plugin)).toEqual([]);
  });
});
