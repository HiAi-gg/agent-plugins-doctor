// DOC-2003: skill descriptions must not exceed the spec limit.

import { DESCRIPTION_MAX_LENGTH } from '@agent-plugins-doctor/core';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'skill-description-length';
const CODE = 'DOC-2003';

export const descriptionLengthRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill description length',
  category: 'skills',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: `Skill descriptions must not exceed ${DESCRIPTION_MAX_LENGTH} characters.`,
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      if (
        typeof skill.description === 'string' &&
        skill.description.length > DESCRIPTION_MAX_LENGTH
      ) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'error',
            `Skill "${skill.name}" description is ${skill.description.length} characters, exceeding the maximum of ${DESCRIPTION_MAX_LENGTH}`,
            `${skill.directory}/SKILL.md`,
          ),
        );
      }
    }
    return diagnostics;
  },
};
