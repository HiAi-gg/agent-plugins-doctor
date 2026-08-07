import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlugin, ParsedFileCache } from '../src/index.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

function makeTempDir(prefix = 'doctor-cache-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('ParsedFileCache', () => {
  test('returns the cached value while the file is unchanged', () => {
    const dir = makeTempDir();
    try {
      const file = join(dir, 'data.txt');
      writeFileSync(file, 'v1');
      const cache = new ParsedFileCache<string>();
      let loads = 0;
      expect(cache.get(file, () => (loads++, 'parsed-v1'))).toBe('parsed-v1');
      expect(cache.get(file, () => (loads++, 'parsed-v1'))).toBe('parsed-v1');
      expect(loads).toBe(1); // second read is served from cache
      expect(cache.size).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('recomputes when the file mtime changes', () => {
    const dir = makeTempDir();
    try {
      const file = join(dir, 'data.txt');
      writeFileSync(file, 'v1');
      const cache = new ParsedFileCache<string>();
      expect(cache.get(file, () => 'old')).toBe('old');

      writeFileSync(file, 'v2');
      // Force a distinct mtime: same-content rewrites can be fast enough that
      // the mtime is unchanged, but content differs so size/mtime must differ.
      const now = new Date();
      utimesSync(file, now, new Date(now.getTime() + 1000));
      expect(cache.get(file, () => 'new')).toBe('new');
      expect(cache.size).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('recomputes when the file size changes', () => {
    const dir = makeTempDir();
    try {
      const file = join(dir, 'data.txt');
      writeFileSync(file, 'short');
      const cache = new ParsedFileCache<string>();
      expect(cache.get(file, () => 'a')).toBe('a');

      writeFileSync(file, 'a much longer content');
      expect(cache.get(file, () => 'b')).toBe('b');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not serve stale entries for missing files', () => {
    const dir = makeTempDir();
    try {
      const file = join(dir, 'missing.txt');
      const cache = new ParsedFileCache<string>();
      let calls = 0;
      expect(cache.get(file, () => (calls++, 'x'))).toBe('x');
      expect(cache.get(file, () => (calls++, 'y'))).toBe('y');
      expect(calls).toBe(2); // never cached: file does not exist
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('invalidate and clear drop entries', () => {
    const dir = makeTempDir();
    try {
      const file = join(dir, 'data.txt');
      writeFileSync(file, 'v1');
      const cache = new ParsedFileCache<string>();
      cache.get(file, () => 'a');
      cache.invalidate(file);
      expect(cache.get(file, () => 'b')).toBe('b');
      cache.clear();
      expect(cache.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadPlugin with a shared cache', () => {
  test('parses each file once across repeated loads', async () => {
    const dir = makeTempDir();
    try {
      const skillFile = 'skills/summarize/SKILL.md';
      const skillMd =
        '---\nname: summarize\ndescription: Summarize things\n---\n# Body\n';
      const manifest = JSON.stringify(
        { $schema: PLUGIN_SCHEMA, name: 'cached-plugin' },
        null,
        2,
      );
      const mcp = JSON.stringify(
        {
          $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
          mcpServers: { local: { type: 'stdio', command: './bin/server' } },
        },
        null,
        2,
      );
      writeFileSync(join(dir, 'plugin.json'), manifest);
      writeFileSync(join(dir, 'mcp.json'), mcp);
      mkdirSync(join(dir, 'skills', 'summarize'), { recursive: true });
      writeFileSync(join(dir, skillFile), skillMd);

      const cache = new ParsedFileCache();
      const first = await loadPlugin(dir, { cache });
      const second = await loadPlugin(dir, { cache });
      expect(first.manifest.name).toBe('cached-plugin');
      expect(second.skills).toHaveLength(1);
      expect(second.mcpConfig).toBeDefined();
      // plugin.json + mcp.json + SKILL.md cached
      expect(cache.size).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('re-loads a file after it changes', async () => {
    const dir = makeTempDir();
    try {
      const manifest = (name: string): string =>
        JSON.stringify({ $schema: PLUGIN_SCHEMA, name }, null, 2);
      writeFileSync(join(dir, 'plugin.json'), manifest('first-name'));

      const cache = new ParsedFileCache();
      const first = await loadPlugin(dir, { cache });
      expect(first.manifest.name).toBe('first-name');

      writeFileSync(join(dir, 'plugin.json'), manifest('second-name'));
      const second = await loadPlugin(dir, { cache });
      expect(second.manifest.name).toBe('second-name');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a fresh skill is discovered on the next cached load', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'plugin.json'),
        JSON.stringify(
          { $schema: PLUGIN_SCHEMA, name: 'grow-plugin' },
          null,
          2,
        ),
      );
      const cache = new ParsedFileCache();
      expect((await loadPlugin(dir, { cache })).skills).toHaveLength(0);

      const skillDir = join(dir, 'skills', 'new-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: new-skill\ndescription: A new skill\n---\nBody\n',
      );
      expect((await loadPlugin(dir, { cache })).skills).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
