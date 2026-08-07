import { describe, expect, test } from 'bun:test';
import type { Diagnostic, Fix } from '@agent-plugins-doctor/core';
import { applyFixes } from '../src/fixes.js';
import { unknownFieldsRule } from '../src/rules/manifest/unknown-fields.js';
import { jsonFormattingRule } from '../src/rules/format/json-formatting.js';
import { nameMatchRule } from '../src/rules/skill/name-match.js';
import {
  CANONICAL_PLUGIN_JSON,
  cleanup,
  checkRule,
  makePlugin,
  makeSkill,
  makeTempDir,
  readFile,
  readJson,
  writeTree,
  writePlugin,
} from './helpers.js';

function diagnosticWithFix(fix: Fix): Diagnostic {
  return {
    code: 'DOC-0000',
    severity: 'error',
    message: 'test',
    ruleId: 'test-rule',
    category: 'spec',
    fix,
  };
}

describe('applyFixes', () => {
  test('a safe replace fix is applied correctly', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/summarize/SKILL.md': 'name: summarize\ndescription: d\n',
      });
      const result = await applyFixes(root, [
        diagnosticWithFix({
          kind: 'replace',
          file: 'skills/summarize/SKILL.md',
          description: 'Rewrite',
          oldText: 'name: summarize',
          newText: 'name: renamed',
        }),
      ]);
      expect(result.failed).toBe(0);
      expect(result.applied).toBe(1);
      expect(result.fixes[0].success).toBe(true);
      expect(readFile(root, 'skills/summarize/SKILL.md')).toContain(
        'name: renamed',
      );
    } finally {
      cleanup(root);
    }
  });

  test('a member removal fix removes an unknown manifest field', async () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin', 'x-extra': 1 });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(unknownFieldsRule, plugin, root);
      expect(diagnostics).toHaveLength(1);
      const result = await applyFixes(root, diagnostics);
      expect(result.failed).toBe(0);
      const manifest = readJson<Record<string, unknown>>(root, 'plugin.json');
      expect(manifest?.['x-extra']).toBeUndefined();
      expect(manifest?.name).toBe('valid-plugin');
    } finally {
      cleanup(root);
    }
  });

  test('a rename fix moves a skill directory', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'skills/wrong-name/SKILL.md':
          '---\nname: right-name\ndescription: d\n---\n',
      });
      const plugin = makePlugin({
        rootDir: root,
        skills: [
          makeSkill({ name: 'right-name', directory: 'skills/wrong-name' }),
        ],
      });
      const diagnostics = checkRule(nameMatchRule, plugin, root);
      expect(diagnostics).toHaveLength(1);
      const result = await applyFixes(root, diagnostics);
      expect(result.failed).toBe(0);
      expect(readFile(root, 'skills/right-name/SKILL.md')).not.toBeNull();
      expect(readFile(root, 'skills/wrong-name/SKILL.md')).toBeNull();
    } finally {
      cleanup(root);
    }
  });

  test('dry-run mode does not modify files', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'a.txt': 'hello world' });
      const before = readFile(root, 'a.txt');
      const result = await applyFixes(
        root,
        [
          diagnosticWithFix({
            kind: 'replace',
            file: 'a.txt',
            description: 'Rewrite',
            oldText: 'world',
            newText: 'doctor',
          }),
        ],
        { dryRun: true },
      );
      expect(result.applied).toBe(1);
      expect(result.failed).toBe(0);
      expect(readFile(root, 'a.txt')).toBe(before);
    } finally {
      cleanup(root);
    }
  });

  test('failed fixes are reported with an error', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'a.txt': 'hello' });
      // Rename onto an existing target must be refused.
      writeTree(root, { 'existing.txt': 'keep me' });
      const renameFail = await applyFixes(root, [
        diagnosticWithFix({
          kind: 'rename',
          file: 'a.txt',
          description: 'Overwrite',
          oldPath: 'a.txt',
          newPath: 'existing.txt',
        }),
      ]);
      expect(renameFail.failed).toBe(1);
      expect(renameFail.fixes[0].success).toBe(false);
      expect(renameFail.fixes[0].error).toContain('Refusing to overwrite');

      // A replace whose old text is absent fails (non-empty new text).
      const replaceFail = await applyFixes(root, [
        diagnosticWithFix({
          kind: 'replace',
          file: 'a.txt',
          description: 'Missing anchor',
          oldText: 'does not exist',
          newText: 'replacement',
        }),
      ]);
      expect(replaceFail.failed).toBe(1);
      expect(replaceFail.fixes[0].error).toContain('no longer applies');

      // A rename with a missing source and missing target fails.
      const missingSource = await applyFixes(root, [
        diagnosticWithFix({
          kind: 'rename',
          file: 'nope',
          description: 'Missing source',
          oldPath: 'nope',
          newPath: 'gone',
        }),
      ]);
      expect(missingSource.failed).toBe(1);
      expect(missingSource.fixes[0].error).toContain('does not exist');
    } finally {
      cleanup(root);
    }
  });

  test('fixes are idempotent: a second run changes nothing', async () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin', 'x-extra': 1 });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(unknownFieldsRule, plugin, root);

      const first = await applyFixes(root, diagnostics);
      const afterFirst = readFile(root, 'plugin.json');
      expect(first.applied).toBe(1);

      const second = await applyFixes(root, diagnostics);
      const afterSecond = readFile(root, 'plugin.json');
      expect(afterSecond).toBe(afterFirst); // byte-identical
      expect(second.applied).toBe(0); // nothing further to apply
      expect(second.failed).toBe(0);
      expect(
        readJson<Record<string, unknown>>(root, 'plugin.json')?.['x-extra'],
      ).toBeUndefined();
    } finally {
      cleanup(root);
    }
  });

  test('multiple fixes on the same file converge regardless of order', async () => {
    const root = makeTempDir();
    try {
      // 4-space indentation (formatting issue) plus an unknown field.
      writePlugin(
        root,
        { $schema: '', name: 'valid-plugin', 'x-extra': 1, description: 'd' },
        { indent: 4 },
      );
      const plugin = makePlugin({ rootDir: root });
      const unknownDiags = checkRule(unknownFieldsRule, plugin, root);
      const formatDiags = checkRule(jsonFormattingRule, plugin, root);
      expect(unknownDiags).toHaveLength(1);
      expect(formatDiags).toHaveLength(1);

      // Order A: removal first, then reformat.
      const rootA = makeTempDir();
      const rootB = makeTempDir();
      try {
        const textA = readFile(root, 'plugin.json') as string;
        const textB = textA;
        writeTree(rootA, { 'plugin.json': textA });
        writeTree(rootB, { 'plugin.json': textB });
        await applyFixes(rootA, [...unknownDiags, ...formatDiags]);
        await applyFixes(rootB, [...formatDiags, ...unknownDiags]);

        const outA = readFile(rootA, 'plugin.json');
        const outB = readFile(rootB, 'plugin.json');
        expect(outA).toBe(outB); // same end state
        const parsedA = JSON.parse(outA as string) as Record<string, unknown>;
        expect(parsedA['x-extra']).toBeUndefined();
        expect(outA).toMatch(/^\{/);
      } finally {
        cleanup(rootA);
        cleanup(rootB);
      }
    } finally {
      cleanup(root);
    }
  });

  test('diagnostics without a fix are ignored', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'a.txt': 'hello' });
      const noFix: Diagnostic = {
        code: 'DOC-0000',
        severity: 'error',
        message: 'no fix',
        ruleId: 'test-rule',
        category: 'spec',
      };
      const result = await applyFixes(root, [noFix]);
      expect(result.applied).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.fixes).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('fixes cannot escape the plugin root', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'a.txt': 'hello' });
      const result = await applyFixes(root, [
        diagnosticWithFix({
          kind: 'replace',
          file: '../outside.txt',
          description: 'Escape',
          oldText: 'x',
          newText: 'y',
        }),
      ]);
      expect(result.failed).toBe(1);
      expect(result.fixes[0].error).toContain('escapes plugin root');
    } finally {
      cleanup(root);
    }
  });

  test('content fixes apply before directory renames in one pass', async () => {
    const root = makeTempDir();
    try {
      // The same skill needs a frontmatter-style content fix (CRLF) and a
      // directory rename (name mismatch). Renames run last, so the content
      // fix lands in the file before the directory moves; neither fix fails
      // and the content survives at the new path.
      writeTree(root, {
        'plugin.json': CANONICAL_PLUGIN_JSON,
        'skills/wrong-name/SKILL.md':
          '---\r\nname: right-name\r\ndescription: d\r\n---\r\n# Body\r\n',
      });
      const renameDiag = diagnosticWithFix({
        kind: 'rename',
        file: 'skills/wrong-name',
        description: 'Rename directory',
        oldPath: 'skills/wrong-name',
        newPath: 'skills/right-name',
      });
      const contentDiag = diagnosticWithFix({
        kind: 'replace',
        file: 'skills/wrong-name/SKILL.md',
        description: 'Normalize frontmatter style',
        oldText:
          '---\r\nname: right-name\r\ndescription: d\r\n---\r\n# Body\r\n',
        newText: '---\nname: right-name\ndescription: d\n---\n# Body\n',
      });
      // Hand the rename first: the engine must still apply the content fix.
      const result = await applyFixes(root, [renameDiag, contentDiag]);
      expect(result.failed).toBe(0);
      expect(result.applied).toBe(2);
      const moved = readFile(root, 'skills/right-name/SKILL.md');
      expect(moved).not.toBeNull();
      expect(moved).not.toContain('\r');
      expect(readFile(root, 'skills/wrong-name/SKILL.md')).toBeNull();
    } finally {
      cleanup(root);
    }
  });
});
