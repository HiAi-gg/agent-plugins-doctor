// DOC-3008: an mcp.json server entry could not be parsed and was not loaded.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'mcp-invalid-server-entry';
const CODE = 'DOC-3008';

export const invalidServerEntryRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Invalid MCP server entry',
  category: 'mcp',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Every mcp.json server entry must conform to mcp.schema.json; an invalid entry is preserved as null and reported, never silently dropped.',
  enabledByDefault: true,

  check(ctx) {
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];
    const diagnostics = [];
    for (const [name, server] of Object.entries(servers)) {
      if (server !== null) continue;
      diagnostics.push(
        makeDiagnostic(
          CODE,
          ID,
          'mcp',
          'error',
          `MCP server "${name}" is invalid and was not loaded`,
          './mcp.json',
        ),
      );
    }
    return diagnostics;
  },
};
