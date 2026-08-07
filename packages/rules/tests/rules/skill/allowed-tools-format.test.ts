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

function writeSkillWithTools(root: string, value: string, name = 'summarize') {
  writeTree(root, {
    [`skills/${name}/SKILL.md`]: `---\nname: ${name}\ndescription: d\nallowed-tools: ${value}\n---\n`,
  });
}

describe('skill/allowed-tools-format (DOC-2005)', () => {
  test('no diagnostic for a space-separated string', () => {
    const plugin = makePlugin({ skills: [skillWithTools('read write')] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic for the spec example (scoped tools)', () => {
    const plugin = makePlugin({
      skills: [skillWithTools('Bash(git:*) Bash(jq:*) Read')],
    });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic when allowed-tools is absent', () => {
    const plugin = makePlugin({ skills: [makeSkill()] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic for a single tool name with hyphens', () => {
    const plugin = makePlugin({ skills: [skillWithTools('my-tool')] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic for leading/trailing whitespace', () => {
    const plugin = makePlugin({ skills: [skillWithTools('  read write  ')] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic for multiple spaces between tokens', () => {
    const plugin = makePlugin({ skills: [skillWithTools('read   write')] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic for comma-separated tools without spaces', () => {
    const plugin = makePlugin({ skills: [skillWithTools('bash,read')] });
    expect(checkRule(allowedToolsFormatRule, plugin)).toEqual([]);
  });

  test('empty string produces a warning without a fix', () => {
    const plugin = makePlugin({ skills: [skillWithTools('')] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].fix).toBeUndefined();
  });

  test('whitespace-only string produces a warning', () => {
    const plugin = makePlugin({ skills: [skillWithTools('   ')] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
  });

  test('comma+space separated tools produce a warning', () => {
    const plugin = makePlugin({ skills: [skillWithTools('bash, read')] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
  });

  test('an invalid tool name produces an error without a fix', () => {
    const plugin = makePlugin({ skills: [skillWithTools('read !!!')] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].fix).toBeUndefined();
  });

  test('a scoped tool without a base name produces an error', () => {
    const plugin = makePlugin({ skills: [skillWithTools('read (git:*)')] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  test('a number produces an error without a fix', () => {
    const plugin = makePlugin({ skills: [skillWithTools(42)] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].fix).toBeUndefined();
  });

  test('a boolean produces an error', () => {
    const plugin = makePlugin({ skills: [skillWithTools(true)] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  test('an object produces an error', () => {
    const plugin = makePlugin({ skills: [skillWithTools({ Read: true })] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  test('a YAML list of strings produces a warning', () => {
    const plugin = makePlugin({ skills: [skillWithTools(['read', 'write'])] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toContain('YAML list');
    expect(diagnostics[0].fix).toBeUndefined();
  });

  test('an empty array produces a warning', () => {
    const plugin = makePlugin({ skills: [skillWithTools([])] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
  });

  test('a list containing a non-string produces an error', () => {
    const plugin = makePlugin({ skills: [skillWithTools(['read', 42])] });
    const diagnostics = checkRule(allowedToolsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  test('the fix normalizes whitespace without converting the string to a list', () => {
    const root = makeTempDir();
    try {
      writeSkillWithTools(root, 'bash,  read');
      const plugin = makePlugin({
        rootDir: root,
        skills: [skillWithTools('bash,  read')],
      });
      const diagnostics = checkRule(allowedToolsFormatRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
      expect(diagnostics[0].fix).toBeDefined();
      expect(diagnostics[0].fix?.kind).toBe('replace');
      expect(diagnostics[0].fix?.newText).toBe('allowed-tools: bash, read');
      // The fix must not turn the string into a YAML list.
      expect(diagnostics[0].fix?.newText).not.toContain('\n');
    } finally {
      cleanup(root);
    }
  });

  test('a valid string with excess whitespace has no diagnostic and no fix', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/summarize/SKILL.md':
          '---\nname: summarize\ndescription: d\nallowed-tools: "read   write"\n---\n',
      });
      const plugin = makePlugin({
        rootDir: root,
        skills: [skillWithTools('read   write')],
      });
      expect(checkRule(allowedToolsFormatRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('the fix returns null for a list-form diagnostic', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/summarize/SKILL.md':
          '---\nname: summarize\ndescription: d\nallowed-tools:\n  - read\n  - write\n---\n',
      });
      const plugin = makePlugin({
        rootDir: root,
        skills: [skillWithTools(['read', 'write'])],
      });
      const diagnostics = checkRule(allowedToolsFormatRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-2005')).toHaveLength(1);
      expect(diagnostics[0].fix).toBeUndefined();
    } finally {
      cleanup(root);
    }
  });
});
