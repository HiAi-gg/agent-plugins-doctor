// DOC-3006: headers must be string values with no duplicate case-insensitive
// names.

import type { Diagnostic, Fix } from '@agent-plugins-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import {
  findDuplicateJsonMemberSpans,
  makeDiagnostic,
  memberRemovalFix,
  readTextFile,
} from '../../util.js';

const ID = 'mcp-header-validation';
const CODE = 'DOC-3006';

function duplicateHeaderMessage(server: string, key: string): string {
  return `MCP server "${server}" declares duplicate header "${key}" (case-insensitive)`;
}

export const headerValidationRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Header validation',
  category: 'mcp',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Headers must be string values with unique case-insensitive names.',
  enabledByDefault: true,

  check(ctx) {
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];
    const diagnostics = [];
    for (const [name, server] of Object.entries(servers)) {
      // A null entry is a server that failed to parse; DOC-3008 reports it.
      if (server === null) continue;
      if (server.type === 'stdio' || server.headers === undefined) continue;
      for (const [header, value] of Object.entries(server.headers)) {
        if (typeof value !== 'string') {
          diagnostics.push(
            makeDiagnostic(
              CODE,
              ID,
              'mcp',
              'error',
              `MCP server "${name}" header "${header}" must be a string value`,
              './mcp.json',
            ),
          );
        }
      }
      const lower = new Set<string>();
      for (const header of Object.keys(server.headers)) {
        const normalized = header.toLowerCase();
        if (lower.has(normalized)) {
          diagnostics.push(
            makeDiagnostic(
              CODE,
              ID,
              'mcp',
              'error',
              duplicateHeaderMessage(name, header),
              './mcp.json',
            ),
          );
        }
        lower.add(normalized);
      }
    }
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const raw = readTextFile(ctx.rootDir, './mcp.json');
    if (raw === null) return null;
    const server = extractServerName(diagnostic.message);
    const header = extractHeaderName(diagnostic.message);
    if (server === null || header === null) return null;

    const headersPath = (path: string[]): boolean =>
      path.length === 3 &&
      path[0] === 'mcpServers' &&
      path[1] === server &&
      path[2] === 'headers';

    // Remove the duplicate members whose lowercase name matches (keep first).
    const spans = findDuplicateJsonMemberSpans(raw, headersPath);
    if (spans === null || spans.length === 0) return null;
    // Match the exact key so each duplicate diagnostic targets its own span:
    // a case-insensitive lookup would make two diagnostics (e.g. for
    // "authorization" and "AUTHORIZATION") target the same span, leaving one
    // duplicate behind and breaking idempotence with 3+ case variants.
    const target = spans.find((span) => span.key === header);
    if (target === undefined) return null;
    return memberRemovalFix(
      raw,
      target,
      './mcp.json',
      `Remove duplicate header "${target.key}" from server "${server}"`,
    );
  },
};

function extractServerName(message: string): string | null {
  const match = /server "([^"]+)"/.exec(message);
  return match === null ? null : match[1];
}

function extractHeaderName(message: string): string | null {
  const match = /header "([^"]+)"/.exec(message);
  return match === null ? null : match[1];
}
