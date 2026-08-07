// Scan-mode validation: validatePlugin accepts a parser ScanResult, merges
// the parser's parse/schema/load diagnostics with the rule diagnostics, and
// still runs raw-tree (structure/format) rules when plugin.json could not be
// loaded (scanResult.plugin is null).

import { describe, expect, test } from 'bun:test';
import { loadPlugin, scanPlugin } from '@agent-plugins-doctor/parser';
import { ValidationEngine, validatePlugin } from '../src/index.js';
import { createDefaultRegistry } from '../src/rules/index.js';
import { cleanup, makeTempDir, PLUGIN_SCHEMA, writeTree } from './helpers.js';

const GOOD_SKILL = '---\nname: good\ndescription: Good skill\n---\nBody\n';

/** Minimal valid manifest text (canonical 2-space + trailing newline). */
const MINIMAL_MANIFEST =
  JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'scan-valid' }, null, 2) +
  '\n';

describe('validatePlugin with ScanResult', () => {
  test('merges parse and rule diagnostics', async () => {
    const root = makeTempDir();
    try {
      // Valid manifest, but a broken skill and an invalid mcp.json produce
      // parser diagnostics; a stray root file is flagged by a structure rule.
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'mcp.json': '{ not valid json',
        'skills/bad/SKILL.md': 'no frontmatter here',
        'stray.log': 'not part of the plugin',
      });
      const scanResult = await scanPlugin(root);
      expect(scanResult.diagnostics.length).toBeGreaterThan(0);

      const result = await validatePlugin(scanResult);
      expect(result.diagnostics.length).toBeGreaterThan(
        scanResult.diagnostics.length,
      );
      // Parser diagnostics (ruleId "parser") are merged in, not dropped.
      expect(result.diagnostics.some((d) => d.ruleId === 'parser')).toBe(true);
      // Rule diagnostics are still produced from the partial plugin.
      expect(result.diagnostics.some((d) => d.code === 'DOC-5003')).toBe(true);
    } finally {
      cleanup(root);
    }
  });

  test('runs structure rules even when plugin is null', async () => {
    const root = makeTempDir();
    try {
      // No plugin.json: the manifest cannot load, but the tree can still be
      // inspected by raw-file structure rules.
      writeTree(root, { 'stray.txt': 'x' });
      const scanResult = await scanPlugin(root);
      expect(scanResult.plugin).toBeNull();

      const result = await validatePlugin(scanResult);
      expect(result.plugin).toBeNull();
      expect(result.diagnostics.some((d) => d.category === 'structure')).toBe(
        true,
      );
      // Rules that need the loaded plugin model are skipped, not crashed on.
      expect(result.diagnostics.some((d) => d.code === 'DOC-0000')).toBe(false);
      for (const diagnostic of result.diagnostics) {
        if (diagnostic.ruleId === 'parser') continue;
        expect([
          'structure-extra-files',
          'structure-directory-layout',
          'format-json-formatting',
        ]).toContain(diagnostic.ruleId);
      }
    } finally {
      cleanup(root);
    }
  });

  test('computes the exit code from the merged diagnostics', async () => {
    const engine = new ValidationEngine(createDefaultRegistry());

    // Clean scan: no diagnostics -> 0.
    const clean = makeTempDir();
    try {
      writeTree(clean, { 'plugin.json': MINIMAL_MANIFEST });
      const cleanResult = await validatePlugin(await scanPlugin(clean));
      expect(cleanResult.diagnostics).toEqual([]);
      expect(engine.computeExitCode(cleanResult.diagnostics)).toBe(0);
    } finally {
      cleanup(clean);
    }

    // Broken manifest: parser + structure errors -> 1.
    const broken = makeTempDir();
    try {
      writeTree(broken, { 'plugin.json': '{ invalid json' });
      const brokenResult = await validatePlugin(await scanPlugin(broken));
      expect(brokenResult.diagnostics.some((d) => d.severity === 'error')).toBe(
        true,
      );
      expect(engine.computeExitCode(brokenResult.diagnostics)).toBe(1);
    } finally {
      cleanup(broken);
    }
  });

  test('summary counts include both parse and rule diagnostics', async () => {
    const root = makeTempDir();
    try {
      // A valid manifest with a skill that fails to load: the parser emits
      // one error (DOC-2099) which must appear in the summary counts.
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'skills/bad/SKILL.md': 'no frontmatter here',
      });
      const scanResult = await scanPlugin(root);
      const result = await validatePlugin(scanResult);
      expect(result.summary.counts.error).toBe(scanResult.diagnostics.length);
      expect(result.summary.byCategory.skills).toBeGreaterThan(0);
      // Error-severity parse diagnostics make the plugin incompatible.
      expect(result.compatible).toBe(false);
    } finally {
      cleanup(root);
    }
  });

  test('preserves the partial plugin and spec version from the scan', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'skills/good/SKILL.md': GOOD_SKILL,
      });
      const scanResult = await scanPlugin(root);
      expect(scanResult.plugin).not.toBeNull();

      const result = await validatePlugin(scanResult);
      expect(result.plugin).toBe(scanResult.plugin);
      expect(result.specVersion).toBe('1.0.0');
    } finally {
      cleanup(root);
    }
  });

  test('keeps backward compatibility with a loaded Plugin', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'plugin.json': MINIMAL_MANIFEST });
      const { plugin } = await loadPlugin(root);
      const result = await validatePlugin(plugin);
      expect(result.plugin).toBe(plugin);
      expect(result.specVersion).toBe('1.0.0');
      expect(result.diagnostics).toEqual([]);
    } finally {
      cleanup(root);
    }
  });
});
