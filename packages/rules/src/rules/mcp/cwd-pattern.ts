// DOC-3004: stdio cwd must be plugin-relative (./), or rooted at
// ${PLUGIN_ROOT} or ${PLUGIN_DATA}. Mirrors the vendored mcp.schema.json
// pattern.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'mcp-cwd-pattern';
const CODE = 'DOC-3004';

const CWD_PATTERN =
  /^(?:\.\/|\$\{PLUGIN_ROOT\}(?:\/|$)|\$\{PLUGIN_DATA\}(?:\/|$))/;

export const cwdPatternRule: Rule = {
  id: ID,
  code: CODE,
  name: 'stdio cwd pattern',
  category: 'mcp',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'stdio cwd must start with "./", "${PLUGIN_ROOT}", or "${PLUGIN_DATA}".',
  enabledByDefault: true,

  check(ctx) {
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];
    const diagnostics = [];
    for (const [name, server] of Object.entries(servers)) {
      if (server.type !== 'stdio' || server.cwd === undefined) continue;
      if (!CWD_PATTERN.test(server.cwd)) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'mcp',
            'error',
            `MCP server "${name}" (stdio) cwd "${server.cwd}" is not plugin-relative (must start with "./", "\${PLUGIN_ROOT}", or "\${PLUGIN_DATA}")`,
            './mcp.json',
          ),
        );
      }
    }
    return diagnostics;
  },
};
