import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MANIFEST_LOAD_ERROR_CODE,
  MCP_LOAD_ERROR_CODE,
  SKILL_LOAD_ERROR_CODE,
  scanPlugin,
} from '../src/index.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

function makeTempDir(prefix = 'doctor-scan-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeTree(root: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(root, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const MINIMAL_MANIFEST = JSON.stringify({
  $schema: PLUGIN_SCHEMA,
  name: 'minimal-plugin',
});

const GOOD_SKILL = '---\nname: good\ndescription: Good skill\n---\nBody\n';

describe('scanPlugin', () => {
  test('returns diagnostics for malformed plugin.json (invalid JSON)', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'plugin.json': '{ invalid json' });
      const result = await scanPlugin(root);
      expect(result.plugin).toBeNull();
      expect(result.diagnostics.length).toBeGreaterThan(0);
      // Manifest load failures use a DOC-1xxx parser code.
      expect(result.diagnostics[0].code).toMatch(/^DOC-1/);
      expect(result.diagnostics[0].code).toBe(MANIFEST_LOAD_ERROR_CODE);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].ruleId).toBe('parser');
      expect(result.diagnostics[0].file).toBe('plugin.json');
      expect(result.diagnostics[0].message).toContain('Invalid JSON');
      expect(result.loaded.manifest).toBe(false);
      expect(result.loaded.skills).toBe(0);
    } finally {
      cleanup(root);
    }
  });

  test('missing plugin.json is reported but other components are still scanned', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'skills/good/SKILL.md': GOOD_SKILL });
      const result = await scanPlugin(root);
      expect(result.plugin).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe(MANIFEST_LOAD_ERROR_CODE);
      expect(result.diagnostics[0].message).toContain('Missing plugin.json');
      expect(result.loaded.manifest).toBe(false);
      // Scanning continues: the valid skill is still discovered and reported.
      expect(result.loaded.skills).toBe(1);
    } finally {
      cleanup(root);
    }
  });

  test('schema-invalid plugin.json yields one diagnostic per violation', async () => {
    const root = makeTempDir();
    try {
      // Empty object: missing required $schema and name (§5.2).
      writeTree(root, { 'plugin.json': '{}' });
      const result = await scanPlugin(root);
      expect(result.plugin).toBeNull();
      expect(result.diagnostics.length).toBeGreaterThan(1);
      expect(
        result.diagnostics.every((d) => d.code === MANIFEST_LOAD_ERROR_CODE),
      ).toBe(true);
      expect(result.diagnostics[0].message).toContain(
        'missing required property',
      );
      expect(result.loaded.manifest).toBe(false);
    } finally {
      cleanup(root);
    }
  });

  test('returns partial plugin when some skills fail', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'skills/good/SKILL.md': GOOD_SKILL,
        'skills/bad/SKILL.md': 'no frontmatter here',
      });
      const result = await scanPlugin(root);
      expect(result.plugin).not.toBeNull();
      expect(result.plugin?.manifest.name).toBe('minimal-plugin');
      expect(result.loaded.manifest).toBe(true);
      expect(result.loaded.skills).toBe(1);
      expect(result.loaded.skillsFailed).toBe(1);
      expect(
        result.diagnostics.some((d) => d.code === SKILL_LOAD_ERROR_CODE),
      ).toBe(true);
      expect(result.diagnostics[0].file).toBe('skills/bad/SKILL.md');
    } finally {
      cleanup(root);
    }
  });

  test('invalid mcp.json yields diagnostics but the rest of the plugin loads', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'mcp.json': '{ not valid json',
      });
      const result = await scanPlugin(root);
      expect(result.plugin).not.toBeNull();
      expect(result.plugin?.mcpConfig).toBeUndefined();
      expect(result.loaded.manifest).toBe(true);
      expect(result.loaded.mcpConfig).toBe(false);
      expect(
        result.diagnostics.some((d) => d.code === MCP_LOAD_ERROR_CODE),
      ).toBe(true);
    } finally {
      cleanup(root);
    }
  });

  test('collects multiple diagnostics across components', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': '{}', // schema-invalid: missing $schema and name
        'mcp.json': '{ not valid json',
        'skills/bad/SKILL.md': 'no frontmatter here',
      });
      const result = await scanPlugin(root);
      expect(result.diagnostics.length).toBeGreaterThan(1);
      const codes = result.diagnostics.map((d) => d.code);
      expect(codes).toContain(MANIFEST_LOAD_ERROR_CODE);
      expect(codes).toContain(MCP_LOAD_ERROR_CODE);
      expect(codes).toContain(SKILL_LOAD_ERROR_CODE);
      // Even with a broken manifest, scanning continued over every component.
      expect(result.loaded.skillsFailed).toBe(1);
    } finally {
      cleanup(root);
    }
  });

  test('nonexistent root returns early with a single diagnostic', async () => {
    const root = join(tmpdir(), 'doctor-scan-missing-' + Date.now());
    const result = await scanPlugin(root);
    expect(result.plugin).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe(MANIFEST_LOAD_ERROR_CODE);
    expect(result.diagnostics[0].message).toContain('does not exist');
    expect(result.loaded).toEqual({
      manifest: false,
      mcpConfig: false,
      skills: 0,
      skillsFailed: 0,
      extensions: 0,
    });
  });

  test('valid plugin scans clean with every component loaded', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'mcp.json': JSON.stringify({
          $schema: MCP_SCHEMA,
          mcpServers: {
            local: { type: 'stdio', command: './bin/server' },
          },
        }),
        'skills/good/SKILL.md': GOOD_SKILL,
        'com.example.client/extension.json': JSON.stringify({ a: 1 }),
      });
      const result = await scanPlugin(root);
      expect(result.plugin).not.toBeNull();
      expect(result.diagnostics).toEqual([]);
      expect(result.loaded).toEqual({
        manifest: true,
        mcpConfig: true,
        skills: 1,
        skillsFailed: 0,
        extensions: 1,
      });
    } finally {
      cleanup(root);
    }
  });
});
