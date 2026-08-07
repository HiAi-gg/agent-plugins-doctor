// DOC-1004: plugin.json must not contain unknown top-level fields (§5.2).
//
// The parser strips unknown fields at load time, so the rule reads the raw
// file to catch them; the in-memory manifest is used as a fallback when the
// file is unavailable (e.g. programmatically built plugins).

import type { Diagnostic, Fix } from '@agent-plugins-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import {
  findJsonMemberSpans,
  makeDiagnostic,
  memberRemovalFix,
  PERMITTED_MANIFEST_FIELDS,
  readJsonFile,
  readTextFile,
} from '../../util.js';

const ID = 'manifest-unknown-fields';
const CODE = 'DOC-1004';

const PERMITTED = new Set<string>(PERMITTED_MANIFEST_FIELDS);

function unknownFieldMessage(field: string): string {
  return `plugin.json contains unknown top-level field "${field}"`;
}

export const unknownFieldsRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Unknown manifest fields',
  category: 'spec',
  severity: 'warning',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Unknown top-level fields in plugin.json are reported and ignored (§5.2).',
  enabledByDefault: true,
  files: ['./plugin.json'],

  check(ctx) {
    const raw = readJsonFile(ctx.rootDir, './plugin.json');
    const source = isRecord(raw)
      ? raw
      : (ctx.plugin.manifest as unknown as Record<string, unknown>);
    const unknown = Object.keys(source).filter((key) => !PERMITTED.has(key));
    return unknown.map((field) =>
      makeDiagnostic(
        CODE,
        ID,
        'spec',
        'warning',
        unknownFieldMessage(field),
        './plugin.json',
      ),
    );
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const file = diagnostic.file ?? './plugin.json';
    const raw = readTextFile(ctx.rootDir, file);
    if (raw === null) return null;
    const field = extractQuotedField(diagnostic.message);
    if (field === null) return null;
    const spans = findJsonMemberSpans(
      raw,
      (path, key) => path.length === 0 && key === field,
    );
    if (spans === null || spans.length === 0) return null;
    return memberRemovalFix(
      raw,
      spans[0],
      file,
      `Remove unknown top-level field "${field}"`,
    );
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractQuotedField(message: string): string | null {
  const match = /field "([^"]+)"/.exec(message);
  return match === null ? null : match[1];
}
