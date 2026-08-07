// DOC-1005: the extensions field must be an object keyed by reverse-domain
// namespaces with object values (§8.1, §8.2). Non-fatal per spec.

import type { Rule } from '../../rule.js';
import {
  isPlainObject,
  makeDiagnostic,
  REVERSE_DOMAIN_PATTERN,
} from '../../util.js';

const ID = 'manifest-extensions-format';
const CODE = 'DOC-1005';

export const extensionsFormatRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Extensions format',
  category: 'spec',
  severity: 'warning',
  supportedSpecVersions: ['1.0.0'],
  description:
    'extensions must be an object keyed by reverse-domain namespaces with object values (§8.1, §8.2).',
  enabledByDefault: true,

  check(ctx) {
    const extensions = ctx.plugin.manifest.extensions;
    if (extensions === undefined) return [];

    if (!isPlainObject(extensions)) {
      return [
        makeDiagnostic(
          CODE,
          ID,
          'spec',
          'warning',
          'extensions must be an object keyed by reverse-domain namespaces',
          './plugin.json',
        ),
      ];
    }

    const diagnostics = [];
    for (const [key, value] of Object.entries(extensions)) {
      if (!REVERSE_DOMAIN_PATTERN.test(key)) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'spec',
            'warning',
            `Extension namespace "${key}" is not a valid reverse-domain name (e.g. "com.example.client")`,
            './plugin.json',
          ),
        );
      } else if (!isPlainObject(value)) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'spec',
            'warning',
            `Extension "${key}" must map to an object value`,
            './plugin.json',
          ),
        );
      }
    }
    return diagnostics;
  },
};
