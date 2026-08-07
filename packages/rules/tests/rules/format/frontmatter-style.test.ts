import { describe, expect, test } from 'bun:test';
import { frontmatterStyleRule } from '../../../src/rules/format/frontmatter-style.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeSkill,
  makeTempDir,
  readFile,
  writeTree,
} from '../../../tests/helpers.js';

const CANONICAL =
  '---\nname: summarize\ndescription: Summarizes things\n---\n# Body\n';

describe('format/frontmatter-style (DOC-7002)', () => {
  test('no diagnostic for canonical frontmatter', () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'skills/summarize/SKILL.md': CANONICAL });
      const plugin = makePlugin({
        rootDir: root,
        skills: [makeSkill()],
      });
      expect(checkRule(frontmatterStyleRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('CRLF line endings produce an info diagnostic', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/summarize/SKILL.md': CANONICAL.replace(/\n/g, '\r\n'),
      });
      const plugin = makePlugin({ rootDir: root, skills: [makeSkill()] });
      const diagnostics = checkRule(frontmatterStyleRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-7002')).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('info');
      expect(diagnostics[0].message).toContain('CRLF');
    } finally {
      cleanup(root);
    }
  });

  test('trailing whitespace in the frontmatter produces a diagnostic', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/summarize/SKILL.md':
          '---\nname: summarize  \ndescription: d\n---\n# Body\n',
      });
      const plugin = makePlugin({ rootDir: root, skills: [makeSkill()] });
      expect(
        byCode(checkRule(frontmatterStyleRule, plugin, root), 'DOC-7002'),
      ).toHaveLength(1);
    } finally {
      cleanup(root);
    }
  });

  test('a missing closing delimiter produces a diagnostic', () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/summarize/SKILL.md':
          '---\nname: summarize\ndescription: d\n# Body\n',
      });
      const plugin = makePlugin({ rootDir: root, skills: [makeSkill()] });
      const diagnostics = checkRule(frontmatterStyleRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-7002')).toHaveLength(1);
      expect(diagnostics[0].message).toContain('closing');
    } finally {
      cleanup(root);
    }
  });

  test('fix normalizes the frontmatter style', () => {
    const root = makeTempDir();
    try {
      const crlf = CANONICAL.replace(/\n/g, '\r\n');
      writeTree(root, { 'skills/summarize/SKILL.md': crlf });
      const plugin = makePlugin({ rootDir: root, skills: [makeSkill()] });
      const diagnostics = checkRule(frontmatterStyleRule, plugin, root);
      const fix = diagnostics[0].fix;
      expect(fix).toBeDefined();
      expect(fix?.newText).toBe(CANONICAL);
      expect(readFile(root, 'skills/summarize/SKILL.md')).toContain('\r\n');
    } finally {
      cleanup(root);
    }
  });

  test('no fix is provided when the file is missing', () => {
    const root = makeTempDir();
    try {
      const plugin = makePlugin({ rootDir: root, skills: [makeSkill()] });
      expect(checkRule(frontmatterStyleRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });
});
