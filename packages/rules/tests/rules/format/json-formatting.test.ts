import { describe, expect, test } from 'bun:test';
import { jsonFormattingRule } from '../../../src/rules/format/json-formatting.js';
import {
  byCode,
  checkRule,
  cleanup,
  makePlugin,
  makeTempDir,
  readFile,
  writePlugin,
  writeTree,
} from '../../../tests/helpers.js';

describe('format/json-formatting (DOC-7001)', () => {
  test('no diagnostic for canonically formatted JSON', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin' });
      const plugin = makePlugin({ rootDir: root });
      expect(checkRule(jsonFormattingRule, plugin, root)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('4-space indentation produces an info diagnostic', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin' }, { indent: 4 });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(jsonFormattingRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-7001')).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('info');
      expect(diagnostics[0].file).toBe('./plugin.json');
    } finally {
      cleanup(root);
    }
  });

  test('a missing trailing newline produces an info diagnostic', () => {
    const root = makeTempDir();
    try {
      writePlugin(
        root,
        { $schema: '', name: 'valid-plugin' },
        { trailingNewline: false },
      );
      const plugin = makePlugin({ rootDir: root });
      expect(
        byCode(checkRule(jsonFormattingRule, plugin, root), 'DOC-7001'),
      ).toHaveLength(1);
    } finally {
      cleanup(root);
    }
  });
  test('mcp.json is checked when present', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin' });
      writeTree(root, {
        'mcp.json': JSON.stringify({ $schema: '', mcpServers: {} }, null, 4),
      });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(jsonFormattingRule, plugin, root);
      expect(byCode(diagnostics, 'DOC-7001')).toHaveLength(1);
      expect(diagnostics[0].file).toBe('./mcp.json');
    } finally {
      cleanup(root);
    }
  });

  test('fix reformats the file', () => {
    const root = makeTempDir();
    try {
      writePlugin(root, { $schema: '', name: 'valid-plugin' }, { indent: 4 });
      const plugin = makePlugin({ rootDir: root });
      const diagnostics = checkRule(jsonFormattingRule, plugin, root);
      const fix = diagnostics[0].fix;
      expect(fix).toBeDefined();
      expect(fix?.newText).toBe(
        JSON.stringify({ $schema: '', name: 'valid-plugin' }, null, 2) + '\n',
      );
      expect(readFile(root, 'plugin.json')).toContain('    "$schema"');
    } finally {
      cleanup(root);
    }
  });
});
