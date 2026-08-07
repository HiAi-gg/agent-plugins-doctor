// Shared helpers for the report formatters

import type { Diagnostic, Severity } from '@agent-plugins-doctor/core';

/** Severity order from most to least severe. */
export const SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'error',
  'warning',
  'info',
];

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

/** Sort diagnostics by severity (most severe first), then code, then message. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (rank !== 0) return rank;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });
}

/** Worst severity rank among a set of diagnostics (0 when empty). */
export function worstSeverityRank(diagnostics: Diagnostic[]): number {
  let worst = 0;
  for (const diagnostic of diagnostics) {
    const rank = SEVERITY_RANK[diagnostic.severity];
    if (rank > worst) worst = rank;
  }
  return worst;
}

/** Strip a leading "./" so files display as plugin-relative paths. */
export function normalizeFilePath(
  file: string | null | undefined,
): string | null {
  if (file === undefined || file === null || file === '') return null;
  return file.replace(/^\.\//, '');
}

/** Word-wrap text to `width` columns, preserving short lines unchanged. */
export function wrapText(text: string, width = 80): string {
  if (text.length <= width) return text;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (word.length === 0) continue;
    if (line === '') {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join('\n');
}

export function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Category words that prefix rule ids and can be dropped from headings. */
const CATEGORY_PREFIXES = new Set([
  'manifest',
  'skill',
  'mcp',
  'security',
  'structure',
  'format',
  'compatibility',
]);

const ACRONYMS = new Set([
  'api',
  'cli',
  'cwd',
  'env',
  'http',
  'id',
  'json',
  'mcp',
  'sse',
  'url',
  'yaml',
]);

/**
 * Convert a kebab-case rule id into a Title Case heading, dropping the
 * leading category segment (e.g. "manifest-name-pattern" -> "Name Pattern").
 */
export function titleFromRuleId(ruleId: string): string {
  const words = ruleId.split('-');
  if (words.length > 1 && CATEGORY_PREFIXES.has(words[0])) {
    words.shift();
  }
  return words
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : capitalize(word)))
    .join(' ');
}
