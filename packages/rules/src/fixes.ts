// Auto-fix engine: applies diagnostic fixes to plugin files on disk.
//
// All fixes are applied against the current file content, and every replace
// fix is matched textually. Fixes are idempotent: applying a fix whose target
// state is already present is a no-op success, and running applyFixes twice
// never changes a file twice.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isWithinPath } from '@agent-plugin-doctor/core';
import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import { canonicalJson, normalizeSkillFrontmatter } from './util.js';

export interface FixResult {
  applied: number;
  failed: number;
  fixes: AppliedFix[];
}

export interface AppliedFix {
  diagnostic: Diagnostic;
  fix: Fix;
  success: boolean;
  error?: string;
}

export interface ApplyFixesOptions {
  dryRun?: boolean;
}

type Outcome = { ok: true; applied: boolean } | { ok: false; error: string };

/**
 * Apply every fix attached to the given diagnostics.
 *
 * Fixes are applied in order; each fix re-reads the file it targets so earlier
 * fixes never invalidate later ones. A fix that would not change anything (its
 * target state is already reached) counts as applied without modifying the
 * file, which is what makes repeated runs idempotent.
 *
 * @param rootDir - Absolute path to the plugin root
 * @param diagnostics - Diagnostics that may carry fixes
 * @param options - dryRun: compute results without touching the filesystem
 */
export async function applyFixes(
  rootDir: string,
  diagnostics: Diagnostic[],
  options: ApplyFixesOptions = {},
): Promise<FixResult> {
  const dryRun = options.dryRun === true;
  const entries = diagnostics
    .filter((diagnostic) => diagnostic.fix !== undefined)
    .map((diagnostic) => ({ diagnostic, fix: diagnostic.fix as Fix }));

  const fixes: AppliedFix[] = [];
  let applied = 0;
  let failed = 0;

  for (const { diagnostic, fix } of entries) {
    const outcome = applyOneFix(rootDir, diagnostic, fix, dryRun);
    if (outcome.ok) {
      if (outcome.applied) applied++;
      fixes.push({ diagnostic, fix, success: true });
    } else {
      failed++;
      fixes.push({ diagnostic, fix, success: false, error: outcome.error });
    }
  }

  return { applied, failed, fixes };
}

function applyOneFix(
  rootDir: string,
  diagnostic: Diagnostic,
  fix: Fix,
  dryRun: boolean,
): Outcome {
  switch (fix.kind) {
    case 'replace':
      return applyReplace(rootDir, diagnostic, fix, dryRun);
    case 'insert':
      return applyInsert(rootDir, fix, dryRun);
    case 'delete':
      return applyDelete(rootDir, fix, dryRun);
    case 'rename':
      return applyRename(rootDir, fix, dryRun);
    default:
      return fail(`Unknown fix kind: ${fix.kind}`);
  }
}

function resolveWithin(rootDir: string, relPath: string): string {
  const root = resolve(rootDir);
  const full = resolve(root, relPath);
  if (!isWithinPath(full, root)) {
    throw new Error(`Fix path escapes plugin root: ${relPath}`);
  }
  return full;
}

