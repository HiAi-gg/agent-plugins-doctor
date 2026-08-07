import { describe, expect, test } from 'bun:test';
import { skillDirectoryNameRule } from '../../../src/rules/structure/skill-directory-name.js';
import {
  byCode,
  checkRule,
  makePlugin,
  makeSkill,
} from '../../../tests/helpers.js';

describe('structure/skill-directory-name (DOC-5002)', () => {
  test('no diagnostic for matching, well-formed directory names', () => {
    const plugin = makePlugin({
      skills: [
        makeSkill({ name: 'code-review', directory: 'skills/code-review' }),
      ],
    });
    expect(checkRule(skillDirectoryNameRule, plugin)).toEqual([]);
  });

  test('an invalid directory name produces an error diagnostic', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'x', directory: 'skills/Bad_Name' })],
    });
    const diagnostics = checkRule(skillDirectoryNameRule, plugin);
    expect(byCode(diagnostics, 'DOC-5002')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('Bad_Name');
  });

  test('a directory name that does not match the skill name produces an error', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'summarize', directory: 'skills/other' })],
    });
    const diagnostics = checkRule(skillDirectoryNameRule, plugin);
    expect(byCode(diagnostics, 'DOC-5002')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('other');
    expect(diagnostics[0].message).toContain('summarize');
  });

  test('fix renames the directory when the skill name is valid', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'summarize', directory: 'skills/other' })],
    });
    const diagnostics = checkRule(skillDirectoryNameRule, plugin);
    expect(diagnostics[0].fix?.kind).toBe('rename');
    expect(diagnostics[0].fix?.newPath).toBe('skills/summarize');
  });

  test('fix is not provided when the skill name itself is invalid', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'Bad Name', directory: 'skills/other' })],
    });
    const diagnostics = checkRule(skillDirectoryNameRule, plugin);
    expect(diagnostics[0].fix).toBeUndefined();
  });
});
