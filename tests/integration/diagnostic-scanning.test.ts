// Integration: diagnostic scanning with scanPlugin().
//
// The CLI pipeline (packages/cli/src/utils/run.ts) scans a plugin directory
// with scanPlugin() and validates the ScanResult with validatePlugin(); the
// parser's parse/schema/load diagnostics are merged ahead of the rule
// diagnostics, so malformed user input surfaces as a validation error
// (exit 1) instead of a tool failure (exit 3). These tests exercise that
// exact path against on-disk plugin trees and verify both the scan result
// and the merged validation result.

import { describe, expect, test } from 'bun:test';
import type { Diagnostic } from '@agent-plugin-doctor/core';
import { scanPlugin } from '@agent-plugin-doctor/parser';
import {
  createDefaultRegistry,
  ValidationEngine,
  validatePlugin,
} from '@agent-plugin-doctor/rules';
import { canonicalJson, cleanup, makeTempDir, writeTree } from './helpers.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

const engine = new ValidationEngine(createDefaultRegistry());

/** A SKILL.md that loads cleanly (frontmatter name matches its directory). */
function validSkill(name: string): string {
  return `---
name: ${name}
description: Does ${name}
---

Body of ${name}.
`;
}

/**
 * Write a plugin tree to a fresh temp dir, run the scan -> validate pipeline,
 * and always clean the directory up afterwards.
 */
async function withPluginTree(
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = makeTempDir();
  try {
    writeTree(dir, files);
    await fn(dir);
  } finally {
    cleanup(dir);
  }
}

/** Scan a directory and return both the scan result and the validation result. */
async function scanAndValidate(dir: string) {
  const scan = await scanPlugin(dir);
  const result = await validatePlugin(scan);
  return { scan, result };
}

/**
 * Assert the derived exit code is 1 (validation error), never 3 (tool
 * failure). Exit 3 is reserved for internal rule failures (DOC-0000).
 */
function expectValidationExit(diagnostics: Diagnostic[]): void {
  expect(diagnostics.some((d) => d.code === 'DOC-0000')).toBe(false);
  expect(engine.computeExitCode(diagnostics)).toBe(1);
}

