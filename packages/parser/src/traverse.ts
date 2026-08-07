// Bounded filesystem traversal for plugin trees.
//
// Plugin directories are untrusted input and can contain arbitrarily deep or
// large trees (a vendored `node_modules`, a `.git` directory, generated
// output). To keep scans fast and predictable, traversal:
//
// - skips `.git` and `node_modules` directories
// - skips hidden files and directories (names starting with `.`)
// - never follows symlinks (Dirent-based walk; symlinked entries are skipped,
//   matching the loader's security posture of never following links)
// - caps directory depth at TRAVERSAL_MAX_DEPTH levels below the root
// - caps the number of returned files at TRAVERSAL_MAX_FILES
//
// The loader itself does not need deep traversal — skills are discovered at a
// fixed depth and extensions at the plugin root — but tooling (benchmarks,
// future packaging/archive features, tree scans) uses this bounded walker so
// a hostile plugin can never force an unbounded scan.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Maximum directory depth below the plugin root (root = level 0). */
export const TRAVERSAL_MAX_DEPTH = 10;

/** Maximum number of files returned by a single walk. */
export const TRAVERSAL_MAX_FILES = 1000;

/** Directories skipped by name regardless of other options. */
export const TRAVERSAL_SKIP_DIRS = new Set(['.git', 'node_modules']);

export interface WalkOptions {
  /** Maximum depth below the root (default TRAVERSAL_MAX_DEPTH). */
  maxDepth?: number;
  /** Maximum number of files (default TRAVERSAL_MAX_FILES). */
  maxFiles?: number;
  /** Additional directory names to skip (always includes .git/node_modules). */
  skipDirs?: Iterable<string>;
}

export interface WalkResult {
  /** Plugin-relative file paths with '/' separators, no leading './'. */
  files: string[];
  /** True when the walk hit a depth or file-count cap and stopped early. */
  truncated: boolean;
}

/**
 * Walk a plugin tree and return every regular file as a plugin-relative path.
 *
 * Bounds: skips hidden entries, `.git`, `node_modules` (plus any extra
 * `skipDirs`), never follows symlinks, stops descending past `maxDepth`, and
 * stops collecting past `maxFiles` files. When a cap is hit, `truncated` is
 * true and `files` contains the files collected up to that point.
 */
export function walkPluginFiles(
  rootDir: string,
  options: WalkOptions = {},
): WalkResult {
  const maxDepth = options.maxDepth ?? TRAVERSAL_MAX_DEPTH;
  const maxFiles = options.maxFiles ?? TRAVERSAL_MAX_FILES;
  const skip = new Set<string>(TRAVERSAL_SKIP_DIRS);
  for (const name of options.skipDirs ?? []) {
    skip.add(name);
  }

  const files: string[] = [];
  let truncated = false;

  const walk = (dir: string, rel: string, depth: number): void => {
    if (depth > maxDepth) {
      truncated = true;
      return;
    }
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory: nothing more to collect from it
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      const name = entry.name;
      if (name.startsWith('.')) continue; // hidden files and directories
      const childRel = rel === '' ? name : `${rel}/${name}`;
      if (entry.isDirectory()) {
        if (skip.has(name)) continue;
        walk(join(dir, name), childRel, depth + 1);
      } else if (entry.isFile()) {
        // Symlinked files are not regular Dirents and are intentionally
        // skipped; the walker never follows links.
        files.push(childRel);
      }
    }
  };

  walk(rootDir, '', 0);
  return { files, truncated };
}
