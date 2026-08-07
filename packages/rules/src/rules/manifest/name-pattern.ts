// DOC-1002: plugin name must match the spec's NAME_PATTERN and be ≤ 64 chars.

import { NAME_MAX_LENGTH, NAME_PATTERN } from '@agent-plugin-doctor/core';
import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'manifest-name-pattern';
const CODE = 'DOC-1002';

/**
 * Best-effort normalization: lowercase, replace disallowed characters with
 * hyphens, collapse separators, and strip edge hyphens/periods.
 * Returns null when the name cannot be normalized into a valid form.
 */
export function normalizePluginName(name: string): string | null {
  let normalized = name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  normalized = normalized.replace(/--+/g, '-').replace(/\.\.+/g, '.');
  normalized = normalized.replace(/^[.-]+/, '').replace(/[.-]+$/, '');
  if (normalized.length === 0 || normalized.length > NAME_MAX_LENGTH)
    return null;
  if (!NAME_PATTERN.test(normalized)) return null;
  return normalized;
}

export const namePatternRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Plugin name pattern',
  category: 'spec',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Plugin names are 1-64 chars of lowercase alphanumerics, hyphens and periods; no consecutive separators, no leading/trailing separator.',
  enabledByDefault: true,

  check(ctx) {
    const name = ctx.plugin.manifest.name;
    if (typeof name !== 'string' || name.length === 0) {
      // Missing names are reported by manifest-required-fields.
      return [];
    }
    const valid = NAME_PATTERN.test(name) && name.length <= NAME_MAX_LENGTH;
    if (valid) return [];
    return [
      makeDiagnostic(
        CODE,
        ID,
        'spec',
        'error',
        `Plugin name "${name}" does not match the required pattern (lowercase alphanumerics, hyphens and periods; no consecutive or leading/trailing separators, max ${NAME_MAX_LENGTH} chars)`,
        './plugin.json',
      ),
    ];
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const name = ctx.plugin.manifest.name;
    if (typeof name !== 'string') return null;
    const normalized = normalizePluginName(name);
    if (normalized === null || normalized === name) return null;
    return {
      kind: 'replace',
      file: diagnostic.file ?? './plugin.json',
      description: `Rename plugin to "${normalized}"`,
      oldText: `"name": ${JSON.stringify(name)}`,
      newText: `"name": ${JSON.stringify(normalized)}`,
    };
  },
};