function fail(error: string): Outcome {
  return { ok: false, error };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove the first whitespace-tolerant match of `oldText` from `content`.
 * Runs of whitespace in the target text match any whitespace, so a member
 * removal fix applies even when the file was reformatted since the fix was
 * computed.
 */
function fuzzyRemoval(content: string, oldText: string): string | null {
  const pattern = new RegExp(escapeRegExp(oldText).replace(/\s+/g, '\\s+'));
  const match = pattern.exec(content);
  if (match === null) return null;
  return (
    content.slice(0, match.index) + content.slice(match.index + match[0].length)
  );
}

function applyReplace(
  rootDir: string,
  diagnostic: Diagnostic,
  fix: Fix,
  dryRun: boolean,
): Outcome {
  if (!fix.oldText) return fail('Replace fix requires oldText');
  let full: string;
  try {
    full = resolveWithin(rootDir, fix.file);
  } catch (error) {
    return fail((error as Error).message);
  }

  let content: string;
  try {
    content = readFileSync(full, 'utf8');
  } catch (error) {
    return fail(`Cannot read ${fix.file}: ${(error as Error).message}`);
  }

  if (content.includes(fix.oldText)) {
    const next = content.split(fix.oldText).join(fix.newText ?? '');
    if (next === content) return { ok: true, applied: false };
    if (!dryRun) writeFileSync(full, next, 'utf8');
    return { ok: true, applied: true };
  }

  // Whitespace-tolerant removal: a delete-style fix whose target member was
  // reformatted by an earlier fix (e.g. JSON canonicalization) may no longer
  // match byte-for-byte. Re-match with flexible whitespace so the removal
  // still applies in any fix order.
  if (fix.newText === '') {
    const fuzzy = fuzzyRemoval(content, fix.oldText);
    if (fuzzy !== null) {
      if (!dryRun) writeFileSync(full, fuzzy, 'utf8');
      return { ok: true, applied: true };
    }
    // Target member is already gone: no-op (idempotence).
    return { ok: true, applied: false };
  }

  // Target state already present: applying again is a no-op.
  if (fix.newText && content.includes(fix.newText)) {
    return { ok: true, applied: false };
  }

  // The file may have been modified by an earlier fix (e.g. another rule
  // rewrote it). Format fixes are re-derived against the current content so
  // they stay correct and conflict-free.
  if (diagnostic.category === 'format') {
    const normalized = fix.file.endsWith('.json')
      ? canonicalJson(content)
      : fix.file.endsWith('.md')
        ? normalizeSkillFrontmatter(content)
        : null;
    if (normalized !== null && normalized !== content) {
      if (!dryRun) writeFileSync(full, normalized, 'utf8');
      return { ok: true, applied: true };
    }
    if (normalized !== null && normalized === content) {
      return { ok: true, applied: false };
    }
  }

  return fail(`Fix for ${fix.file} no longer applies (old text not found)`);
}

function applyInsert(rootDir: string, fix: Fix, dryRun: boolean): Outcome {
  if (!fix.oldText) return fail('Insert fix requires oldText');
  let full: string;
  try {
    full = resolveWithin(rootDir, fix.file);
  } catch (error) {
    return fail((error as Error).message);
  }
  let content: string;
  try {
    content = readFileSync(full, 'utf8');
  } catch (error) {
    return fail(`Cannot read ${fix.file}: ${(error as Error).message}`);
  }
  if (fix.newText && content.includes(fix.newText)) {
    return { ok: true, applied: false };
  }
  const index = content.indexOf(fix.oldText);
  if (index === -1) {
    return fail(`Insert anchor not found in ${fix.file}`);
  }
  const next =
    content.slice(0, index) + (fix.newText ?? '') + content.slice(index);
  if (next === content) return { ok: true, applied: false };
  if (!dryRun) writeFileSync(full, next, 'utf8');
  return { ok: true, applied: true };
}

function applyDelete(rootDir: string, fix: Fix, dryRun: boolean): Outcome {
  if (!fix.oldText) return fail('Delete fix requires oldText');
  let full: string;
  try {
    full = resolveWithin(rootDir, fix.file);
  } catch (error) {
    return fail((error as Error).message);
  }
  let content: string;
  try {
    content = readFileSync(full, 'utf8');
  } catch (error) {
    return fail(`Cannot read ${fix.file}: ${(error as Error).message}`);
  }
  if (!content.includes(fix.oldText)) {
    // Already deleted: target state reached.
    return { ok: true, applied: false };
  }
  const next = content.split(fix.oldText).join('');
  if (!dryRun) writeFileSync(full, next, 'utf8');
  return { ok: true, applied: true };
}

function applyRename(rootDir: string, fix: Fix, dryRun: boolean): Outcome {
  if (!fix.oldPath || !fix.newPath) {
    return fail('Rename fix requires oldPath and newPath');
  }
  let source: string;
  let target: string;
  try {
    source = resolveWithin(rootDir, fix.oldPath);
    target = resolveWithin(rootDir, fix.newPath);
  } catch (error) {
    return fail((error as Error).message);
  }
  if (!existsSync(source)) {
    // Already renamed: target state reached.
    if (existsSync(target)) return { ok: true, applied: false };
    return fail(`Source path does not exist: ${fix.oldPath}`);
  }
  if (existsSync(target)) {
    return fail(`Refusing to overwrite existing path: ${fix.newPath}`);
  }
  if (dryRun) return { ok: true, applied: true };
  try {
    renameSync(source, target);
    return { ok: true, applied: true };
  } catch (error) {
    return fail(`Rename failed: ${(error as Error).message}`);
  }
}
