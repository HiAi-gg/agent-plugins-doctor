import { describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { symlinkEscapeRule } from '../../../src/rules/security/symlink-escape.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeSkill,
  makeTempDir,
} from '../../../tests/helpers.js';

describe('security/symlink-escape (DOC-4002)', () => {
  test('no diagnostic for regular component directories', () => {
    const root = makeTempDir();
    try {
      mkdirSync(join(root, 'skills/summarize'), { recursive: true });
      writeFileSync(
        join(root, 'skills/summarize/SKILL.md'),
        '---\nname: x\ndescription: d\n---\n',
      );
      const plugin = makePlugin({
        rootDir: root,
        skills: [
          makeSkill({ name: 'summarize', directory: 'skills/summarize' }),
        ],
      });
      expect(checkRule(symlinkEscapeRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('a symlink escaping the plugin root is critical', () => {
    const outside = makeTempDir('doctor-outside-');
    const root = makeTempDir();
    try {
      mkdirSync(join(root, 'skills'), { recursive: true });
      symlinkSync(outside, join(root, 'skills/evil'));
      const plugin = makePlugin({
        rootDir: root,
        skills: [makeSkill({ name: 'evil', directory: 'skills/evil' })],
      });
      const diagnostics = checkRule(symlinkEscapeRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-4002')).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('critical');
      expect(diagnostics[0].message).toContain('evil');
    } finally {
      cleanup(root);
      cleanup(outside);
    }
  });

  test('a symlink inside the root is not reported', () => {
    const root = makeTempDir();
    try {
      mkdirSync(join(root, 'real'), { recursive: true });
      mkdirSync(join(root, 'skills'), { recursive: true });
      writeFileSync(
        join(root, 'real/SKILL.md'),
        '---\nname: x\ndescription: d\n---\n',
      );
      symlinkSync(join(root, 'real'), join(root, 'skills/linked'));
      const plugin = makePlugin({
        rootDir: root,
        skills: [makeSkill({ name: 'linked', directory: 'skills/linked' })],
      });
      expect(checkRule(symlinkEscapeRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('a missing plugin root is skipped conservatively', () => {
    const plugin = makePlugin({
      rootDir: '/tmp/doctor-does-not-exist-xyz',
      skills: [makeSkill()],
    });
    expect(checkRule(symlinkEscapeRule, plugin)).toEqual([]);
  });
});
