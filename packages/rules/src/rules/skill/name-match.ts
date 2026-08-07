// DOC-2001: a skill's name must match its directory name.

import { basename } from 'node:path';
import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'skill-name-match';
const CODE = 'DOC-2001';

export const nameMatchRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill name matches directory',
  category: 'skills',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'The skill name in SKILL.md frontmatter must match its directory name.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      const dirName = basename(skill.directory);
      if (dirName !== skill.name) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'error',
            `Skill name "${skill.name}" does not match its directory name "${dirName}"`,
            `${skill.directory}/SKILL.md`,
          ),
        );
      }
    }
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const file = diagnostic.file;
    if (file === undefined) return null;
    const skill = ctx.plugin.skills.find(
      (s) => `${s.directory}/SKILL.md` === file,
    );
    if (skill === undefined) return null;
    if (basename(skill.directory) === skill.name) return null;
    return {
      kind: 'rename',
      file: skill.directory,
      description: `Rename skill directory "${skill.directory}" to "skills/${skill.name}"`,
      oldPath: skill.directory,
      newPath: `skills/${skill.name}`,
    };
  },
};
