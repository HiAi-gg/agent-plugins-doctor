// DOC-2002: every skill must declare name and description.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'skill-required-fields';
const CODE = 'DOC-2002';

export const requiredFieldsRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill required fields',
  category: 'skills',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: 'SKILL.md frontmatter must contain name and description.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      const missing: string[] = [];
      if (typeof skill.name !== 'string' || skill.name.trim().length === 0) {
        missing.push('name');
      }
      if (
        typeof skill.description !== 'string' ||
        skill.description.trim().length === 0
      ) {
        missing.push('description');
      }
      for (const field of missing) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'error',
            `Skill "${skill.name}" is missing required field "${field}"`,
            `${skill.directory}/SKILL.md`,
          ),
        );
      }
    }
    return diagnostics;
  },
};
