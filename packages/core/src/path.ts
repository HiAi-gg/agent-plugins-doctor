// Path security utilities
// Security boundary: enforces containment and prevents traversal

import { resolve, normalize, isAbsolute } from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * Resolve a plugin-relative path against the plugin root.
 * Enforces:
 * - Path must start with './' (plugin-relative)
 * - Resolved path must stay within plugin root
 * - Symlink escapes are rejected
 *
 * @throws Error if path escapes plugin root or is not plugin-relative
 */
export function resolvePluginPath(
  pluginRoot: string,
  relativePath: string,
): string {
  // Must be plugin-relative (start with './')
  if (!relativePath.startsWith('./')) {
    throw new Error(
      `Path must be plugin-relative (start with './'): ${relativePath}`,
    );
  }

  // Normalize the root to an absolute path so containment checks are reliable
  // even when the caller passes a relative plugin root.
  const root = resolve(pluginRoot);
  const resolved = resolve(root, relativePath);

  // Check containment (lexical)
  if (!isWithinPath(resolved, root)) {
    throw new Error(`Path escapes plugin root: ${relativePath}`);
  }

  // Check for symlink escapes (real path)
  try {
    const realPath = realpathSync(resolved);
    const realRoot = realpathSync(root);
    if (!isWithinPath(realPath, realRoot)) {
      throw new Error(`Path escapes plugin root via symlink: ${relativePath}`);
    }
    return realPath;
  } catch (error) {
    // If file doesn't exist yet, that's okay (e.g., during fix operations)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolved;
    }
    throw error;
  }
}

/**
 * Check if a child path is within a parent path.
 * Uses normalized paths to handle redundant separators and '..' segments.
 */
export function isWithinPath(child: string, parent: string): boolean {
  const normalizedChild = normalize(child);
  const normalizedParent = normalize(parent);

  // Child must equal parent, or start with parent + separator
  if (normalizedChild === normalizedParent) {
    return true;
  }

  // When the parent is the filesystem root ('/'), every absolute path is
  // contained; appending '/' would produce '//' and break the prefix check.
  if (normalizedParent === '/') {
    return normalizedChild.startsWith('/');
  }

  return normalizedChild.startsWith(normalizedParent + '/');
}

/**
 * Normalize a path for consistent comparison.
 */
export function normalizePath(p: string): string {
  return normalize(p);
}

/**
 * Check if a path is absolute.
 */
export function isAbsolutePath(p: string): boolean {
  return isAbsolute(p);
}

/**
 * Validate that a path is plugin-relative and contained.
 * Returns true if valid, false otherwise.
 */
export function isValidPluginPath(
  pluginRoot: string,
  relativePath: string,
): boolean {
  try {
    resolvePluginPath(pluginRoot, relativePath);
    return true;
  } catch {
    return false;
  }
}
