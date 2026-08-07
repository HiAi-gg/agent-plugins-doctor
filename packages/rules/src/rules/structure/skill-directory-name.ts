// DOC-5002: skill directory names must be valid skill names and match the
// skill's declared name.

import { basename } from 'node:path';
import {
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_PATTERN,
} from '@agent-plugins-doctor/core';
import type { Diagnostic, Fix } from '@agent-plugins-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'structure-skill-directory-name';
const CODE = 'DOC-5002';

export const skillDirectoryNameRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill directory name',
  category: 'structure',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Skill directories under skills/ must be named after the skill, using the skill-name pattern.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      const dirName = basename(skill.directory);
      if (
        !SKILL_NAME_PATTERN.test(dirName) ||
        dirName.length > SKILL_NAME_MAX_LENGTH
      ) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'structure',
            'error',
            `Skill directory name "${dirName}" is not a valid skill name (lowercase alphanumerics and hyphens, max ${SKILL_NAME_MAX_LENGTH} chars)`,
            `${skill.directory}/SKILL.md`,
          ),
        );
      } else if (dirName !== skill.name) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'structure',
            'error',
            `Skill directory name "${dirName}" does not match skill name "${skill.name}"`,
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
    // Conditional: only rename when the target name is itself valid.
    if (
      !SKILL_NAME_PATTERN.test(skill.name) ||
      skill.name.length > SKILL_NAME_MAX_LENGTH
    ) {
      return null;
    }
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
