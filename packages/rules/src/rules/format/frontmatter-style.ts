// DOC-7002: SKILL.md frontmatter must be properly formatted (no BOM, LF line
// endings, no trailing whitespace on frontmatter lines, closing delimiter).
// Informational, with an automatic normalize fix.

import type { Diagnostic, Fix } from '@agent-plugins-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import {
  makeDiagnostic,
  normalizeSkillFrontmatter,
  readTextFile,
} from '../../util.js';

const ID = 'format-frontmatter-style';
const CODE = 'DOC-7002';

/** Reports why the frontmatter style is off, or null when it is canonical. */
export function frontmatterStyleIssue(text: string): string | null {
  // CRLF is checked first: it also breaks exact delimiter matching below.
  if (text.includes('\r')) {
    return 'file uses CRLF line endings; use LF';
  }
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = cleaned.split('\n');
  if (!/^---/.test(lines[0] ?? '')) {
    return 'SKILL.md must start with a "---" frontmatter delimiter';
  }
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---' || line === '...') {
      closed = true;
      break;
    }
  }
  if (!closed) {
    return 'frontmatter is missing its closing "---" delimiter';
  }
  if (/[ \t]+$/m.test(frontmatterRegion(cleaned))) {
    return 'frontmatter lines contain trailing whitespace';
  }
  return null;
}

function frontmatterRegion(text: string): string {
  const lines = text.split('\n');
  const region: string[] = [];
  const inFrontmatter = /^---/.test(lines[0] ?? '');
  for (let i = 0; i < lines.length && inFrontmatter; i++) {
    region.push(lines[i]);
    if (i > 0 && (lines[i] === '---' || lines[i] === '...')) break;
  }
  return region.join('\n');
}

export const frontmatterStyleRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Frontmatter style',
  category: 'format',
  severity: 'info',
  supportedSpecVersions: ['1.0.0'],
  description:
    'SKILL.md frontmatter should use LF line endings, no trailing whitespace, and proper delimiters.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      const file = `${skill.directory}/SKILL.md`;
      const raw = readTextFile(ctx.rootDir, file);
      if (raw === null) continue;
      const issue = frontmatterStyleIssue(raw);
      if (issue !== null) {
        diagnostics.push(
          makeDiagnostic(CODE, ID, 'format', 'info', `${file}: ${issue}`, file),
        );
      }
    }
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const file = diagnostic.file;
    if (file === undefined) return null;
    const raw = readTextFile(ctx.rootDir, file);
    if (raw === null) return null;
    const normalized = normalizeSkillFrontmatter(raw);
    if (normalized === raw) return null;
    return {
      kind: 'replace',
      file,
      description: `Normalize frontmatter style in ${file}`,
      oldText: raw,
      newText: normalized,
    };
  },
};
