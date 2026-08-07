import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, relative, sep } from 'node:path';
import {
  isAbsolutePath,
  isValidPluginPath,
  isWithinPath,
  normalizePath,
  resolvePluginPath,
} from '../src/index.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'doctor-path-'));
}

describe('resolvePluginPath', () => {
  test('resolves a valid plugin-relative path against the root', () => {
    const root = makeTempDir();
    const realRoot = realpathSync(root);
    try {
      writeFileSync(join(root, 'skill.md'), 'body');
      const result = resolvePluginPath(root, './skill.md');
      expect(isWithinPath(result, realRoot)).toBe(true);
      expect(result.endsWith(join('skill.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolves paths in nested directories', () => {
    const root = makeTempDir();
    const realRoot = realpathSync(root);
    try {
      mkdirSync(join(root, 'skills'), { recursive: true });
      writeFileSync(join(root, 'skills', 'summarize.md'), 'body');
      const result = resolvePluginPath(root, './skills/summarize.md');
      expect(isWithinPath(result, realRoot)).toBe(true);
      expect(result.endsWith(join('skills', 'summarize.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolves the root itself ("./")', () => {
    const root = makeTempDir();
    try {
      const result = resolvePluginPath(root, './');
      expect(result).toBe(realpathSync(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolves with a relative plugin root', () => {
    const root = makeTempDir();
    const realRoot = realpathSync(root);
    try {
      writeFileSync(join(root, 'a.md'), 'x');
      const relRoot = relative(process.cwd(), root);
      const result = resolvePluginPath(relRoot, './a.md');
      expect(isWithinPath(result, realRoot)).toBe(true);
      expect(result.endsWith(join('a.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects absolute paths', () => {
    const root = makeTempDir();
    try {
      expect(() => resolvePluginPath(root, '/etc/passwd')).toThrow(
        /plugin-relative/,
      );
      expect(() => resolvePluginPath(root, join(root, 'skill.md'))).toThrow(
        /plugin-relative/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects paths without a "./" prefix', () => {
    const root = makeTempDir();
    try {
      expect(() => resolvePluginPath(root, 'skill.md')).toThrow(
        /plugin-relative/,
      );
      expect(() => resolvePluginPath(root, 'skills/summarize.md')).toThrow(
        /plugin-relative/,
      );
      expect(() => resolvePluginPath(root, '')).toThrow(/plugin-relative/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects paths that escape the root via ".."', () => {
    const root = makeTempDir();
    try {
      expect(() => resolvePluginPath(root, './../secret')).toThrow(
        /escapes plugin root/,
      );
      expect(() => resolvePluginPath(root, './sub/../../out')).toThrow(
        /escapes plugin root/,
      );
      expect(() => resolvePluginPath(root, './..')).toThrow(
        /escapes plugin root/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects paths that escape via a symlinked directory', () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    try {
      writeFileSync(join(outside, 'secret.txt'), 'secret');
      symlinkSync(outside, join(root, 'escape'));
      expect(() => resolvePluginPath(root, './escape/secret.txt')).toThrow(
        /symlink|escapes plugin root/,
      );
      expect(() => resolvePluginPath(root, './escape')).toThrow(
        /symlink|escapes plugin root/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('rejects paths that escape via a symlinked file', () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    try {
      writeFileSync(join(outside, 'secret.txt'), 'secret');
      symlinkSync(join(outside, 'secret.txt'), join(root, 'linked.txt'));
      expect(() => resolvePluginPath(root, './linked.txt')).toThrow(
        /symlink|escapes plugin root/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('allows a symlink that stays inside the root', () => {
    const root = makeTempDir();
    try {
      writeFileSync(join(root, 'target.md'), 'body');
      symlinkSync(join(root, 'target.md'), join(root, 'alias.md'));
      const result = resolvePluginPath(root, './alias.md');
      expect(result.endsWith(join('target.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns the lexical path for non-existent files', () => {
    const root = makeTempDir();
    try {
      const result = resolvePluginPath(root, './does-not-exist.md');
      expect(result).toBe(join(root, 'does-not-exist.md'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns the lexical path for broken symlinks (ENOENT)', () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    try {
      symlinkSync(join(outside, 'missing.md'), join(root, 'broken.md'));
      const result = resolvePluginPath(root, './broken.md');
      // Lexically still inside the root — no escape, no throw.
      expect(isWithinPath(result, root)).toBe(true);
      expect(result.endsWith(join('broken.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('isWithinPath', () => {
  test('returns true for equal paths', () => {
    expect(isWithinPath('/a', '/a')).toBe(true);
    expect(isWithinPath('/a/b', '/a/b')).toBe(true);
  });

  test('returns true for contained paths', () => {
    expect(isWithinPath('/a/b', '/a')).toBe(true);
    expect(isWithinPath('/a/b/c', '/a')).toBe(true);
    expect(isWithinPath('/a/b/c', '/a/b')).toBe(true);
  });

  test('returns false for sibling prefixes (boundary check)', () => {
    expect(isWithinPath('/ab', '/a')).toBe(false);
    expect(isWithinPath('/a-b/c', '/a')).toBe(false);
  });

  test('returns false for unrelated paths', () => {
    expect(isWithinPath('/x/y', '/a')).toBe(false);
    expect(isWithinPath('/a/b', '/a/c')).toBe(false);
  });

  test('handles the filesystem root correctly', () => {
    expect(isWithinPath('/', '/')).toBe(true);
    expect(isWithinPath('/etc', '/')).toBe(true);
    expect(isWithinPath('/usr/local', '/')).toBe(true);
  });

  test('handles a parent that already ends with a separator', () => {
    // Pins cross-platform containment: on Windows node:path produces
    // backslash-separated paths, so the prefix must use the platform
    // separator and must not double it when the parent ends with one.
    expect(isWithinPath('/a/b/c', '/a/b/')).toBe(true);
    expect(isWithinPath('/a/b/c', '/a/b' + sep)).toBe(true);
  });

  test('handles redundant separators and dot segments', () => {
    expect(isWithinPath('/a//b/../b/c', '/a')).toBe(true);
    expect(isWithinPath('/a', '/a/b/..')).toBe(true);
  });
});

describe('isValidPluginPath', () => {
  test('returns true for valid plugin-relative paths', () => {
    const root = makeTempDir();
    try {
      expect(isValidPluginPath(root, './skill.md')).toBe(true);
      expect(isValidPluginPath(root, './skills/a/b.md')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns false for traversal and non-relative paths', () => {
    const root = makeTempDir();
    try {
      expect(isValidPluginPath(root, '../out')).toBe(false);
      expect(isValidPluginPath(root, '/etc/passwd')).toBe(false);
      expect(isValidPluginPath(root, 'skill.md')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns false for symlink escapes', () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    try {
      writeFileSync(join(outside, 'secret.txt'), 'secret');
      symlinkSync(outside, join(root, 'escape'));
      expect(isValidPluginPath(root, './escape/secret.txt')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('normalizePath and isAbsolutePath', () => {
  test('normalizePath collapses redundant segments', () => {
    // normalizePath wraps node:path.normalize, which is platform-specific
    // ('/a/c' on POSIX, '\a\c' on Windows); compare against the platform
    // result so the assertion holds everywhere.
    expect(normalizePath('/a//b/../c')).toBe(normalize('/a//b/../c'));
    expect(normalizePath('a/./b')).toBe(normalize('a/./b'));
  });

  test('isAbsolutePath detects absolute paths', () => {
    expect(isAbsolutePath('/etc/passwd')).toBe(true);
    expect(isAbsolutePath('etc/passwd')).toBe(false);
    expect(isAbsolutePath('./x')).toBe(false);
  });
});
