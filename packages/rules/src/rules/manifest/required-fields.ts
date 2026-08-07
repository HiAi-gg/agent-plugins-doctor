// DOC-1001: plugin.json must contain the required fields $schema and name.

import type { PluginManifest } from '@agent-plugins-doctor/core';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'manifest-required-fields';
const CODE = 'DOC-1001';

const REQUIRED_FIELDS = ['$schema', 'name'] as const;

function isPresent(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export const requiredFieldsRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Manifest required fields',
  category: 'spec',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'plugin.json must contain the required fields $schema and name (§5.2).',
  enabledByDefault: true,

  check(ctx) {
    const manifest = ctx.plugin.manifest;
    const missing = REQUIRED_FIELDS.filter(
      (field) => !isPresent(manifest[field as keyof PluginManifest]),
    );
    return missing.map((field) =>
      makeDiagnostic(
        CODE,
        ID,
        'spec',
        'error',
        `plugin.json is missing required field "${field}"`,
        './plugin.json',
      ),
    );
  },
};
