// Integration: skill names accept Unicode characters per the Agent Skills
// specification. The spec allows Unicode lowercase alphanumeric characters
// (letters in any script plus digits) and hyphens; uppercase letters,
// underscores, whitespace, consecutive hyphens, and leading/trailing hyphens
// are rejected. The parser passes names through verbatim; DOC-5002
// (structure-skill-directory-name) enforces the pattern via
// SKILL_NAME_PATTERN.

import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '@agent-plugins-doctor/parser';
import { validatePlugin } from '@agent-plugins-doctor/rules';
import {
  canonicalJson,
  cleanup,
  fixturePath,
  makeTempDir,
  writeTree,
} from './helpers.js';

function byCode<T extends { code: string }>(
  diagnostics: T[],
  code: string,
): T[] {
  return diagnostics.filter((d) => d.code === code);
}

describe('Unicode skill names', () => {
  test('accepts Unicode Latin names (café)', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('unicode-skill-name'),
    );
    expect(parseDiagnostics).toEqual([]);
    expect(plugin.skills[0].name).toBe('café');
    expect(plugin.skills[0].directory).toBe('skills/café');

    const result = await validatePlugin(plugin);
    expect(byCode(result.diagnostics, 'DOC-5002')).toHaveLength(0);
    expect(
      result.diagnostics.filter((d) => d.severity === 'error'),
    ).toHaveLength(0);
  });

  test('accepts accented characters (naïve)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        'skills/naïve/SKILL.md': `---
name: naïve
description: Test
---

# Test`,
      });

      const { plugin } = await loadPlugin(dir);
      expect(plugin.skills[0].name).toBe('naïve');
      const result = await validatePlugin(plugin);
      expect(byCode(result.diagnostics, 'DOC-5002')).toHaveLength(0);
    } finally {
      cleanup(dir);
    }
  });

  test('accepts Cyrillic and CJK names (reference validator cases)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        'skills/мой-навык/SKILL.md': `---
name: мой-навык
description: Test
---

# Test`,
        'skills/技能/SKILL.md': `---
name: 技能
description: Test
---

# Test`,
      });

      const { plugin } = await loadPlugin(dir);
      expect(plugin.skills.map((s) => s.name).sort()).toEqual([
        'мой-навык',
        '技能',
      ]);
      const result = await validatePlugin(plugin);
      expect(byCode(result.diagnostics, 'DOC-5002')).toHaveLength(0);
    } finally {
      cleanup(dir);
    }
  });

  test('rejects uppercase Unicode names (lowercase only)', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        'skills/НАВЫК/SKILL.md': `---
name: НАВЫК
description: Test
---

# Test`,
      });

      const { plugin } = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      expect(byCode(result.diagnostics, 'DOC-5002')).toHaveLength(1);
    } finally {
      cleanup(dir);
    }
  });

  test('rejects invalid separators', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        'skills/bad_name/SKILL.md': `---
name: bad_name
description: Test
---

# Test`,
      });

      const { plugin } = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      const errors = byCode(result.diagnostics, 'DOC-5002');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('bad_name');
    } finally {
      cleanup(dir);
    }
  });

  test('rejects names with whitespace', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        'skills/bad name/SKILL.md': `---
name: bad name
description: Test
---

# Test`,
      });

      const { plugin } = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      expect(byCode(result.diagnostics, 'DOC-5002')).toHaveLength(1);
    } finally {
      cleanup(dir);
    }
  });

  test('enforces boundary lengths', async () => {
    const dir = makeTempDir();
    try {
      // 65 chars (too long)
      const longName = 'a'.repeat(65);
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        [`skills/${longName}/SKILL.md`]: `---
name: ${longName}
description: Test
---

# Test`,
      });

      const { plugin } = await loadPlugin(dir);
      const result = await validatePlugin(plugin);
      const errors = byCode(result.diagnostics, 'DOC-5002');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('max 64 chars');
    } finally {
      cleanup(dir);
    }
  });
});
