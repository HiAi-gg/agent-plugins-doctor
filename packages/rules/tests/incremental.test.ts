import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { validateIncremental, validatePlugin } from '../src/index.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

function makeTempDir(prefix = 'doctor-incremental-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeTree(root: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(root, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

function manifest(name = 'inc-plugin'): string {
  // Canonical JSON: 2-space indent + trailing newline (DOC-7001-clean).
  return JSON.stringify({ $schema: PLUGIN_SCHEMA, name }, null, 2) + '\n';
}

function skill(name: string): string {
  return `---\nname: ${name}\ndescription: Description of ${name}\n---\n# ${name}\n\nBody of ${name}\n`;
}

const diagnosticCodes = (result: {
  diagnostics: { code: string }[];
}): string[] => result.diagnostics.map((d) => d.code);

describe('validateIncremental', () => {
  test('with no changed files, all diagnostics are reused', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': manifest(),
        'skills/summarize/SKILL.md': skill('summarize'),
        'notes.log': 'unexpected file',
      });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);
      expect(diagnosticCodes(full)).toContain('DOC-5003'); // notes.log

      const incremental = await validateIncremental(plugin, full, []);
      expect(incremental.diagnostics).toEqual(full.diagnostics);
      expect(incremental.summary).toEqual(full.summary);
      expect(incremental.compatible).toBe(full.compatible);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('changing plugin.json re-runs raw-file and model rules', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': manifest(),
        'skills/summarize/SKILL.md': skill('summarize'),
      });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);
      expect(full.diagnostics).toHaveLength(0);

      // Add an unknown top-level field → DOC-1004 fires (warning).
      writeFileSync(
        join(dir, 'plugin.json'),
        JSON.stringify(
          { $schema: PLUGIN_SCHEMA, name: 'inc-plugin', unknownField: true },
          null,
          2,
        ) + '\n',
      );
      const { plugin: changed } = await loadPlugin(dir);
      const incremental = await validateIncremental(changed, full, [
        './plugin.json',
      ]);
      expect(diagnosticCodes(incremental)).toContain('DOC-1004');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('changing a SKILL.md re-runs model rules but not plugin.json rules', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': manifest(),
        'skills/summarize/SKILL.md': skill('summarize'),
      });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);

      // Make the skill description far too long → DOC-2003 (skill
      // description-length) must fire even though plugin.json is untouched.
      const longDescription = `description: ${'x'.repeat(1200)}`;
      writeFileSync(
        join(dir, 'skills/summarize/SKILL.md'),
        skill('summarize').replace(
          'description: Description of summarize',
          longDescription,
        ),
      );
      const { plugin: changed } = await loadPlugin(dir);
      const incremental = await validateIncremental(changed, full, [
        'skills/summarize/SKILL.md',
      ]);
      expect(diagnosticCodes(incremental)).toContain('DOC-2003');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('adding an unexpected root file re-runs structure rules', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': manifest(),
        'skills/summarize/SKILL.md': skill('summarize'),
      });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);
      expect(diagnosticCodes(full)).not.toContain('DOC-5003');

      writeFileSync(join(dir, 'stray.log'), 'new file');
      const { plugin: changed } = await loadPlugin(dir);
      const incremental = await validateIncremental(changed, full, [
        'stray.log',
      ]);
      expect(diagnosticCodes(incremental)).toContain('DOC-5003');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('model rules are not re-run for unrelated file changes', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': manifest(),
        'skills/summarize/SKILL.md': skill('summarize'),
      });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);

      // Changing a skill helper script is not part of the model and does not
      // affect any rule that reads the Plugin object.
      writeTree(dir, {
        'skills/summarize/scripts/run.sh': '#!/bin/sh\necho changed\n',
      });
      const { plugin: changed } = await loadPlugin(dir);
      const incremental = await validateIncremental(changed, full, [
        'skills/summarize/scripts/run.sh',
      ]);
      expect(incremental.diagnostics).toEqual(full.diagnostics);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fallback to full validation when the plugin root changes', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    try {
      writeTree(dirA, { 'plugin.json': manifest('plugin-a') });
      writeTree(dirB, {
        'plugin.json': manifest('plugin-b'),
        'skills/b/SKILL.md': skill('b'),
      });
      const { plugin: pluginA } = await loadPlugin(dirA);
      const { plugin: pluginB } = await loadPlugin(dirB);
      const fullA = await validatePlugin(pluginA);

      const incremental = await validateIncremental(pluginB, fullA, []);
      const fullB = await validatePlugin(pluginB);
      expect(incremental.diagnostics).toEqual(fullB.diagnostics);
      // validateIncremental always returns the fresh (non-null) plugin.
      expect(incremental.plugin?.rootDir).toBe(dirB);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  test('fallback to full validation when rule filtering is requested', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, { 'plugin.json': manifest() });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);
      const incremental = await validateIncremental(plugin, full, [], {
        rules: ['structure-extra-files'],
      });
      // Only the requested rule's diagnostics may appear.
      for (const d of incremental.diagnostics) {
        expect(d.ruleId).toBe('structure-extra-files');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('equals full validation when every file is reported as changed', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': manifest(),
        'mcp.json': JSON.stringify(
          {
            $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
            mcpServers: { local: { type: 'stdio', command: './bin/server' } },
          },
          null,
          2,
        ),
        'skills/summarize/SKILL.md': skill('summarize'),
        'com.example.client/extension.json': JSON.stringify({ feature: true }),
      });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);

      const allFiles = [
        'plugin.json',
        'mcp.json',
        'skills/summarize/SKILL.md',
        'com.example.client/extension.json',
      ];
      const incremental = await validateIncremental(plugin, full, allFiles);
      expect(incremental.diagnostics).toEqual(full.diagnostics);
      expect(incremental.summary).toEqual(full.summary);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('works with the ValidationEngine directly and preserves compatibility', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, { 'plugin.json': manifest() });
      const { plugin } = await loadPlugin(dir);
      const full = await validatePlugin(plugin);
      const compatibility = [
        {
          clientId: 'vscode',
          clientName: 'VS Code',
          level: 'full' as const,
          compatible: true,
          working: [],
          unsupported: [],
          issues: [],
          evidence: 'docs' as const,
        },
      ];
      const previous = { ...full, compatibility };

      const { ValidationEngine } = await import('../src/engine.js');
      const { createDefaultRegistry } = await import('../src/rules/index.js');
      const engine = new ValidationEngine(createDefaultRegistry());
      const incremental = await engine.validateIncremental(plugin, previous, [
        'unrelated.txt',
      ]);
      expect(incremental.compatibility).toEqual(compatibility);
      expect(incremental.diagnostics).toEqual(full.diagnostics);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
