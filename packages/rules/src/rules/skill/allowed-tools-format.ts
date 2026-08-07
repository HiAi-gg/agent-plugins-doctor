// DOC-2005: allowed-tools must be a list of non-empty strings. The spec also
// accepts a space-separated string, which Doctor normalizes to a list.

import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import { makeDiagnostic, readTextFile } from '../../util.js';

const ID = 'skill-allowed-tools-format';
const CODE = 'DOC-2005';

function isValidList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((tool) => typeof tool === 'string' && tool.trim().length > 0)
  );
}

export const allowedToolsFormatRule: Rule = {
  id: ID,
  code: CODE,
  name: 'allowed-tools format',
  category: 'skills',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'allowed-tools must be a list of non-empty strings; a space-separated string is normalized to a list.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      const value = skill.frontmatter['allowed-tools'];
      if (value === undefined) continue;
      if (isValidList(value)) continue;
      const file = `${skill.directory}/SKILL.md`;
      if (typeof value === 'string') {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'error',
            `Skill "${skill.name}" declares allowed-tools as a space-separated string; normalize it to a list`,
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
            `Skill "${skill.name}" allowed-tools must be a string or a list of non-empty strings`,
            file,
          ),
        );
      }
    }
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const file = diagnostic.file;
    if (file === undefined) return null;
    // Only the string form is fixable; invalid types cannot be normalized.
    const skill = ctx.plugin.skills.find(
      (s) => `${s.directory}/SKILL.md` === file,
    );
    if (
      skill === undefined ||
      typeof skill.frontmatter['allowed-tools'] !== 'string'
    ) {
      return null;
    }
    const raw = readTextFile(ctx.rootDir, file);
    if (raw === null) return null;
    const line = /^([ \t]*)allowed-tools:[ \t]*(.+?)[ \t]*$/m.exec(raw);
    if (line === null) return null;
    const tools = line[2]
      .split(/\s+/)
      .filter((tool) => tool.length > 0)
      .map((tool) => `${line[1]}  - ${tool}`);
    if (tools.length === 0) return null;
    return {
      kind: 'replace',
      file,
      description: `Normalize allowed-tools to a YAML list of ${tools.length} tool${tools.length === 1 ? '' : 's'}`,
      oldText: line[0],
      newText: `${line[1]}allowed-tools:\n${tools.join('\n')}`,
    };
  },
};
