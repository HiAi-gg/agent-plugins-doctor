// DOC-6002: deprecated fields must not be used.
//
// The Agent Plugins v1.0.0 spec deprecates no fields, so the default map is
// empty and the rule is silent. The factory keeps the mechanism testable and
// ready for future spec versions: register deprecatedFieldsRule() with a map
// once the spec deprecates fields.

import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import {
  findJsonMemberSpans,
  makeDiagnostic,
  memberRemovalFix,
  readJsonFile,
  readTextFile,
  rewriteJsonMembers,
} from '../../util.js';

const ID = 'compatibility-deprecated-fields';
const CODE = 'DOC-6002';

export interface DeprecatedField {
  since: string; // spec version that deprecated the field
  replacement?: string; // field to use instead
}

export type DeprecatedFieldsMap = Record<string, DeprecatedField>;

// v1.0.0 deprecates nothing; kept empty and ready for future versions.
export const DEFAULT_DEPRECATED_FIELDS: DeprecatedFieldsMap = {};

export function deprecatedFieldsRule(
  deprecatedFields: DeprecatedFieldsMap = DEFAULT_DEPRECATED_FIELDS,
): Rule {
  return {
    id: ID,
    code: CODE,
    name: 'Deprecated fields',
    category: 'compatibility',
    severity: 'warning',
    supportedSpecVersions: ['*'],
    description:
      'Deprecated manifest fields must be migrated to their replacements.',
    enabledByDefault: true,
    files: ['./plugin.json'],

    check(ctx) {
      if (Object.keys(deprecatedFields).length === 0) return [];
      const raw = readJsonFile(ctx.rootDir, './plugin.json');
      const source = isRecord(raw)
        ? raw
        : (ctx.plugin.manifest as unknown as Record<string, unknown>);
      const diagnostics: Diagnostic[] = [];
      for (const [field, info] of Object.entries(deprecatedFields)) {
        if (!(field in source)) continue;
        const message =
          info.replacement === undefined
            ? `Field "${field}" is deprecated (since spec ${info.since})`
            : `Field "${field}" is deprecated (since spec ${info.since}); use "${info.replacement}" instead`;
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'compatibility',
            'warning',
            message,
            './plugin.json',
          ),
        );
      }
      return diagnostics;
    },

    fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
      const raw = readTextFile(ctx.rootDir, diagnostic.file ?? './plugin.json');
      if (raw === null) return null;
      const field = extractFieldName(diagnostic.message);
      if (field === null) return null;
      const info = deprecatedFields[field];
      if (info === undefined) return null;

      if (info.replacement !== undefined) {
        // Rename the field key in place; value is preserved byte-for-byte.
        const edited = rewriteJsonMembers(
          raw,
          (path, key) => path.length === 0 && key === field,
          () => info.replacement as string,
        );
        if (edited === null) return null;
        return {
          kind: 'replace',
          file: diagnostic.file ?? './plugin.json',
          description: `Rename deprecated field "${field}" to "${info.replacement}"`,
          oldText: raw,
          newText: edited,
        };
      }

      const spans = findJsonMemberSpans(
        raw,
        (path, key) => path.length === 0 && key === field,
      );
      if (spans === null || spans.length === 0) return null;
      return memberRemovalFix(
        raw,
        spans[0],
        diagnostic.file ?? './plugin.json',
        `Remove deprecated field "${field}"`,
      );
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractFieldName(message: string): string | null {
  const match = /field "([^"]+)"/i.exec(message);
  return match === null ? null : match[1];
}
