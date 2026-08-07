import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '@agent-plugins-doctor/parser';
import type { Plugin } from '@agent-plugins-doctor/core';
import {
  ValidationEngine,
  INTERNAL_ERROR_CODE,
  validatePlugin,
} from '../src/engine.js';
import { RuleRegistry } from '../src/registry.js';
import { createDefaultRegistry } from '../src/rules/index.js';
import type { Rule } from '../src/rule.js';
import {
  cleanup,
  makePlugin,
  makeTempDir,
  writeTree,
  PLUGIN_SCHEMA,
  MCP_SCHEMA,
  byCode,
} from './helpers.js';

const MCP_JSON =
  JSON.stringify(
    {
      $schema: MCP_SCHEMA,
      mcpServers: {
        local: { type: 'stdio', command: 'node', cwd: './bin' },
        remote: { type: 'streamable-http', url: 'https://example.com/mcp' },
      },
    },
    null,
    2,
  ) + '\n';

const SKILL_MD =
  '---\nname: summarize\ndescription: Summarizes things\n---\n# Summarize\nBody\n';

/** A clean, fully valid plugin on disk. */
async function cleanPlugin(): Promise<Plugin> {
  const root = makeTempDir();
  writeTree(root, {
    'plugin.json':
      JSON.stringify(
        {
          $schema: PLUGIN_SCHEMA,
          name: 'valid-plugin',
          description: 'A valid plugin',
        },
        null,
        2,
      ) + '\n',
    'mcp.json': MCP_JSON,
    'skills/summarize/SKILL.md': SKILL_MD,
  });
  const { plugin } = await loadPlugin(root);
  return plugin;
}

function throwingRule(): Rule {
  return {
    id: 'rule-that-throws',
    code: 'DOC-9999',
    name: 'Throwing rule',
    category: 'spec',
    severity: 'error',
    supportedSpecVersions: ['1.0.0'],
    description: 'Throws during check',
    enabledByDefault: true,
    check: () => {
      throw new Error('boom');
    },
  };
}

