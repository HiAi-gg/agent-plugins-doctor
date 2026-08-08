import { describe, expect, test } from 'bun:test';
import {
  countDuplicateFrontmatterBlocks,
  duplicateFrontmatterRule,
} from '../../../src/rules/format/duplicate-frontmatter.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeSkill,
  makeTempDir,
  writeTree,
} from '../../../tests/helpers.js';

// Each fixture is a full SKILL.md with a valid first frontmatter block and a
// body that exercises one "is this a second frontmatter block?" case.

const SINGLE_FRONTMATTER = `---
name: test
description: Test skill
---
# Body
`;

const DUPLICATE_ADJACENT = `---
name: test
description: Test skill
---
---
name: duplicate
description: Second block
---
# Body
`;

const HORIZONTAL_RULE = `---
name: test
description: Test skill
---

---

Some prose after the horizontal rule.
`;

const THEMATIC_BREAKS = `---
name: test
description: Test skill
---
Intro text.

---

More text.

---

Final text.
`;

const CODE_FENCE = `---
name: test
description: Test skill
---

\`\`\`yaml
---
name: example
---
\`\`\`

Body after the fence.
`;

const YAML_EXAMPLE = `---
name: test
description: Test skill
---

  key: value
  name: another

Body prose with an indented YAML example.
`;

const MALFORMED_SECOND_BLOCK = `---
name: test
description: Test skill
---
---
name: malformed
description: This block never closes
Body continues after the unclosed block.
`;

const THREE_BLOCKS = `---
name: test
description: Test skill
---
---
name: second
description: Second block
---
---
name: third
description: Third block
---
# Body
`;

/** Write SKILL.md for a plugin whose single skill is `name`. */
function skillPlugin(name: string, content: string) {
  const root = makeTempDir();
  writeTree(root, { [`skills/${name}/SKILL.md`]: content });
  return {
    root,
    plugin: makePlugin({
      rootDir: root,
      skills: [makeSkill({ name, description: `${name} skill` })],
    }),
  };
}

describe('format/duplicate-frontmatter (DOC-7003)', () => {
  test('a single frontmatter block produces no diagnostic', () => {
    const { root, plugin } = skillPlugin('test', SINGLE_FRONTMATTER);
    try {
      expect(checkRule(duplicateFrontmatterRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('two adjacent frontmatter blocks produce one DOC-7003 diagnostic', () => {
    const { root, plugin } = skillPlugin('test', DUPLICATE_ADJACENT);
    try {
      const diagnostics = checkRule(duplicateFrontmatterRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-7003')).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].message).toContain('1 duplicate frontmatter block');
    } finally {
      cleanup(root);
    }
  });

  test('a horizontal rule (---) in the body produces no diagnostic', () => {
    const { root, plugin } = skillPlugin('test', HORIZONTAL_RULE);
    try {
      expect(checkRule(duplicateFrontmatterRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('multiple thematic breaks in the body produce no diagnostic', () => {
    const { root, plugin } = skillPlugin('test', THEMATIC_BREAKS);
    try {
      expect(checkRule(duplicateFrontmatterRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('--- inside a code fence in the body produces no diagnostic', () => {
    const { root, plugin } = skillPlugin('test', CODE_FENCE);
    try {
      expect(checkRule(duplicateFrontmatterRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('a YAML example in the body without delimiters produces no diagnostic', () => {
    const { root, plugin } = skillPlugin('test', YAML_EXAMPLE);
    try {
      expect(checkRule(duplicateFrontmatterRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('a malformed second block (no closing delimiter) produces a DOC-7003 diagnostic', () => {
    const { root, plugin } = skillPlugin('test', MALFORMED_SECOND_BLOCK);
    try {
      const diagnostics = checkRule(duplicateFrontmatterRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-7003')).toHaveLength(1);
      expect(diagnostics[0].message).toContain('1 duplicate frontmatter block');
    } finally {
      cleanup(root);
    }
  });

  test('three frontmatter blocks produce a single DOC-7003 diagnostic', () => {
    const { root, plugin } = skillPlugin('test', THREE_BLOCKS);
    try {
      const diagnostics = checkRule(duplicateFrontmatterRule, plugin, root);
      // Even though two blocks are duplicated, the rule reports the file
      // once: count > 0 is enough, and the message carries the total.
      expect(byCode(diagnostics, 'DOC-7003')).toHaveLength(1);
      expect(diagnostics[0].message).toContain('2 duplicate frontmatter block');
    } finally {
      cleanup(root);
    }
  });

  test('a missing SKILL.md produces no diagnostic', () => {
    const root = makeTempDir();
    try {
      const plugin = makePlugin({
        rootDir: root,
        skills: [makeSkill({ name: 'test', description: 'Test skill' })],
      });
      expect(checkRule(duplicateFrontmatterRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });
});

describe('countDuplicateFrontmatterBlocks', () => {
  test('returns 0 for a clean file', () => {
    expect(countDuplicateFrontmatterBlocks('---\nname: x\n---\nbody')).toBe(0);
  });

  test('returns 1 for a duplicate block', () => {
    const content = '---\nname: x\n---\n---\nname: y\n---\nbody';
    expect(countDuplicateFrontmatterBlocks(content)).toBe(1);
  });

  test('returns 0 when the file does not start with a delimiter', () => {
    expect(countDuplicateFrontmatterBlocks('# Heading\nbody')).toBe(0);
  });

  test('ignores Markdown horizontal rules in the body', () => {
    const content = '---\nname: x\n---\n\n---\n\nprose';
    expect(countDuplicateFrontmatterBlocks(content)).toBe(0);
  });

  test('ignores --- inside code fences', () => {
    const content = '---\nname: x\n---\n\n```\n---\nname: y\n---\n```\nbody';
    expect(countDuplicateFrontmatterBlocks(content)).toBe(0);
  });

  test('counts every block after the first', () => {
    const content = '---\na: 1\n---\n---\nb: 2\n---\n---\nc: 3\n---\nbody';
    expect(countDuplicateFrontmatterBlocks(content)).toBe(2);
  });

  test('counts a malformed block that never closes', () => {
    const content = '---\nname: x\n---\n---\nname: y\nbody';
    expect(countDuplicateFrontmatterBlocks(content)).toBe(1);
  });
});
