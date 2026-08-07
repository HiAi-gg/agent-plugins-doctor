// DOC-2004: skill compatibility strings must not exceed the spec limit.

import { COMPATIBILITY_MAX_LENGTH } from '@agent-plugins-doctor/core';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'skill-compatibility-length';
const CODE = 'DOC-2004';

export const compatibilityLengthRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill compatibility length',
  category: 'skills',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: `Skill compatibility must not exceed ${COMPATIBILITY_MAX_LENGTH} characters when present.`,
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      if (
        typeof skill.compatibility === 'string' &&
        skill.compatibility.length > COMPATIBILITY_MAX_LENGTH
      ) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'error',
            `Skill "${skill.name}" compatibility is ${skill.compatibility.length} characters, exceeding the maximum of ${COMPATIBILITY_MAX_LENGTH}`,
            `${skill.directory}/SKILL.md`,
          ),
        );
      }
    }
    return diagnostics;
  },
};
