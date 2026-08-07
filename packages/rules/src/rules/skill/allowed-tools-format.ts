// DOC-2005: allowed-tools is a space-separated string of tool names per the
// Agent Skills specification (e.g. "Bash(git:*) Bash(jq:*) Read"). YAML lists
// are a Doctor-specific extension and only warrant a warning; any other type
// is an error. The autofix only normalizes whitespace — it never converts a
// string into a list.

import type { Diagnostic, Fix } from '@agent-plugins-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import { makeDiagnostic, readTextFile } from '../../util.js';

const ID = 'skill-allowed-tools-format';
const CODE = 'DOC-2005';

// A tool name is alphanumeric with optional hyphens and an optional
// parenthesized scope (e.g. `Bash(git:*)`). Multiple names may be joined by
// commas inside a single whitespace-free token (`bash,read`) — comma-separated
// tool lists without spaces are tolerated as one token.
const TOOL_NAME_PATTERN =
  /^(?:[A-Za-z0-9-]+(?:\([^()\s]+\))?)(?:,(?:[A-Za-z0-9-]+(?:\([^()\s]+\))?))*$/;

// A token containing a comma but failing the pattern is a comma+space list
// artifact (e.g. `bash,` from `bash, read`) — likely a user error.
function isCommaListArtifact(token: string): boolean {
  return token.includes(',');
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export const allowedToolsFormatRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill allowed-tools format',
  category: 'skills',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'allowed-tools must be a space-separated string of tool names (Agent Skills spec); YAML lists are a Doctor extension and any other type is an error.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics: Diagnostic[] = [];
    for (const skill of ctx.plugin.skills) {
      const value = skill.frontmatter['allowed-tools'];
      if (value === undefined) continue;
      const file = `${skill.directory}/SKILL.md`;

      if (typeof value === 'string') {
        if (value.trim().length === 0) {
          // An empty (or whitespace-only) string means no tools at all.
          diagnostics.push(
            makeDiagnostic(
              CODE,
              ID,
              'skills',
              'warning',
              `Skill "${skill.name}" allowed-tools is empty; expected space-separated tool names`,
              file,
            ),
          );
          continue;
        }
        for (const token of value.split(/\s+/).filter((t) => t.length > 0)) {
          if (TOOL_NAME_PATTERN.test(token)) continue;
          if (isCommaListArtifact(token)) {
            diagnostics.push(
              makeDiagnostic(
                CODE,
                ID,
                'skills',
                'warning',
                `Skill "${skill.name}" allowed-tools appears to be comma-separated with spaces; expected a space-separated string (e.g. "Bash(git:*) Read")`,
                file,
              ),
            );
          } else {
            diagnostics.push(
              makeDiagnostic(
                CODE,
                ID,
                'skills',
                'error',
                `Skill "${skill.name}" allowed-tools contains invalid tool name "${token}"`,
                file,
              ),
            );
          }
        }
        continue;
      }

      if (isStringList(value)) {
        // YAML list: a Doctor-specific extension, not part of the spec.
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'warning',
            `Skill "${skill.name}" allowed-tools: YAML list form is not in the Agent Skills spec; consider using space-separated string`,
            file,
          ),
        );
        continue;
      }

      // Numbers, booleans, objects, and lists with non-string members.
      diagnostics.push(
        makeDiagnostic(
          CODE,
          ID,
          'skills',
          'error',
          `Skill "${skill.name}" allowed-tools must be a string or YAML list`,
          file,
        ),
      );
    }
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const file = diagnostic.file;
    if (file === undefined) return null;
    const skill = ctx.plugin.skills.find(
      (s) => `${s.directory}/SKILL.md` === file,
    );
    if (
      skill === undefined ||
      typeof skill.frontmatter['allowed-tools'] !== 'string'
    ) {
      // Lists and invalid types have no autofix; the string form is only
      // ever whitespace-normalized, never converted to a list.
      return null;
    }
    const raw = readTextFile(ctx.rootDir, file);
    if (raw === null) return null;
    const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(
      raw,
    );
    if (frontmatter === null) return null;
    // Search only inside the frontmatter block so body text that mentions
    // `allowed-tools` is never rewritten.
    const line = /^([ \t]*)allowed-tools:[ \t]*(.*?)[ \t]*$/m.exec(
      frontmatter[1],
    );
    if (line === null || line[2].length === 0) return null;
    const current = line[2];
    // Quoted values are left untouched.
    if (current[0] === '"' || current[0] === "'") return null;
    const normalized = current.trim().replace(/[ \t]+/g, ' ');
    if (normalized === current) return null;
    return {
      kind: 'replace',
      file,
      description: 'Normalize allowed-tools whitespace',
      oldText: line[0],
      newText: `${line[1]}allowed-tools: ${normalized}`,
    };
  },
};
