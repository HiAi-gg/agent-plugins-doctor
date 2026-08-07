import { describe, expect, test } from 'bun:test';
import { allowedToolsFormatRule } from '../../../src/rules/skill/allowed-tools-format.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeSkill,
  makeTempDir,
  writeTree,
} from '../../../tests/helpers.js';

function skillWithTools(value: unknown, name = 'summarize') {
  return makeSkill({
    name,
    frontmatter: { name, description: 'd', 'allowed-tools': value as never },
  });
}

describe('skill/allowed-tools-format (DOC-2005)', () => {
  test('no diagnostic for a list of strings', () => {
    const plugin = makePlugin({
      skills: [skillWithTools(['read', 'write'])],
    });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic when allowed-tools is absent', () => {
    const plugin = makePlugin({ skills: [makeSkill()] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('an empty list is valid', () => {
    const plugin = makePlugin({ skills: [skillWithTools([])] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('a space-separated string produces an error diagnostic with a fix', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/summarize/SKILL.md':
          '---\nname: summarize\ndescription: d\nallowed-tools: read write\n---\n',
      });
      const plugin = makePlugin({
        rootDir: root,
        skills: [skillWithTools('read write')],
      });
      const diagnostics = checkRule(allowedToolsFormatRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].fix).toBeDefined();
      expect(diagnostics[0].fix?.newText).toBe(
        'allowed-tools:\n  - read\n  - write',
      );
    } finally {
      cleanup(root);
    }
  });

  test('a non-string, non-list value produces an error without a fix', () => {
    const plugin = makePlugin({ skills: [skillWithTools(42)] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].fix).toBeUndefined();
  });

  test('a list containing a non-string produces an error', () => {
    const plugin = makePlugin({ skills: [skillWithTools(['read', 42])] });
    expect(
      byCode(checkRule(allowedToolsFormatRule, plugin), 'DOC-2005'),
    ).toHaveLength(1);
  });

  test('a list containing an empty string produces an error', () => {
    const plugin = makePlugin({ skills: [skillWithTools(['read', ''])] });
    expect(
      byCode(checkRule(allowedToolsFormatRule, plugin), 'DOC-2005'),
    ).toHaveLength(1);
  });
});
