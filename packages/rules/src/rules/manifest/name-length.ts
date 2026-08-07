// DOC-1003: plugin name length must be within the spec limit.

import { NAME_MAX_LENGTH } from '@agent-plugins-doctor/core';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'manifest-name-length';
const CODE = 'DOC-1003';

export const nameLengthRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Plugin name length',
  category: 'spec',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: `Plugin names must not exceed ${NAME_MAX_LENGTH} characters.`,
  enabledByDefault: true,

  check(ctx) {
    const name = ctx.plugin.manifest.name;
    if (typeof name !== 'string' || name.length <= NAME_MAX_LENGTH) return [];
    return [
      makeDiagnostic(
        CODE,
        ID,
        'spec',
        'error',
        `Plugin name is ${name.length} characters, exceeding the maximum of ${NAME_MAX_LENGTH}`,
        './plugin.json',
      ),
    ];
  },
};
