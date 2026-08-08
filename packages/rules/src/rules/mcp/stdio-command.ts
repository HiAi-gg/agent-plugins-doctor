// DOC-3002: stdio servers must declare a single-token command.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'mcp-stdio-command';
const CODE = 'DOC-3002';

export const stdioCommandRule: Rule = {
  id: ID,
  code: CODE,
  name: 'stdio command',
  category: 'mcp',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'stdio servers must declare a single executable token as their command.',
  enabledByDefault: true,

  check(ctx) {
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];
    const diagnostics = [];
    for (const [name, server] of Object.entries(servers)) {
      // A null entry is a server that failed to parse; DOC-3008 reports it.
      if (server === null) continue;
      if (server.type !== 'stdio') continue;
      const command = server.command;
      if (typeof command !== 'string' || command.trim().length === 0) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'mcp',
            'error',
            `MCP server "${name}" (stdio) must declare a command`,
            './mcp.json',
          ),
        );
      } else if (/\s/.test(command)) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'mcp',
            'error',
            `MCP server "${name}" (stdio) command must be a single executable token, got "${command}"`,
            './mcp.json',
          ),
        );
      }
    }
    return diagnostics;
  },
};
