import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LoadError, loadPlugin } from '../src/index.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

function makeTempDir(prefix = 'doctor-loader-'): string {
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

describe('loadPlugin', () => {
  test('minimal plugin (plugin.json only) loads correctly', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'plugin.json': MINIMAL_MANIFEST });
      const plugin = await loadPlugin(root);
      expect(plugin.rootDir).toBe(root);
      expect(plugin.specVersion).toBe('1.0.0');
      expect(plugin.manifest.name).toBe('minimal-plugin');
      expect(plugin.mcpConfig).toBeUndefined();
      expect(plugin.skills).toEqual([]);
      expect(plugin.extensions).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  test('complex plugin with all components loads correctly', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': JSON.stringify({
          $schema: PLUGIN_SCHEMA,
          name: 'complex-plugin',
          version: '1.0.0',
          description: 'Everything plugin',
          extensions: { 'com.example.client': { enabled: true } },
        }),
        'mcp.json': JSON.stringify({
          $schema: MCP_SCHEMA,
          mcpServers: {
            local: { type: 'stdio', command: './bin/server' },
            remote: { type: 'streamable-http', url: 'https://example.com/mcp' },
          },
        }),
        'skills/summarize/SKILL.md':
          '---\nname: summarize\ndescription: Summarize things\n---\n# Summarize\nBody\n',
        'skills/summarize/scripts/run.sh': '#!/bin/sh\necho hi\n',
        'skills/code-review/SKILL.md':
          '---\nname: code-review\ndescription: Review code\nlicense: MIT\n---\nBody\n',
        'com.example.client/hooks/hooks.json': JSON.stringify({
          hooks: ['pre', 'post'],
        }),
        'com.example.client/extension.json': JSON.stringify({ feature: true }),
      });
      const plugin = await loadPlugin(root);
      expect(plugin.manifest.name).toBe('complex-plugin');
      expect(plugin.specVersion).toBe('1.0.0');

      // mcp.json
      expect(plugin.mcpConfig).toBeDefined();
      expect(Object.keys(plugin.mcpConfig?.mcpServers ?? {})).toEqual([
        'local',
        'remote',
      ]);

      // skills discovered at fixed depth
      expect(plugin.skills).toHaveLength(2);
      const byName = Object.fromEntries(plugin.skills.map((s) => [s.name, s]));
      expect(Object.keys(byName).sort()).toEqual(['code-review', 'summarize']);
      expect(byName['summarize'].body).toContain('# Summarize');
      expect(byName['summarize'].directory).toBe('skills/summarize');
      expect(byName['code-review'].license).toBe('MIT');

      // extensions
      expect(plugin.extensions).toHaveLength(1);
      expect(plugin.extensions[0].namespace).toBe('com.example.client');
      expect(plugin.extensions[0].path).toBe('com.example.client');
      expect(plugin.extensions[0].data).toEqual({ feature: true });
    } finally {
      cleanup(root);
    }
  });

  test('missing plugin.json throws LoadError', async () => {
    const root = makeTempDir();
    try {
      expect(await loadPlugin(root).catch((e) => e)).toBeInstanceOf(LoadError);
    } finally {
      cleanup(root);
    }
  });

  test('nonexistent root throws LoadError', async () => {
    const root = join(tmpdir(), 'doctor-loader-missing-' + Date.now());
    expect(await loadPlugin(root).catch((e) => e)).toBeInstanceOf(LoadError);
  });

  test('root that is a file throws LoadError', async () => {
    const dir = makeTempDir();
    try {
      const file = join(dir, 'not-a-dir');
      writeFileSync(file, 'x');
      expect(await loadPlugin(file).catch((e) => e)).toBeInstanceOf(LoadError);
    } finally {
      cleanup(dir);
    }
  });

  test('invalid plugin.json propagates parse errors', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, { 'plugin.json': '{ invalid json' });
      expect(await loadPlugin(root).catch((e) => e?.name)).toBe('ParseError');
    } finally {
      cleanup(root);
    }
  });

  test('invalid mcp.json does not prevent loading the plugin', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'mcp.json': '{ not valid json',
      });
      const plugin = await loadPlugin(root);
      expect(plugin.manifest.name).toBe('minimal-plugin');
      expect(plugin.mcpConfig).toBeUndefined();
    } finally {
      cleanup(root);
    }
  });

  test('skills are discovered at exactly one level deep', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'skills/a/SKILL.md':
          '---\nname: a\ndescription: Skill A\n---\nBody A\n',
        // Nested SKILL.md two levels deep must NOT be discovered
        'skills/a/nested/SKILL.md':
          '---\nname: nested\ndescription: Nested skill\n---\nBody Nested\n',
        'skills/b/SKILL.md':
          '---\nname: b\ndescription: Skill B\n---\nBody B\n',
      });
      const plugin = await loadPlugin(root);
      const names = plugin.skills.map((s) => s.name).sort();
      expect(names).toEqual(['a', 'b']);
    } finally {
      cleanup(root);
    }
  });

  test('non-conforming skill directories are skipped', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'skills/good/SKILL.md':
          '---\nname: good\ndescription: Good skill\n---\nBody\n',
        'skills/no-md/README.md': 'not a skill',
        'skills/not-a-dir.md': 'a file, not a directory',
        'skills/bad/SKILL.txt': 'wrong file name',
      });
      const plugin = await loadPlugin(root);
      expect(plugin.skills.map((s) => s.name)).toEqual(['good']);
    } finally {
      cleanup(root);
    }
  });

  test('skill with invalid frontmatter is skipped', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'skills/good/SKILL.md':
          '---\nname: good\ndescription: Good skill\n---\nBody\n',
        'skills/bad/SKILL.md': 'no frontmatter here',
      });
      const plugin = await loadPlugin(root);
      expect(plugin.skills.map((s) => s.name)).toEqual(['good']);
    } finally {
      cleanup(root);
    }
  });

  test('extensions are discovered from reverse-domain directories', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'com.example.client/extension.json': JSON.stringify({ a: 1 }),
        'org.tool.hooks/extension.json': JSON.stringify({ b: 2 }),
        'not-an-extension/hooks.json': '{}', // no dot in the name
        'scripts/setup.sh': 'echo hi', // conventional directory, not reverse-domain
        'skills/summarize/SKILL.md':
          '---\nname: summarize\ndescription: X\n---\nBody\n',
      });
      const plugin = await loadPlugin(root);
      const namespaces = plugin.extensions.map((e) => e.namespace).sort();
      expect(namespaces).toEqual(['com.example.client', 'org.tool.hooks']);
      const client = plugin.extensions.find(
        (e) => e.namespace === 'com.example.client',
      );
      expect(client?.data).toEqual({ a: 1 });
    } finally {
      cleanup(root);
    }
  });

  test('extension without extension.json yields empty data', async () => {
    const root = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'com.example.client/hooks/hooks.json': JSON.stringify({ hooks: [] }),
      });
      const plugin = await loadPlugin(root);
      expect(plugin.extensions).toHaveLength(1);
      expect(plugin.extensions[0].data).toEqual({});
    } finally {
      cleanup(root);
    }
  });

  test('symlinked plugin.json escaping the root is rejected', async () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    try {
      writeFileSync(join(outside, 'plugin.json'), MINIMAL_MANIFEST);
      symlinkSync(join(outside, 'plugin.json'), join(root, 'plugin.json'));
      expect(await loadPlugin(root).catch((e) => e)).toBeInstanceOf(LoadError);
    } finally {
      cleanup(root);
      cleanup(outside);
    }
  });

  test('symlinked skill directory escaping the root is skipped', async () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    try {
      writeTree(root, {
        'plugin.json': MINIMAL_MANIFEST,
        'skills/good/SKILL.md':
          '---\nname: good\ndescription: Good skill\n---\nBody\n',
      });
      writeTree(outside, {
        'SKILL.md': '---\nname: evil\ndescription: Evil skill\n---\nBody\n',
      });
      symlinkSync(outside, join(root, 'skills', 'evil'));
      const plugin = await loadPlugin(root);
      // The escaping skill is skipped; the valid one still loads.
      expect(plugin.skills.map((s) => s.name)).toEqual(['good']);
    } finally {
      cleanup(root);
      cleanup(outside);
    }
  });

  test('symlinked mcp.json escaping the root is rejected (MCP disabled)', async () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    try {
      writeTree(root, { 'plugin.json': MINIMAL_MANIFEST });
      writeFileSync(
        join(outside, 'mcp.json'),
        JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: {} }),
      );
      symlinkSync(join(outside, 'mcp.json'), join(root, 'mcp.json'));
      const plugin = await loadPlugin(root);
      expect(plugin.manifest.name).toBe('minimal-plugin');
      expect(plugin.mcpConfig).toBeUndefined();
    } finally {
      cleanup(root);
      cleanup(outside);
    }
  });
});
