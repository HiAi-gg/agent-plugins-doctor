// DOC-4003: no credentials in env, headers, or manifest fields. Critical,
// no fix (values are redacted in the message).
//
// Conservative by design: values that look like placeholders, short values,
// and weak matches are ignored to avoid false positives.

import type { Rule } from '../../rule.js';
import { isPlainObject, makeDiagnostic } from '../../util.js';

const ID = 'security-secret-detection';
const CODE = 'DOC-4003';

const SECRET_PATTERNS: RegExp[] = [
  // PEM-encoded private keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // AWS access key IDs
  /\bAKIA[0-9A-Z]{16}\b/,
  // GitHub tokens (ghp_/gho_/ghu_/ghs_/ghr_)
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  // Common prefixed API keys (sk-, rk-, pk-live, etc.)
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:sk|rk|pk)-(?:live|test|proj)[_-][A-Za-z0-9_-]{16,}\b/,
  // Database URLs with embedded credentials
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp|oracle|mssql):\/\/[^/\s@]+:[^@\s/]+@/,
  // Generic assignment: suggestive key name followed by a long value
  /(?:api[_-]?key|secret|pass(?:word)?|auth(?:_token)?|access[_-]?token)\s*[=:]\s*["']?[A-Za-z0-9_\-./+=]{16,}["']?/i,
];

// Values that are clearly not secrets: placeholders, examples, docs.
function isPlaceholderValue(value: string): boolean {
  if (value.length < 16) return true;
  if (/[<>{}]/.test(value)) return true; // <your-key>, {token}
  if (value.includes('...')) return true; // "example..."
  if (/^\[.*\]$/.test(value)) return true; // [token]
  if (
    /^(your|example|sample|xxx|test|dummy|placeholder|changeme|demo|foobar|my)[-_ ]?/i.test(
      value,
    )
  ) {
    return true;
  }
  if (/^(true|false|null|undefined)$/i.test(value)) return true;
  return false;
}

interface SecretSource {
  label: string; // human-readable location, e.g. 'MCP server "local" env key "API_KEY"'
  value: string;
  file: string;
}

export const secretDetectionRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Secret detection',
  category: 'security',
  severity: 'critical',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Detect API keys, tokens, private keys, passwords, and credential-bearing database URLs in env, headers, and manifest fields.',
  enabledByDefault: true,

  check(ctx) {
    const sources: SecretSource[] = [];

    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers !== undefined) {
      for (const [name, server] of Object.entries(servers)) {
        if (server.type === 'stdio' && server.env !== undefined) {
          for (const [key, value] of Object.entries(server.env)) {
            sources.push({
              label: `MCP server "${name}" env key "${key}"`,
              value,
              file: './mcp.json',
            });
          }
        }
        if (server.type !== 'stdio' && server.headers !== undefined) {
          for (const [header, value] of Object.entries(server.headers)) {
            sources.push({
              label: `MCP server "${name}" header "${header}"`,
              value,
              file: './mcp.json',
            });
          }
        }
      }
    }

    const manifest = ctx.plugin.manifest;
    const manifestStrings: Array<[string, unknown]> = [
      ['description', manifest.description],
      ['homepage', manifest.homepage],
      ['repository', manifest.repository],
      ['license', manifest.license],
    ];
    if (isPlainObject(manifest.author)) {
      for (const [field, value] of Object.entries(manifest.author)) {
        manifestStrings.push([`author.${field}`, value]);
      }
    }
    if (Array.isArray(manifest.keywords)) {
      manifest.keywords.forEach((keyword, index) => {
        manifestStrings.push([`keywords[${index}]`, keyword]);
      });
    }
    for (const [field, value] of manifestStrings) {
      if (typeof value === 'string') {
        sources.push({
          label: `plugin.json field "${field}"`,
          value,
          file: './plugin.json',
        });
      }
    }

    const diagnostics = [];
    for (const source of sources) {
      if (isPlaceholderValue(source.value)) continue;
      if (SECRET_PATTERNS.some((pattern) => pattern.test(source.value))) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'security',
            'critical',
            `Possible secret detected in ${source.label} (value redacted)`,
            source.file,
          ),
        );
      }
    }
    return diagnostics;
  },
};
