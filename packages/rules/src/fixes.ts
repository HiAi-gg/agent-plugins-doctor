// Auto-fix engine: applies diagnostic fixes to plugin files on disk.
//
// All fixes are applied against the current file content, and every replace
// fix is matched textually. Fixes are idempotent: applying a fix whose target
// state is already present is a no-op success, and running applyFixes twice
// never changes a file twice.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isWithinPath } from '@agent-plugins-doctor/core';
import type { Diagnostic, Fix } from '@agent-plugins-doctor/core';
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
 * fixes never invalidate later ones. Directory renames are applied last (see
 * the sorting below). A fix that would not change anything (its target state
 * is already reached) counts as applied without modifying the file, which is
 * what makes repeated runs idempotent.
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

  // Directory renames change paths, which would invalidate any later content
  // fix that targets a file inside the renamed directory. Apply renames last
  // (the stable sort keeps diagnostic order within each group) so content
  // fixes always run against the paths they were computed for, and a rename
  // can never strand a fix on an ENOENT path.
  entries.sort((a, b) => {
    const aRename = a.fix.kind === 'rename' ? 1 : 0;
    const bRename = b.fix.kind === 'rename' ? 1 : 0;
    return aRename - bRename;
  });

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

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Remove one JSON object member from `content`.
 *
 * `oldText` is the member's text span (leading whitespace through its value,
 * without separators) as computed by the JSON member scanner. Matching is
 * whitespace-tolerant, so the member is found even when the file was
 * reformatted since the fix was computed, and the surrounding separator is
 * cleaned up here: a trailing comma when the member is in the middle of its
 * object, otherwise the preceding comma. Because the span never includes the
 * comma, several removals from the same object apply in any order against a
 * changing file and converge to the same result.
 *
 * @returns The content with the member removed, or null when it is gone
 */
function removeJsonMember(content: string, oldText: string): string | null {
  let start: number;
  let end: number;
  const exact = content.indexOf(oldText);
  if (exact !== -1) {
    start = exact;
    end = exact + oldText.length;
  } else {
    const pattern = new RegExp(escapeRegExp(oldText).replace(/\s+/g, '\\s+'));
    const match = pattern.exec(content);
    if (match === null) return null;
    start = match.index;
    end = match.index + match[0].length;
  }
  // Trailing comma: the member sits in the middle of its object.
  let p = end;
  while (p < content.length && isWhitespace(content[p])) p++;
  if (content[p] === ',') {
    end = p + 1;
  } else {
    // No trailing comma: the member is (now) last; remove the preceding
    // comma together with the whitespace between it and the member.
    let q = start - 1;
    while (q >= 0 && isWhitespace(content[q])) q--;
    if (content[q] === ',') start = q;
  }
  return content.slice(0, start) + content.slice(end);
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

  // Delete-style fixes (newText === '') remove a JSON member: match the span
  // exactly or with flexible whitespace, and clean up the surrounding comma.
  // This branch runs before the exact-match replacement below so removals
  // stay order-independent when several members of the same object are
  // removed and when the file was reformatted by an earlier fix.
  if (fix.newText === '') {
    const removed = removeJsonMember(content, fix.oldText);
    if (removed !== null) {
      if (removed === content) return { ok: true, applied: false };
      if (!dryRun) writeFileSync(full, removed, 'utf8');
      return { ok: true, applied: true };
    }
    // Target member is already gone: no-op (idempotence).
    return { ok: true, applied: false };
  }

  if (content.includes(fix.oldText)) {
    const next = content.split(fix.oldText).join(fix.newText ?? '');
    if (next === content) return { ok: true, applied: false };
    if (!dryRun) writeFileSync(full, next, 'utf8');
    return { ok: true, applied: true };
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
