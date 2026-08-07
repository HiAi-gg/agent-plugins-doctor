// DOC-5001: plugin.json must exist at the plugin root.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'structure-directory-layout';
const CODE = 'DOC-5001';

export const directoryLayoutRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Directory layout',
  category: 'structure',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: 'plugin.json must exist at the plugin root.',
  enabledByDefault: true,

  check(ctx) {
    const manifestPath = join(ctx.rootDir, 'plugin.json');
    if (existsSync(manifestPath) && statSync(manifestPath).isFile()) return [];
    return [
      makeDiagnostic(
        CODE,
        ID,
        'structure',
        'error',
        'plugin.json is missing from the plugin root',
        './plugin.json',
      ),
    ];
  },
};
