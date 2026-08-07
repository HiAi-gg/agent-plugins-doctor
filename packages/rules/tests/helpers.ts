// Shared test helpers for @agent-plugins-doctor/rules

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v1 } from '@agent-plugins-doctor/core';
import type {
  Diagnostic,
  McpConfig,
  Plugin,
  PluginManifest,
  Skill,
} from '@agent-plugins-doctor/core';
import type { Rule } from '../src/rule.js';

export const PLUGIN_SCHEMA = v1.PLUGIN_SCHEMA_URL;
export const MCP_SCHEMA = v1.MCP_SCHEMA_URL;

/** Minimal valid manifest text (canonical 2-space + trailing newline). */
export const CANONICAL_PLUGIN_JSON =
  JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'valid-plugin' }, null, 2) +
  '\n';

export function makePlugin(
  overrides: {
    // Loosely typed so tests can build intentionally invalid manifests
    // (unknown fields, malformed author objects, etc.).
    manifest?: Record<string, unknown>;
    rootDir?: string;
    specVersion?: string;
    mcpConfig?: McpConfig;
    skills?: Skill[];
    extensions?: Plugin['extensions'];
  } = {},
): Plugin {
  const manifest = {
    $schema: PLUGIN_SCHEMA,
    name: 'valid-plugin',
    ...overrides.manifest,
  } as PluginManifest;
  return {
    rootDir: overrides.rootDir ?? '/tmp/doctor-plugin',
    specVersion: overrides.specVersion ?? '1.0.0',
    manifest,
    mcpConfig: overrides.mcpConfig,
    skills: overrides.skills ?? [],
    extensions: overrides.extensions ?? [],
  };
}

export function makeSkill(overrides: Partial<Skill> = {}): Skill {
  const name = overrides.name ?? 'summarize';
  const description = overrides.description ?? 'Summarizes things';
  return {
    name,
    description,
    body: '# Summarize\nBody content',
    directory: `skills/${name}`,
    frontmatter: { name, description },
    ...overrides,
  };
}

export function makeMcp(servers: Record<string, unknown>): McpConfig {
  return {
    $schema: MCP_SCHEMA,
    mcpServers: servers as McpConfig['mcpServers'],
  };
}

/**
 * Run a single rule the same way the engine does: check() plus fix()
 * attachment.
 */
export function checkRule(
  rule: Rule,
  plugin: Plugin,
  rootDir: string = plugin.rootDir,
): Diagnostic[] {
  const ctx = { plugin, rootDir };
  const diagnostics = rule.check(ctx);
  if (rule.fix) {
    for (const diagnostic of diagnostics) {
      const fix = rule.fix(ctx, diagnostic);
      if (fix) diagnostic.fix = fix;
    }
  }
  return diagnostics;
}

export function byCode(diagnostics: Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.code === code);
}

// --- filesystem helpers ----------------------------------------------------

export function makeTempDir(prefix = 'doctor-rules-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function writeTree(root: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

export function writePlugin(
  root: string,
  manifest: unknown,
  options: { indent?: number; trailingNewline?: boolean } = {},
): void {
  const indent = options.indent ?? 2;
  const trailingNewline = options.trailingNewline ?? true;
  const text =
    JSON.stringify(manifest, null, indent) + (trailingNewline ? '\n' : '');
  writeFileSync(join(root, 'plugin.json'), text);
}

export function readFile(root: string, relPath: string): string | null {
  const full = join(root, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

export function readJson<T = unknown>(root: string, relPath: string): T | null {
  const text = readFile(root, relPath);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
