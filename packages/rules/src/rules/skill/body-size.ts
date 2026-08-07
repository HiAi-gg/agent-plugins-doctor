// DOC-2006: SKILL.md bodies should stay under the recommended size. This is a
// recommendation (warning), not a hard limit.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'skill-body-size';
const CODE = 'DOC-2006';

// Recommended upper bound in tokens (whitespace-delimited words).
const BODY_TOKEN_LIMIT = 5000;

export function countTokens(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
}

export const bodySizeRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill body size',
  category: 'skills',
  severity: 'warning',
  supportedSpecVersions: ['1.0.0'],
  description: `SKILL.md bodies should stay under ${BODY_TOKEN_LIMIT} tokens (recommendation).`,
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      const tokens = countTokens(skill.body);
      if (tokens >= BODY_TOKEN_LIMIT) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'warning',
            `Skill "${skill.name}" body is ${tokens} tokens, exceeding the recommended limit of ${BODY_TOKEN_LIMIT}`,
            `${skill.directory}/SKILL.md`,
          ),
        );
      }
    }
    return diagnostics;
  },
};
