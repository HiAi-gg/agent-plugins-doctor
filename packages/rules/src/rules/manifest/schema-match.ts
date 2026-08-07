// DOC-1007: $schema must match the expected schema URL for the plugin's spec
// version.

import { getSpecVersion } from '@agent-plugin-doctor/core';
import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import {
  findJsonMemberSpans,
  jsonMemberValueSpan,
  makeDiagnostic,
  readTextFile,
} from '../../util.js';

const ID = 'manifest-schema-match';
const CODE = 'DOC-1007';

export const schemaMatchRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Manifest schema match',
  category: 'spec',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'plugin.json $schema must be the expected schema URL for the spec version.',
  enabledByDefault: true,

  check(ctx) {
    const spec = getSpecVersion(ctx.plugin.specVersion);
    if (spec === null) return []; // unknown versions are handled by spec-version
    const schema = ctx.plugin.manifest.$schema;
    if (schema === spec.pluginSchemaUrl) return [];
    return [
      makeDiagnostic(
        CODE,
        ID,
        'spec',
        'error',
        `plugin.json $schema does not match the expected URL for spec ${spec.version}: expected ${spec.pluginSchemaUrl}, found "${schema}"`,
        './plugin.json',
      ),
    ];
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const spec = getSpecVersion(ctx.plugin.specVersion);
    if (spec === null) return null;
    const file = diagnostic.file ?? './plugin.json';
    const raw = readTextFile(ctx.rootDir, file);
    if (raw === null) return null;
    const schema = ctx.plugin.manifest.$schema;
    if (typeof schema !== 'string') return null;
    // Rewrite only the value token of the top-level "$schema" member, so the
    // fix is whitespace-tolerant and never touches a nested "$schema" member.
    const spans = findJsonMemberSpans(
      raw,
      (path, key) => path.length === 0 && key === '$schema',
    );
    if (spans === null || spans.length === 0) return null;
    const valueSpan = jsonMemberValueSpan(raw, spans[0]);
    if (valueSpan === null) return null;
    const current = raw.slice(valueSpan.start, valueSpan.end);
    if (current !== JSON.stringify(schema)) return null;
    return {
      kind: 'replace',
      file,
      description: `Update $schema to ${spec.pluginSchemaUrl}`,
      oldText: current,
      newText: JSON.stringify(spec.pluginSchemaUrl),
    };
  },
};
