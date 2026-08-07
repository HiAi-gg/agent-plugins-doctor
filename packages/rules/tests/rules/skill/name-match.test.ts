import { describe, expect, test } from 'bun:test';
import { nameMatchRule } from '../../../src/rules/skill/name-match.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeSkill,
  makeTempDir,
  writeTree,
} from '../../../tests/helpers.js';

describe('skill/name-match (DOC-2001)', () => {
  test('no diagnostic when the name matches the directory name', () => {
    const plugin = makePlugin({ skills: [makeSkill({ name: 'summarize' })] });
    expect(checkRule(nameMatchRule, plugin)).toEqual([]);
  });

  test('a mismatched name produces an error diagnostic', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'summarize', directory: 'skills/other' })],
    });
    const diagnostics = checkRule(nameMatchRule, plugin);
    expect(byCode(diagnostics, 'DOC-2001')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].file).toBe('skills/other/SKILL.md');
    expect(diagnostics[0].message).toContain('summarize');
    expect(diagnostics[0].message).toContain('other');
  });

  test('every mismatched skill is reported', () => {
    const plugin = makePlugin({
      skills: [
        makeSkill({ name: 'a', directory: 'skills/x' }),
        makeSkill({ name: 'b', directory: 'skills/b' }),
      ],
    });
    expect(byCode(checkRule(nameMatchRule, plugin), 'DOC-2001')).toHaveLength(
      1,
    );
  });

  test('fix renames the directory to match the name', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/other/SKILL.md': '---\nname: summarize\ndescription: d\n---\n',
      });
      const plugin = makePlugin({
        rootDir: root,
        skills: [makeSkill({ name: 'summarize', directory: 'skills/other' })],
      });
      const diagnostics = checkRule(nameMatchRule, plugin, root);
      expect(diagnostics[0].fix?.kind).toBe('rename');
      expect(diagnostics[0].fix?.oldPath).toBe('skills/other');
      expect(diagnostics[0].fix?.newPath).toBe('skills/summarize');
    } finally {
      cleanup(root);
    }
  });

  test('fix is not provided for a matching skill', () => {
    const plugin = makePlugin({ skills: [makeSkill({ name: 'summarize' })] });
    expect(checkRule(nameMatchRule, plugin)).toEqual([]);
  });
});
