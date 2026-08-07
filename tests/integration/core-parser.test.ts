// Integration: @agent-plugin-doctor/parser output must be type-compatible with
// the canonical @agent-plugin-doctor/core types, and loadPlugin must assemble
// every component of a plugin.
//
// The explicit type annotations (e.g. `const manifest: PluginManifest = ...`)
// are compile-time proof that the parser's return types assign to the core
// types; the runtime assertions prove the parsed values match the fixtures.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type {
  Extension,
  McpConfig,
  McpServer,
  Plugin,
  PluginManifest,
  Skill,
  SkillFrontmatter,
} from '@agent-plugin-doctor/core';
import { v1 } from '@agent-plugin-doctor/core';
import {
  loadPlugin,
  parseMcpConfig,
  parsePluginManifest,
  parseSkillFrontmatter,
  type ParsedSkill,
} from '@agent-plugin-doctor/parser';
import { fixturePath, REPO_ROOT } from './helpers.js';

describe('core <-> parser type compatibility', () => {
  test('parsePluginManifest returns a core PluginManifest', () => {
    const manifest: PluginManifest = parsePluginManifest(
      fixturePath('minimal-plugin', 'plugin.json'),
    );
    expect(manifest.$schema).toBe(v1.PLUGIN_SCHEMA_URL);
    expect(manifest.name).toBe('minimal-plugin');
    expect(manifest.version).toBeUndefined();
    // Structural: the object satisfies the core type at runtime.
    expect(manifest satisfies PluginManifest).toBe(manifest);
  });

  test('parseMcpConfig returns a core McpConfig', () => {
    const mcp: McpConfig | undefined = parseMcpConfig(
      fixturePath('complex-plugin', 'mcp.json'),
    );
    expect(mcp).toBeDefined();
    if (mcp === undefined) throw new Error('expected mcp.json to parse');
    expect(mcp.$schema).toBe(v1.MCP_SCHEMA_URL);
    const servers = mcp.mcpServers;
    expect(Object.keys(servers)).toEqual(['local-server', 'remote-api']);

    // Each server is a typed McpServer discriminated on `type`.
    const stdio: McpServer = servers['local-server'];
    expect(stdio.type).toBe('stdio');
    if (stdio.type !== 'stdio') {
      throw new Error(`expected stdio server, got ${stdio.type}`);
    }
    expect(stdio.command).toBe('./server.js');
    expect(stdio.args).toEqual(['--port', '3000']);
    expect(stdio.env).toEqual({ NODE_ENV: 'production' });

    const http: McpServer = servers['remote-api'];
    expect(http.type).toBe('streamable-http');
    if (http.type !== 'streamable-http') {
      throw new Error(`expected streamable-http server, got ${http.type}`);
    }
    expect(http.url).toBe('https://api.example.com/mcp');
    expect(http.headers).toEqual({ 'X-API-Version': '1.0' });
    expect(mcp satisfies McpConfig).toBe(mcp);
  });

  test('parseSkillFrontmatter returns core SkillFrontmatter data', () => {
    const content = readFileSync(
      fixturePath('complex-plugin', 'skills', 'summarize', 'SKILL.md'),
      'utf8',
    );
    const parsed: ParsedSkill = parseSkillFrontmatter(
      content,
      fixturePath('complex-plugin', 'skills', 'summarize', 'SKILL.md'),
    );
    const frontmatter: SkillFrontmatter = parsed.frontmatter;
    expect(frontmatter.name).toBe('summarize');
    expect(frontmatter.description).toBe('Summarize text content');
    expect(frontmatter.license).toBe('MIT');
    expect(frontmatter.compatibility).toBe('Works with all clients');
    expect(frontmatter.metadata).toEqual({ category: 'text-processing' });
    expect(parsed.body).toContain('# Summarize Skill');
    expect(frontmatter satisfies SkillFrontmatter).toBe(frontmatter);
  });

  test('loadPlugin returns a complete core Plugin (complex-plugin)', async () => {
    const plugin: Plugin = await loadPlugin(fixturePath('complex-plugin'));
    expect(plugin.rootDir).toBe(fixturePath('complex-plugin'));
    expect(plugin.specVersion).toBe(v1.SPEC_VERSION);
    expect(plugin.manifest.name).toBe('complex-plugin');
    expect(plugin.manifest.author?.name).toBe('Test Author');
    expect(plugin.mcpConfig?.mcpServers).toBeDefined();

    expect(plugin.skills).toHaveLength(2);
    const skills: Skill[] = plugin.skills;
    expect(skills.map((s) => s.name)).toEqual(['summarize', 'translate']);
    const summarize = skills[0];
    expect(summarize.directory).toBe('skills/summarize');
    expect(summarize.frontmatter.name).toBe('summarize');
    expect(summarize.body).toContain('# Summarize Skill');

    expect(plugin.extensions).toHaveLength(1);
    const extension: Extension = plugin.extensions[0];
    expect(extension.namespace).toBe('com.example.client');
    expect(extension.path).toBe('com.example.client');
    expect(extension.data).toEqual({
      name: 'Example Client Extension',
      version: '1.0.0',
    });

    expect(plugin satisfies Plugin).toBe(plugin);
  });

  test('loadPlugin handles a plugin with no optional components', async () => {
    const plugin: Plugin = await loadPlugin(fixturePath('minimal-plugin'));
    expect(plugin.manifest.name).toBe('minimal-plugin');
    expect(plugin.mcpConfig).toBeUndefined();
    expect(plugin.skills).toEqual([]);
    expect(plugin.extensions).toEqual([]);
    expect(plugin.specVersion).toBe('1.0.0');
  });

  test('parser types are assignable to core types (compile-time contract)', () => {
    // If any of these assignments fail to typecheck, the integration contract
    // is broken: the parser must stay compatible with the core types.
    const manifestType: PluginManifest = null as unknown as ReturnType<
      typeof parsePluginManifest
    >;
    const mcpType: McpConfig | undefined = null as unknown as ReturnType<
      typeof parseMcpConfig
    >;
    const pluginType: Plugin = null as unknown as Awaited<
      ReturnType<typeof loadPlugin>
    >;
    const skillType: Skill = null as unknown as Plugin['skills'][number];
    // Runtime sanity: the type-level assignments above are erased, but the
    // symbols must exist (they are the values the compile-time contract pins).
    expect(typeof parsePluginManifest).toBe('function');
    expect(typeof parseMcpConfig).toBe('function');
    expect(typeof parseSkillFrontmatter).toBe('function');
    expect(typeof loadPlugin).toBe('function');
    expect(manifestType).toBeNull();
    expect(mcpType).toBeNull();
    expect(skillType).toBeNull();
    expect(pluginType).toBeNull();
  });

  test('the repo root itself loads as a plugin (self-hosting contract)', async () => {
    const plugin: Plugin = await loadPlugin(REPO_ROOT);
    expect(plugin.manifest.name).toBe('agent-plugin-doctor');
    expect(plugin.manifest.version).toBe('0.0.1');
    expect(plugin.manifest.license).toBe('MIT');
    expect(plugin.skills).toHaveLength(1);
    expect(plugin.skills[0].name).toBe('doctor');
    expect(plugin.skills[0].directory).toBe('skills/doctor');
    expect(plugin.mcpConfig).toBeUndefined();
    expect(plugin.extensions).toEqual([]);
  });
});
