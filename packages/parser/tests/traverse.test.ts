import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TRAVERSAL_MAX_DEPTH,
  TRAVERSAL_MAX_FILES,
  walkPluginFiles,
} from '../src/index.js';

function makeTempDir(prefix = 'doctor-traverse-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeTree(root: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(root, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

describe('walkPluginFiles', () => {
  test('walks a nested tree and returns relative paths', () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': '{}',
        'skills/a/SKILL.md': 'x',
        'skills/a/scripts/run.sh': 'echo',
        'com.example.client/hooks/hooks.json': '{}',
      });
      const result = walkPluginFiles(dir);
      expect(result.files).toEqual([
        'com.example.client/hooks/hooks.json',
        'plugin.json',
        // localeCompare is case-insensitive, so "scripts" < "SKILL.md"
        'skills/a/scripts/run.sh',
        'skills/a/SKILL.md',
      ]);
      expect(result.truncated).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('skips .git, node_modules, and hidden entries', () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': '{}',
        '.git/config': 'repo',
        '.hidden/file.txt': 'secret',
        '.dotfile': 'hidden file',
        'node_modules/pkg/index.js': 'vendor',
        'skills/a/SKILL.md': 'x',
      });
      const result = walkPluginFiles(dir);
      expect(result.files).toEqual(['plugin.json', 'skills/a/SKILL.md']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('honors extra skipDirs', () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': '{}',
        'vendor/lib.js': 'x',
        'src/main.ts': 'x',
      });
      const result = walkPluginFiles(dir, { skipDirs: ['vendor'] });
      expect(result.files).toEqual(['plugin.json', 'src/main.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('caps directory depth and reports truncation', () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'a/b/c/d/e/f/g/h/i/j/k/l/m.txt': 'deep',
        'top.txt': 'shallow',
      });
      // Default cap is 10 levels below the root.
      const result = walkPluginFiles(dir);
      expect(result.files).toContain('top.txt');
      expect(result.truncated).toBe(true);
      // The 13-level file must be truncated (level 11 > maxDepth 10).
      expect(result.files.some((f) => f.endsWith('m.txt'))).toBe(false);
      expect(TRAVERSAL_MAX_DEPTH).toBe(10);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('caps file count and reports truncation', () => {
    const dir = makeTempDir();
    try {
      for (let i = 0; i < 15; i++) {
        writeFileSync(join(dir, `file-${String(i).padStart(2, '0')}.txt`), 'x');
      }
      const result = walkPluginFiles(dir, { maxFiles: 5 });
      expect(result.files).toHaveLength(5);
      expect(result.truncated).toBe(true);
      expect(TRAVERSAL_MAX_FILES).toBe(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('missing root yields no files and no truncation', () => {
    const missing = join(tmpdir(), 'doctor-traverse-missing-' + Date.now());
    const result = walkPluginFiles(missing);
    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
