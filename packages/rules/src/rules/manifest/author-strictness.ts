// DOC-1006: the author object may only contain name, email and url.
//
// Unknown author fields violate the schema's additionalProperties:false, so
// they are caught against the raw file (the parser would otherwise reject the
// manifest or the fields are lost at load time).

import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import {
  findJsonMemberSpans,
  isPlainObject,
  makeDiagnostic,
  memberRemovalFix,
  readJsonFile,
  readTextFile,
} from '../../util.js';

const ID = 'manifest-author-strictness';
const CODE = 'DOC-1006';

const ALLOWED_AUTHOR_FIELDS = new Set(['name', 'email', 'url']);

function authorFieldMessage(field: string): string {
  return `plugin.json author object contains field "${field}" which is not allowed (only name, email, url)`;
}

export const authorStrictnessRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Author field strictness',
  category: 'spec',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: 'The author object may only contain name, email and url.',
  enabledByDefault: true,
  files: ['./plugin.json'],

  check(ctx) {
    const raw = readJsonFile(ctx.rootDir, './plugin.json');
    const author = isRecord(raw) ? raw.author : ctx.plugin.manifest.author;
    if (!isPlainObject(author)) return [];
    const unknown = Object.keys(author).filter(
      (key) => !ALLOWED_AUTHOR_FIELDS.has(key),
    );
    return unknown.map((field) =>
      makeDiagnostic(
        CODE,
        ID,
        'spec',
        'error',
        authorFieldMessage(field),
        './plugin.json',
      ),
    );
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const file = diagnostic.file ?? './plugin.json';
    const raw = readTextFile(ctx.rootDir, file);
    if (raw === null) return null;
    const field = extractAuthorField(diagnostic.message);
    if (field === null) return null;
    const spans = findJsonMemberSpans(
      raw,
      (path, key) => path.length === 1 && path[0] === 'author' && key === field,
    );
    if (spans === null || spans.length === 0) return null;
    return memberRemovalFix(
      raw,
      spans[0],
      file,
      `Remove author field "${field}"`,
    );
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractAuthorField(message: string): string | null {
  const match = /field "([^"]+)"/.exec(message);
  return match === null ? null : match[1];
}
