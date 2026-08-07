// Shared helpers for rules: diagnostics, file access, JSON member editing,
// and text normalization used by the fix engine.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Diagnostic,
  RuleCategory,
  Severity,
} from '@agent-plugin-doctor/core';

// Reverse-domain namespace, e.g. com.example.client. Two or more dot-separated
// labels; each label is lowercase alphanumeric with optional interior hyphens.
// Mirrors the loader's namespace rule in @agent-plugin-doctor/parser.
export const REVERSE_DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Closed set of top-level fields permitted by the Agent Plugins spec (§5.2).
export const PERMITTED_MANIFEST_FIELDS = [
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
] as const;

/** Build a diagnostic with the canonical fields populated. */
export function makeDiagnostic(
  code: string,
  ruleId: string,
  category: RuleCategory,
  severity: Severity,
  message: string,
  file?: string,
): Diagnostic {
  return { code, severity, message, ruleId, category, file };
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read a text file inside the plugin root, or null if unreadable/absent. */
export function readTextFile(rootDir: string, relPath: string): string | null {
  try {
    const full = join(rootDir, relPath);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

/** Read and parse a JSON file inside the plugin root, or null. */
export function readJsonFile(rootDir: string, relPath: string): unknown | null {
  const raw = readTextFile(rootDir, relPath);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Canonical JSON text: 2-space indentation and a trailing newline.
 * Returns null when the input is not valid JSON.
 */
export function canonicalJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2) + '\n';
  } catch {
    return null;
  }
}

/**
 * Normalize the frontmatter section of a SKILL.md file:
 * - strips a UTF-8 BOM
 * - converts CRLF line endings to LF
 * - trims trailing whitespace on frontmatter lines only (body is untouched)
 *
 * Conservative: the body of the markdown file is preserved byte-for-byte.
 */
export function normalizeSkillFrontmatter(text: string): string {
  let t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  t = t.replace(/\r\n/g, '\n');
  const lines = t.split('\n');
  let inFrontmatter = /^---/.test(lines[0] ?? '');
  const out = lines.map((line, index) => {
    if (!inFrontmatter) return line;
    const trimmed = line.replace(/[ \t]+$/g, '');
    if (index > 0 && (trimmed === '---' || trimmed === '...')) {
      inFrontmatter = false;
    }
    return trimmed;
  });
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// JSON member scanning
//
// A single-pass scanner that walks a JSON document and reports the text spans
// of members matching a predicate. Fixes built from these spans are targeted
// (they only remove/replace the exact member text, including its trailing
// comma), so multiple fixes for the same file apply cleanly in any order and
// are idempotent.
// ---------------------------------------------------------------------------

export interface JsonMemberSpan {
  start: number;
  end: number;
  key: string;
}

type MemberAction =
  { type: 'keep' } | { type: 'remove' } | { type: 'rewrite-key'; key: string };

interface RawEdit {
  start: number;
  end: number;
  replacement?: string;
  key?: string;
}

/**
 * Scan JSON text and produce an edit per member whose predicate matches.
 * `visit` receives the object-path of the member (array of keys from the
 * document root to the object containing it; top-level members have path [])
 * and the member key.
 *
 * Removal spans include the trailing comma (or the preceding comma for the
 * last member) so the result stays valid JSON.
 *
 * @returns The list of edits, or null when the text is not valid JSON
 */
function scanJsonMembers(
  raw: string,
  visit: (path: string[], key: string) => MemberAction,
): RawEdit[] | null {
  const n = raw.length;
  const isWs = (ch: string): boolean =>
    ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  const skipWs = (p: number): number => {
    while (p < n && isWs(raw[p])) p++;
    return p;
  };

  const readString = (p: number): { end: number; value: string } | null => {
    if (raw[p] !== '"') return null;
    let j = p + 1;
    while (j < n) {
      const ch = raw[j];
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (ch === '"') {
        try {
          return {
            end: j + 1,
            value: JSON.parse(raw.slice(p, j + 1)) as string,
          };
        } catch {
          return null;
        }
      }
      j++;
    }
    return null;
  };

  const edits: RawEdit[] = [];

  const parseValue = (p: number, path: string[]): number | null => {
    const ch = raw[p];
    if (ch === '"') {
      const s = readString(p);
      return s === null ? null : s.end;
    }
    if (ch === '{') return parseObject(p, path);
    if (ch === '[') return parseArray(p, path);
    // scalar
    let j = p;
    while (
      j < n &&
      !isWs(raw[j]) &&
      raw[j] !== ',' &&
      raw[j] !== '}' &&
      raw[j] !== ']'
    )
      j++;
    return j > p ? j : null;
  };

  const parseObject = (p: number, path: string[]): number | null => {
    // `lead` is the raw position right after the previous delimiter (the '{'
    // or the previous member's comma). Removal spans start there so the
    // member is removed together with its leading whitespace, leaving no
    // indentation residue and keeping edits order-independent.
    let lead = p + 1;
    let pos = skipWs(lead);
    if (raw[pos] === '}') return pos + 1;
    while (pos < n) {
      const keyStart = pos;
      const keyInfo = readString(pos);
      if (keyInfo === null) return null;
      pos = skipWs(keyInfo.end);
      if (raw[pos] !== ':') return null;
      pos = skipWs(pos + 1);
      const childPath = [...path, keyInfo.value];
      const valueEnd = parseValue(pos, childPath);
      if (valueEnd === null) return null;

      const action = visit(path, keyInfo.value);
      if (action.type === 'remove') {
        let s = lead;
        let e = valueEnd;
        const q = skipWs(valueEnd);
        if (raw[q] === ',') {
          // Middle member: include the trailing comma so the separator stays
          // balanced after removal.
          e = q + 1;
        } else if (raw[lead - 1] === ',') {
          // Last member: include the preceding comma (lead starts right after
          // it), so no trailing comma is left behind.
          s = lead - 1;
        }
        // Drop any nested edits recorded inside the removed member.
        for (let i = edits.length - 1; i >= 0; i--) {
          if (edits[i].start >= s && edits[i].end <= e) edits.splice(i, 1);
        }
        edits.push({ start: s, end: e, key: keyInfo.value });
      } else if (action.type === 'rewrite-key') {
        edits.push({
          start: keyStart,
          end: keyInfo.end,
          replacement: JSON.stringify(action.key),
          key: keyInfo.value,
        });
      }

      pos = skipWs(valueEnd);
      if (raw[pos] === ',') {
        lead = pos + 1;
        pos = skipWs(pos + 1);
        continue;
      }
      if (raw[pos] === '}') return pos + 1;
      return null;
    }
    return null;
  };

  const parseArray = (p: number, path: string[]): number | null => {
    let pos = skipWs(p + 1);
    if (raw[pos] === ']') return pos + 1;
    while (pos < n) {
      const end = parseValue(pos, path);
      if (end === null) return null;
      pos = skipWs(end);
      if (raw[pos] === ',') {
        pos = skipWs(pos + 1);
        continue;
      }
      if (raw[pos] === ']') return pos + 1;
      return null;
    }
    return null;
  };

  const rootEnd = parseValue(0, []);
  if (rootEnd === null || skipWs(rootEnd) !== n) return null;
  return edits;
}

function applyEdits(raw: string, edits: RawEdit[]): string | null {
  if (edits.length === 0) return null;
  const sorted = edits.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const edit of sorted) {
    out += raw.slice(pos, edit.start);
    out += edit.replacement ?? '';
    pos = edit.end;
  }
  out += raw.slice(pos);
  return out;
}

/**
 * Find the text spans of members matching a predicate. Returns null when the
 * text is not valid JSON.
 */
export function findJsonMemberSpans(
  raw: string,
  matches: (path: string[], key: string) => boolean,
): JsonMemberSpan[] | null {
  const edits = scanJsonMembers(raw, (path, key) =>
    matches(path, key) ? { type: 'remove' } : { type: 'keep' },
  );
  if (edits === null) return null;
  return edits
    .filter((edit) => edit.key !== undefined)
    .map((edit) => ({
      start: edit.start,
      end: edit.end,
      key: edit.key as string,
    }));
}

/**
 * Find the text spans of duplicate members (case-insensitive key match)
 * among members matching the predicate, keeping the first occurrence of each
 * key. Used to dedupe HTTP header names.
 */
export function findDuplicateJsonMemberSpans(
  raw: string,
  matches: (path: string[], key: string) => boolean,
): JsonMemberSpan[] | null {
  const seen = new Set<string>();
  const edits = scanJsonMembers(raw, (path, key) => {
    if (!matches(path, key)) return { type: 'keep' };
    const lower = key.toLowerCase();
    if (seen.has(lower)) return { type: 'remove' };
    seen.add(lower);
    return { type: 'keep' };
  });
  if (edits === null) return null;
  return edits
    .filter((edit) => edit.key !== undefined)
    .map((edit) => ({
      start: edit.start,
      end: edit.end,
      key: edit.key as string,
    }));
}

/**
 * Rewrite members matching a predicate: rename each matching key via
 * `rename` (returning the new key) or remove it when `rename` returns null.
 * Returns the edited text, or null when invalid JSON or nothing matched.
 */
export function rewriteJsonMembers(
  raw: string,
  matches: (path: string[], key: string) => boolean,
  rename: (path: string[], key: string) => string | null,
): string | null {
  const edits = scanJsonMembers(raw, (path, key) => {
    if (!matches(path, key)) return { type: 'keep' };
    const next = rename(path, key);
    return next === null || next === key
      ? { type: 'remove' }
      : { type: 'rewrite-key', key: next };
  });
  if (edits === null) return null;
  return applyEdits(raw, edits);
}

/**
 * Build a delete-style fix that removes one member of a JSON file.
 * `oldText` is the exact span of the member in the raw text, so applying the
 * fix leaves every other byte of the file untouched.
 */
export function memberRemovalFix(
  raw: string,
  span: JsonMemberSpan,
  file: string,
  description: string,
): {
  kind: 'replace';
  file: string;
  description: string;
  oldText: string;
  newText: string;
} {
  return {
    kind: 'replace',
    file,
    description,
    oldText: raw.slice(span.start, span.end),
    newText: '',
  };
}
