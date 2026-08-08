// DOC-3005: remote server URLs must be absolute http/https URLs without
// userinfo or fragments.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'mcp-url-format';
const CODE = 'DOC-3005';

export const urlFormatRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Remote server URL format',
  category: 'mcp',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Remote MCP server URLs must be absolute http/https URLs without userinfo or fragments.',
  enabledByDefault: true,

  check(ctx) {
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];
    const diagnostics = [];
    for (const [name, server] of Object.entries(servers)) {
      // A null entry is a server that failed to parse; DOC-3008 reports it.
      if (server === null) continue;
      if (server.type !== 'streamable-http' && server.type !== 'sse') continue;
      const url = server.url;
      const problem = validateUrl(url);
      if (problem !== null) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'mcp',
            'error',
            `MCP server "${name}" has an invalid URL: ${problem}`,
            './mcp.json',
          ),
        );
      }
    }
    return diagnostics;
  },
};

function validateUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `"${url}" is not a valid absolute URL`;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `protocol must be http or https, got "${parsed.protocol}"`;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return 'URL must not contain userinfo (user:password@)';
  }
  if (parsed.hash !== '') {
    return 'URL must not contain a fragment';
  }
  return null;
}
