// DOC-3001: MCP server type must be stdio, streamable-http, or sse.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'mcp-server-type';
const CODE = 'DOC-3001';

const VALID_TYPES = new Set(['stdio', 'streamable-http', 'sse']);

export const serverTypeRule: Rule = {
  id: ID,
  code: CODE,
  name: 'MCP server type',
  category: 'mcp',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: 'MCP server types must be stdio, streamable-http, or sse.',
  enabledByDefault: true,

  check(ctx) {
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];
    const diagnostics = [];
    for (const [name, server] of Object.entries(servers)) {
      // A null entry is a server that failed to parse; DOC-3008 reports it.
      if (server === null) continue;
      const type = (server as { type?: unknown }).type;
      if (typeof type !== 'string' || !VALID_TYPES.has(type)) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'mcp',
            'error',
            `MCP server "${name}" has unsupported type "${String(type)}" (expected stdio, streamable-http, or sse)`,
            './mcp.json',
          ),
        );
      }
    }
    return diagnostics;
  },
};
