// Integration: the rules engine must run against plugins produced by the
// parser without throwing, attach diagnostics to the correct files, handle
// missing components gracefully, honor rule filters, and compute exit codes.

import { describe, expect, test } from 'bun:test';
import type { ValidationResult } from '@agent-plugin-doctor/core';
import { loadPlugin, SchemaValidationError } from '@agent-plugin-doctor/parser';
import {
  createDefaultRegistry,
  ValidationEngine,
  validatePlugin,
} from '@agent-plugin-doctor/rules';
import { isPluginLoadError } from '../../packages/cli/src/utils/run.js';
import {
  canonicalJson,
  cleanup,
  fixturePath,
  makeTempDir,
  writeTree,
} from './helpers.js';

// Fixtures that load successfully (see tests/fixtures/README.md).
const LOADABLE_FIXTURES = [
  'minimal-plugin',
  'complex-plugin',
  'warning-plugin',
  'security-plugin/symlink-escape',
  'security-plugin/embedded-secrets',
  'security-plugin/path-traversal',
  'edge-cases/empty-plugin',
  'edge-cases/huge-description',
  'edge-cases/max-skills',
  'vendor-extensions/valid-extensions',
  'vendor-extensions/invalid-extensions',
] as const;

// Fixtures that fail at load time under the strict loadPlugin API
// (schema violations throw SchemaValidationError).
const UNLOADABLE_FIXTURES = [
  'invalid-plugin',
  'legacy-plugin',
  'future-spec',
  'edge-cases/unicode-names',
] as const;

describe('rules engine over parsed plugins', () => {
  test('every loadable fixture validates without throwing', async () => {
    for (const fixture of LOADABLE_FIXTURES) {
      const { plugin } = await loadPlugin(fixturePath(fixture));
      const result: ValidationResult = await validatePlugin(plugin);
      expect(result.plugin).toBe(plugin);
      expect(Array.isArray(result.diagnostics)).toBe(true);
      expect(typeof result.summary.counts.error).toBe('number');
      expect(typeof result.elapsedMs).toBe('number');
      // Every diagnostic is attributed to a real rule and category.
      for (const diagnostic of result.diagnostics) {
        expect(diagnostic.ruleId.length).toBeGreaterThan(0);
        expect(typeof diagnostic.category).toBe('string');
      }
    }
  });

  test('load failure fixtures throw a parser error (not a rule failure)', async () => {
    for (const fixture of UNLOADABLE_FIXTURES) {
      let thrown: unknown;
      try {
        await loadPlugin(fixturePath(fixture));
      } catch (cause) {
        thrown = cause;
      }
      expect(thrown).toBeDefined();
      expect(thrown).toBeInstanceOf(SchemaValidationError);
    }
  });

  test('diagnostics reference the correct files', async () => {
    const { plugin: warningPlugin } = await loadPlugin(
      fixturePath('warning-plugin'),
    );
    const warning = await validatePlugin(warningPlugin);
    const unknownField = warning.diagnostics.find((d) => d.code === 'DOC-1004');
    expect(unknownField?.file).toBe('./plugin.json');

    const { plugin: hugePlugin } = await loadPlugin(
      fixturePath('edge-cases', 'huge-description'),
    );
    const huge = await validatePlugin(hugePlugin);
    const longDesc = huge.diagnostics.find((d) => d.code === 'DOC-2003');
    expect(longDesc?.file).toBe('skills/huge-description/SKILL.md');

    const { plugin: secretsPlugin } = await loadPlugin(
      fixturePath('security-plugin', 'embedded-secrets'),
    );
    const secrets = await validatePlugin(secretsPlugin);
    const secret = secrets.diagnostics.find((d) => d.code === 'DOC-4003');
    expect(secret?.file).toBe('./mcp.json');
    expect(secret?.severity).toBe('critical');
  });

  test('diagnostics carry well-formed ranges when present', async () => {
    const { plugin } = await loadPlugin(fixturePath('warning-plugin'));
    const warning = await validatePlugin(plugin);
    for (const diagnostic of warning.diagnostics) {
      if (diagnostic.range === undefined) continue;
      expect(diagnostic.range.start.line).toBeGreaterThanOrEqual(1);
      expect(diagnostic.range.start.column).toBeGreaterThanOrEqual(1);
      expect(diagnostic.range.end.line).toBeGreaterThanOrEqual(
        diagnostic.range.start.line,
      );
    }
  });

  test('plugins with missing components validate gracefully', async () => {
    const dir = makeTempDir();
    try {
      // Only plugin.json: no mcp.json, no skills, no extensions.
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'components-missing',
        }),
      });
      const { plugin } = await loadPlugin(dir);
      expect(plugin.mcpConfig).toBeUndefined();
      expect(plugin.skills).toEqual([]);
      expect(plugin.extensions).toEqual([]);

      const result = await validatePlugin(plugin);
      expect(result.diagnostics).toEqual([]);
      expect(result.compatible).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  test('rule include filter restricts which rules run', async () => {
    const { plugin } = await loadPlugin(fixturePath('warning-plugin'));
    const result = await validatePlugin(plugin, {
      rules: ['manifest-unknown-fields'],
    });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain('DOC-1004');
    expect(codes).not.toContain('DOC-5003');
  });

  test('rule exclude filter drops rules', async () => {
    const { plugin } = await loadPlugin(fixturePath('complex-plugin'));
    const all = await validatePlugin(plugin);
    expect(all.diagnostics.some((d) => d.code === 'DOC-5003')).toBe(true);

    const filtered = await validatePlugin(plugin, {
      excludeRules: ['structure-extra-files'],
    });
    expect(filtered.diagnostics.some((d) => d.code === 'DOC-5003')).toBe(false);
  });

  test('exit codes are computed from engine results', async () => {
    const engine = new ValidationEngine(createDefaultRegistry());

    const { plugin: minimal } = await loadPlugin(fixturePath('minimal-plugin'));
    const minimalResult = await validatePlugin(minimal);
    expect(engine.computeExitCode(minimalResult.diagnostics)).toBe(0);

    // Warning-level only: 0 normally, 1 with --strict.
    const { plugin: warning } = await loadPlugin(fixturePath('warning-plugin'));
    const warningResult = await validatePlugin(warning);
    expect(engine.computeExitCode(warningResult.diagnostics)).toBe(0);
    expect(
      engine.computeExitCode(warningResult.diagnostics, { strict: true }),
    ).toBe(1);

    // Error-level: 1.
    const { plugin: huge } = await loadPlugin(
      fixturePath('edge-cases', 'huge-description'),
    );
    const hugeResult = await validatePlugin(huge);
    expect(engine.computeExitCode(hugeResult.diagnostics)).toBe(1);

    // Critical-level: 2.
    const { plugin: secrets } = await loadPlugin(
      fixturePath('security-plugin', 'embedded-secrets'),
    );
    const secretsResult = await validatePlugin(secrets);
    expect(engine.computeExitCode(secretsResult.diagnostics)).toBe(2);
  });

  test('unloadable fixtures are classified as load errors by the CLI pipeline', async () => {
    for (const fixture of UNLOADABLE_FIXTURES) {
      let caught: unknown;
      try {
        await loadPlugin(fixturePath(fixture));
      } catch (cause) {
        caught = cause;
      }
      expect(caught).toBeDefined();
      expect(caught instanceof SchemaValidationError).toBe(true);
      // The strict loadPlugin API throws for these; the CLI classifies such
      // errors via isPluginLoadError (its scan-based pipeline instead
      // collects them as DOC-1008 diagnostics, exit 1).
      expect(isPluginLoadError(caught)).toBe(true);
    }
  });
});
