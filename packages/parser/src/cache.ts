// In-memory cache for parsed files.
//
// Parsing is the most expensive part of loading a plugin (JSON schema
// validation, YAML frontmatter parsing). Repeated `loadPlugin` calls for the
// same directory — for example in watch mode or during incremental
// validation — re-parse unchanged files for no reason.
//
// The cache is keyed by absolute file path and invalidated by the file's
// mtime and size: when either changes, the entry is recomputed on the next
// read. A cache instance is opt-in: callers pass it via `loadPlugin`'s
// `options.cache` so behavior without a cache is byte-for-byte unchanged.
//
// The cache stores the *parsed result* of a file (not the raw text), so the
// expensive parse is skipped entirely on a hit.

import { statSync } from 'node:fs';

/** The identity of a file at the time it was parsed. */
interface FileIdentity {
  mtimeMs: number;
  size: number;
}

/**
 * A simple mtime-keyed cache for parsed file contents.
 *
 * `get` stats the file, returns the cached value when the file is unchanged,
 * and otherwise calls `load` and stores its result. The `load` function must
 * be pure with respect to the file contents — the result is reused until the
 * file's mtime or size changes.
 *
 * Unreadable files are never cached: if the stat fails, the entry is dropped
 * and `load` is called (so transient errors are not served stale).
 */
export class ParsedFileCache<T = unknown> {
  private readonly entries = new Map<string, FileIdentity & { value: T }>();

  /**
   * Return the cached value for `filePath` when the file is unchanged, or
   * compute it with `load`, store it, and return it.
   */
  get(filePath: string, load: () => T): T {
    let identity: FileIdentity | null = null;
    try {
      const stat = statSync(filePath);
      identity = { mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
      // File is unreadable (missing, permissions, …): never serve a stale
      // entry; drop it and let `load` decide what to do.
      this.entries.delete(filePath);
      return load();
    }

    const cached = this.entries.get(filePath);
    if (
      cached !== undefined &&
      cached.mtimeMs === identity.mtimeMs &&
      cached.size === identity.size
    ) {
      return cached.value;
    }

    const value = load();
    this.entries.set(filePath, { ...identity, value });
    return value;
  }

  /** Drop a single entry (e.g. after a known write to the file). */
  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  /** Drop every entry. */
  clear(): void {
    this.entries.clear();
  }

  /** Number of cached entries. */
  get size(): number {
    return this.entries.size;
  }
}
