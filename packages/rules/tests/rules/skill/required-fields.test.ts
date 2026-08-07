import { describe, expect, test } from 'bun:test';
import { requiredFieldsRule } from '../../../src/rules/skill/required-fields.js';
import {
  byCode,
  checkRule,
  makePlugin,
  makeSkill,
} from '../../../tests/helpers.js';

describe('skill/required-fields (DOC-2002)', () => {
  test('no diagnostic when name and description are present', () => {
    const plugin = makePlugin({ skills: [makeSkill()] });
    expect(checkRule(requiredFieldsRule, plugin)).toEqual([]);
  });

  test('a missing description produces an error diagnostic', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ description: '' })],
    });
    const diagnostics = checkRule(requiredFieldsRule, plugin);
    expect(byCode(diagnostics, 'DOC-2002')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('description');
    expect(diagnostics[0].file).toBe('skills/summarize/SKILL.md');
  });

  test('a missing name produces an error diagnostic', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: '  ', directory: 'skills/summarize' })],
    });
    const diagnostics = checkRule(requiredFieldsRule, plugin);
    expect(byCode(diagnostics, 'DOC-2002')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('name');
  });

  test('each missing field is reported separately', () => {
    const plugin = makePlugin({
      skills: [
        {
          name: '',
          description: '',
          body: 'b',
          directory: 'skills/empty',
          frontmatter: { name: '', description: '' },
        },
      ],
    });
    expect(
      byCode(checkRule(requiredFieldsRule, plugin), 'DOC-2002'),
    ).toHaveLength(2);
  });
});
