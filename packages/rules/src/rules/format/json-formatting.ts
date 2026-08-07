// DOC-7001: JSON files must be formatted with 2-space indentation and a
// trailing newline. Informational, with an automatic reformat fix.

import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import { canonicalJson, makeDiagnostic, readTextFile } from '../../util.js';

const ID = 'format-json-formatting';
const CODE = 'DOC-7001';

// Files checked by the rule. mcp.json is optional and only checked when
// present; extension.json files are not checked (they have no schema).
const JSON_FILES = ['./plugin.json', './mcp.json'];

export const jsonFormattingRule: Rule = {
  id: ID,
  code: CODE,
  name: 'JSON formatting',
  category: 'format',
  severity: 'info',
  supportedSpecVersions: ['1.0.0'],
  description:
    'JSON files should be formatted with 2-space indentation and a trailing newline.',
  enabledByDefault: true,
  files: ['./plugin.json', './mcp.json'],
  requiresPlugin: false,

  check(ctx) {
    const diagnostics = [];
    for (const file of JSON_FILES) {
      const raw = readTextFile(ctx.rootDir, file);
      if (raw === null) continue; // absent files are not a formatting issue
      const canonical = canonicalJson(raw);
      if (canonical === null) continue; // unparseable files are parser errors
      if (raw !== canonical) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'format',
            'info',
            `${file} is not formatted with 2-space indentation and a trailing newline`,
            file,
          ),
        );
      }
    }
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const file = diagnostic.file ?? './plugin.json';
    const raw = readTextFile(ctx.rootDir, file);
    if (raw === null) return null;
    const canonical = canonicalJson(raw);
    if (canonical === null || canonical === raw) return null;
    return {
      kind: 'replace',
      file,
      description: `Reformat ${file} with 2-space indentation and a trailing newline`,
      oldText: raw,
      newText: canonical,
    };
  },
};