describe('ValidationEngine', () => {
  test('validation runs all applicable rules and reports zero diagnostics on a clean plugin', async () => {
    const plugin = await cleanPlugin();
    const engine = new ValidationEngine(createDefaultRegistry());
    const result = await engine.validate(plugin);
    expect(result.diagnostics).toEqual([]);
    expect(result.compatible).toBe(true);
    expect(result.specVersion).toBe('1.0.0');
    expect(result.compatibility).toEqual([]);
    expect(typeof result.elapsedMs).toBe('number');
  });

  test('validation collects diagnostics from every applicable category', async () => {
    // In-memory plugin: too-long name (schema-invalid, so loadPlugin would
    // reject it) and an unknown top-level field, both visible to rules.
    const plugin = makePlugin({
      manifest: { name: 'a'.repeat(65), 'x-extra': 1 },
    });
    const engine = new ValidationEngine(createDefaultRegistry());
    const result = await engine.validate(plugin);
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain('DOC-1002'); // name pattern
    expect(codes).toContain('DOC-1003'); // name length
    expect(codes).toContain('DOC-1004'); // unknown field
    const categories = result.diagnostics.map((d) => d.category);
    expect(categories).toContain('spec');
    expect(categories).toContain('structure');
    expect(result.compatible).toBe(false);
  });

  test('validation respects the rules include filter', async () => {
    const plugin = makePlugin({ manifest: { name: 'a'.repeat(65) } });
    const engine = new ValidationEngine(createDefaultRegistry());
    const result = await engine.validate(plugin, {
      rules: ['manifest-name-length'],
    });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toEqual(['DOC-1003']);
    // Rules not selected are not run implicitly.
    expect(codes).not.toContain('DOC-1002');
  });

  test('validation respects the excludeRules filter', async () => {
    const plugin = makePlugin({
      manifest: { name: 'a'.repeat(65), 'x-extra': 1 },
    });
    const engine = new ValidationEngine(createDefaultRegistry());
    const result = await engine.validate(plugin, {
      excludeRules: ['manifest-name-length'],
    });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).not.toContain('DOC-1003');
    expect(codes).toContain('DOC-1004');
  });

  test('rules are filtered by the plugin spec version', async () => {
    const plugin = makePlugin({ specVersion: '9.9.9' });
    const engine = new ValidationEngine(createDefaultRegistry());
    const result = await engine.validate(plugin);
    // Only version-agnostic ('*') rules apply: compatibility rules.
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toEqual(['DOC-6001']); // unsupported spec version
  });

  test('summary counts are correct', async () => {
    const plugin = makePlugin({
      manifest: { name: 'a'.repeat(65), 'x-extra': 1 },
    });
    const engine = new ValidationEngine(createDefaultRegistry());
    const result = await engine.validate(plugin, {
      rules: ['manifest-name-length', 'manifest-unknown-fields'],
    });
    expect(result.summary.counts.error).toBe(1);
    expect(result.summary.counts.warning).toBe(1);
    expect(result.summary.counts.info).toBe(0);
    expect(result.summary.counts.critical).toBe(0);
    expect(result.summary.byCategory.spec).toBe(2);
  });

  test('exit codes: 0 for clean, 1 for errors, 2 for critical, 3 for internal failure', async () => {
    const engine = new ValidationEngine(createDefaultRegistry());

    // 0: clean plugin
    const clean = await cleanPlugin();
    let result = await engine.validate(clean);
    expect(engine.computeExitCode(result.diagnostics)).toBe(0);

    // 1: errors
    const errorPlugin = makePlugin({
      manifest: { name: 'A'.repeat(70) },
    });
    result = await engine.validate(errorPlugin, {
      rules: ['manifest-name-pattern'],
    });
    expect(engine.computeExitCode(result.diagnostics)).toBe(1);

    // 2: critical
    const criticalPlugin = makePlugin({
      skills: [
        {
          name: 'x',
          description: 'd',
          body: 'b',
          directory: 'skills/../escape',
          frontmatter: { name: 'x', description: 'd' },
        },
      ],
    });
    result = await engine.validate(criticalPlugin, {
      rules: ['security-path-traversal'],
    });
    expect(result.diagnostics[0].severity).toBe('critical');
    expect(engine.computeExitCode(result.diagnostics)).toBe(2);

    // 3: internal rule failure
    const registry = new RuleRegistry();
    registry.register(throwingRule());
    const engine2 = new ValidationEngine(registry);
    result = await engine2.validate(makePlugin());
    expect(byCode(result.diagnostics, INTERNAL_ERROR_CODE)).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain('boom');
    expect(engine2.computeExitCode(result.diagnostics)).toBe(3);
  });

  test('strict mode makes warnings fail', async () => {
    const plugin = makePlugin({
      skills: [
        {
          name: 'big',
          description: 'd',
          body: 'word '.repeat(5001),
          directory: 'skills/big',
          frontmatter: { name: 'big', description: 'd' },
        },
      ],
    });
    const engine = new ValidationEngine(createDefaultRegistry());
    const result = await engine.validate(plugin, {
      rules: ['skill-body-size'],
    });
    expect(result.diagnostics[0].severity).toBe('warning');
    expect(engine.computeExitCode(result.diagnostics)).toBe(0);
    expect(engine.computeExitCode(result.diagnostics, { strict: true })).toBe(
      1,
    );
  });

  test('options.fix applies safe fixes to the plugin files', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json':
          JSON.stringify(
            { $schema: PLUGIN_SCHEMA, name: 'valid-plugin', 'x-extra': 1 },
            null,
            2,
          ) + '\n',
      });
      const { plugin } = await loadPlugin(root);
      const engine = new ValidationEngine(createDefaultRegistry());
      const before = await engine.validate(plugin, {
        rules: ['manifest-unknown-fields'],
      });
      expect(before.diagnostics).toHaveLength(1);
      await engine.validate(plugin, {
        rules: ['manifest-unknown-fields'],
        fix: true,
      });
      const after = await engine.validate(plugin, {
        rules: ['manifest-unknown-fields'],
      });
      expect(after.diagnostics).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('validatePlugin uses the default registry', async () => {
    const plugin = await cleanPlugin();
    const result = await validatePlugin(plugin);
    expect(result.diagnostics).toEqual([]);
    expect(result.compatible).toBe(true);
  });
});
