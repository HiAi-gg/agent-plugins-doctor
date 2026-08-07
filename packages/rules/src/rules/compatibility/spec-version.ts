// DOC-6001: the plugin's spec version must be supported.

import { getSpecVersion } from '@agent-plugin-doctor/core';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'compatibility-spec-version';
const CODE = 'DOC-6001';

export const specVersionRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Spec version support',
  category: 'compatibility',
  severity: 'error',
  supportedSpecVersions: ['*'], // applies to every version under validation
  description:
    'The plugin must declare a spec version this validator supports.',
  enabledByDefault: true,

  check(ctx) {
    const version = ctx.plugin.specVersion;
    if (getSpecVersion(version) !== null) return [];
    return [
      makeDiagnostic(
        CODE,
        ID,
        'compatibility',
        'error',
        `Unsupported plugin spec version "${version}"`,
      ),
    ];
  },
};