describe('diagnostic scanning with scanPlugin', () => {
  test('plugin without $schema reports DOC-1008 and exits 1', async () => {
    await withPluginTree(
      { 'plugin.json': canonicalJson({ name: 'no-schema' }) },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // $schema is required by plugin.schema.json, so the manifest fails
        // schema validation at parse time: the parser reports DOC-1008 and
        // leaves the plugin unloaded. The DOC-1001 rule cannot run because
        // there is no loaded plugin for it to inspect.
        expect(scan.plugin).toBeNull();
        expect(scan.loaded.manifest).toBe(false);
        expect(scan.diagnostics.map((d) => d.code)).toEqual(['DOC-1008']);
        expect(scan.diagnostics[0]?.severity).toBe('error');
        expect(scan.diagnostics[0]?.message).toContain('$schema');
        expect(scan.diagnostics[0]?.file).toBe('plugin.json');

        // The parser diagnostic is merged ahead of the rule diagnostics.
        expect(result.diagnostics.map((d) => d.code)).toEqual(['DOC-1008']);
        expect(result.plugin).toBeNull();
        expect(result.compatible).toBe(false);
        expect(result.diagnostics.some((d) => d.code === 'DOC-1001')).toBe(
          false,
        );
        expectValidationExit(result.diagnostics);
      },
    );
  });

  test('plugin without name reports DOC-1008 and exits 1', async () => {
    await withPluginTree(
      { 'plugin.json': canonicalJson({ $schema: PLUGIN_SCHEMA }) },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // Same as missing $schema: the name field is schema-required, so the
        // manifest never loads and the parser reports DOC-1008.
        expect(scan.plugin).toBeNull();
        expect(scan.diagnostics.map((d) => d.code)).toEqual(['DOC-1008']);
        expect(scan.diagnostics[0]?.message).toContain('name');
        expect(scan.diagnostics[0]?.severity).toBe('error');

        expect(result.diagnostics.map((d) => d.code)).toEqual(['DOC-1008']);
        expect(result.compatible).toBe(false);
        expect(result.diagnostics.some((d) => d.code === 'DOC-1001')).toBe(
          false,
        );
        expectValidationExit(result.diagnostics);
      },
    );
  });

  test('malformed plugin.json reports DOC-1008 and exits 1', async () => {
    await withPluginTree({ 'plugin.json': '{ not valid json' }, async (dir) => {
      const { scan, result } = await scanAndValidate(dir);

      expect(scan.plugin).toBeNull();
      expect(scan.diagnostics.map((d) => d.code)).toEqual(['DOC-1008']);
      expect(scan.diagnostics[0]?.severity).toBe('error');
      expect(scan.diagnostics[0]?.message).toContain('Invalid JSON');
      expect(scan.diagnostics[0]?.file).toBe('plugin.json');

      expect(result.diagnostics.map((d) => d.code)).toEqual(['DOC-1008']);
      expect(result.compatible).toBe(false);
      expectValidationExit(result.diagnostics);
    });
  });

  test('malformed SKILL.md reports DOC-2099 while other skills still load', async () => {
    await withPluginTree(
      {
        'plugin.json': canonicalJson({
          $schema: PLUGIN_SCHEMA,
          name: 'mixed-skill',
        }),
        'skills/summarize/SKILL.md': validSkill('summarize'),
        'skills/bad/SKILL.md': 'no frontmatter here',
      },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // Failure isolation (§7.1): the bad skill is skipped with a DOC-2099
        // parser diagnostic, the valid skill still loads.
        expect(scan.loaded.manifest).toBe(true);
        expect(scan.loaded.skills).toBe(1);
        expect(scan.loaded.skillsFailed).toBe(1);
        expect(scan.plugin?.skills.map((s) => s.name)).toEqual(['summarize']);

        const bad = scan.diagnostics.find((d) => d.code === 'DOC-2099');
        expect(bad?.severity).toBe('error');
        expect(bad?.message).toContain('frontmatter');
        expect(bad?.file).toBe('skills/bad/SKILL.md');

        expect(result.diagnostics.map((d) => d.code)).toEqual(['DOC-2099']);
        expect(result.compatible).toBe(false);
        expectValidationExit(result.diagnostics);
      },
    );
  });

  test('skill whose name does not match its directory reports DOC-2001 and exits 1', async () => {
    await withPluginTree(
      {
        'plugin.json': canonicalJson({
          $schema: PLUGIN_SCHEMA,
          name: 'skill-mismatch',
        }),
        // Frontmatter name "summarizer" != directory name "summarize".
        'skills/summarize/SKILL.md': validSkill('summarizer'),
      },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // The skill loads cleanly (parser has nothing to report)...
        expect(scan.loaded.skills).toBe(1);
        expect(scan.loaded.skillsFailed).toBe(0);
        expect(scan.diagnostics).toEqual([]);

        // ...but the rules engine flags the mismatch. DOC-5002 (structure)
        // fires in agreement with DOC-2001 (skills).
        expect(result.diagnostics.map((d) => d.code).sort()).toEqual([
          'DOC-2001',
          'DOC-5002',
        ]);
        const mismatch = result.diagnostics.find((d) => d.code === 'DOC-2001');
        expect(mismatch?.severity).toBe('error');
        expect(mismatch?.file).toBe('skills/summarize/SKILL.md');
        expect(mismatch?.message).toContain('summarizer');
        expect(result.compatible).toBe(false);
        expectValidationExit(result.diagnostics);
      },
    );
  });

  test('mixed valid and invalid skills: valid ones load, DOC-2099 for the failure', async () => {
    await withPluginTree(
      {
        'plugin.json': canonicalJson({
          $schema: PLUGIN_SCHEMA,
          name: 'mixed-skills',
        }),
        'skills/summarize/SKILL.md': validSkill('summarize'),
        'skills/translate/SKILL.md': validSkill('translate'),
        'skills/broken/SKILL.md': 'not a skill file',
      },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        expect(scan.loaded.manifest).toBe(true);
        expect(scan.loaded.skills).toBe(2);
        expect(scan.loaded.skillsFailed).toBe(1);
        expect(scan.plugin?.skills.map((s) => s.directory)).toEqual([
          'skills/summarize',
          'skills/translate',
        ]);

        // Exactly one skill fails, and it is the only problem in the plugin.
        expect(scan.diagnostics.map((d) => d.code)).toEqual(['DOC-2099']);
        expect(result.diagnostics.map((d) => d.code)).toEqual(['DOC-2099']);
        expect(result.compatible).toBe(false);
        expectValidationExit(result.diagnostics);
      },
    );
  });

  test('mcp.json with a top-level server violation reports DOC-3007 and exits 1', async () => {
    await withPluginTree(
      {
        'plugin.json': canonicalJson({
          $schema: PLUGIN_SCHEMA,
          name: 'mcp-top',
        }),
        'mcp.json': canonicalJson({
          $schema: MCP_SCHEMA,
          mcpServers: {
            good: { type: 'stdio', command: 'node' },
            bad: 'not a server object',
          },
        }),
      },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // A server entry whose value is not an object is a top-level
        // violation (§7.2.2 rule 2): it disables MCP for the whole plugin,
        // so the valid server is not represented either.
        expect(scan.loaded.manifest).toBe(true);
        expect(scan.loaded.mcpConfig).toBe(false);
        expect(scan.plugin?.mcpConfig).toBeUndefined();

        const violations = scan.diagnostics.filter(
          (d) => d.code === 'DOC-3007',
        );
        expect(violations.length).toBeGreaterThan(0);
        for (const violation of violations) {
          expect(violation.severity).toBe('error');
          expect(violation.file).toBe('mcp.json');
        }

        expect(result.diagnostics.some((d) => d.code === 'DOC-3007')).toBe(
          true,
        );
        expect(result.compatible).toBe(false);
        expectValidationExit(result.diagnostics);
      },
    );
  });

  test('mcp.json with one schema-invalid server: valid servers load, invalid skipped silently', async () => {
    await withPluginTree(
      {
        'plugin.json': canonicalJson({
          $schema: PLUGIN_SCHEMA,
          name: 'mcp-skip',
        }),
        'mcp.json': canonicalJson({
          $schema: MCP_SCHEMA,
          mcpServers: {
            good: { type: 'stdio', command: 'node' },
            bad: { type: 'stdio' }, // missing required "command"
          },
        }),
      },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // Violations inside a server entry are isolated per-server (§7.2.2
        // rule 3): the invalid server is dropped, the valid one loads, and
        // no parser diagnostic is emitted — DOC-3007 covers top-level mcp.json
        // failures only, not individual server entries.
        expect(scan.loaded.mcpConfig).toBe(true);
        expect(Object.keys(scan.plugin?.mcpConfig?.mcpServers ?? {})).toEqual([
          'good',
        ]);
        expect(scan.diagnostics).toEqual([]);
        expect(result.diagnostics).toEqual([]);
        expect(result.compatible).toBe(true);
        expect(engine.computeExitCode(result.diagnostics)).toBe(0);
      },
    );
  });

  test('mcp.json with one rule-violating server: valid servers load, DOC-3005, exit 1', async () => {
    await withPluginTree(
      {
        'plugin.json': canonicalJson({
          $schema: PLUGIN_SCHEMA,
          name: 'mcp-mixed',
        }),
        'mcp.json': canonicalJson({
          $schema: MCP_SCHEMA,
          mcpServers: {
            good: { type: 'stdio', command: 'node' },
            bad: { type: 'sse', url: 'not-a-url' },
          },
        }),
      },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // Both servers are schema-valid and load; the bad one violates the
        // URL rule, which produces an error diagnostic (exit 1) without
        // preventing the valid server from loading.
        expect(scan.loaded.mcpConfig).toBe(true);
        expect(Object.keys(scan.plugin?.mcpConfig?.mcpServers ?? {})).toEqual([
          'good',
          'bad',
        ]);
        expect(scan.diagnostics).toEqual([]);

        const urlError = result.diagnostics.find((d) => d.code === 'DOC-3005');
        expect(urlError?.severity).toBe('error');
        expect(urlError?.message).toContain('bad');
        expect(result.compatible).toBe(false);
        expectValidationExit(result.diagnostics);
      },
    );
  });

  test('plugin with manifest, skill, and mcp problems reports all diagnostics and exits 1', async () => {
    await withPluginTree(
      {
        'plugin.json': '{ not valid json',
        'skills/broken/SKILL.md': 'no frontmatter',
        'mcp.json': 'also broken',
      },
      async (dir) => {
        const { scan, result } = await scanAndValidate(dir);

        // Every component failure is collected: DOC-1008 (manifest), DOC-2099
        // (skill), DOC-3007 (mcp.json). Scanning continues past the broken
        // manifest so as many diagnostics as possible are produced.
        expect(scan.plugin).toBeNull();
        expect(scan.diagnostics.map((d) => d.code).sort()).toEqual([
          'DOC-1008',
          'DOC-2099',
          'DOC-3007',
        ]);
        expect(scan.loaded.skillsFailed).toBe(1);

        const codes = result.diagnostics.map((d) => d.code).sort();
        expect(codes).toEqual(['DOC-1008', 'DOC-2099', 'DOC-3007']);
        for (const diagnostic of result.diagnostics) {
          expect(diagnostic.severity).toBe('error');
        }
        expect(result.compatible).toBe(false);
        expectValidationExit(result.diagnostics);
      },
    );
  });
});
