// DOC-3004: stdio cwd must be plugin-relative (./), or rooted at
// ${PLUGIN_ROOT} or ${PLUGIN_DATA}. Mirrors the vendored mcp.schema.json
// pattern. A cwd that escapes the plugin root (absolute path or `..` parent
// traversal) is a security-critical finding (severity "critical", matching
// DOC-4001); any other non-conforming cwd is a validation error.

import { isTraversalPath } from '@agent-plugins-doctor/core';
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
      // A null entry is a server that failed to parse; DOC-3008 reports it.
      if (server === null) continue;
      if (server.type !== 'stdio' || server.cwd === undefined) continue;
      if (!CWD_PATTERN.test(server.cwd)) {
        // An escaping cwd is a security-critical finding (exit 2), like
        // DOC-4001; a merely non-conforming cwd is a validation error (1).
        const severity = isTraversalPath(server.cwd) ? 'critical' : 'error';
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'mcp',
            severity,
            `MCP server "${name}" (stdio) cwd "${server.cwd}" is not plugin-relative (must start with "./", "\${PLUGIN_ROOT}", or "\${PLUGIN_DATA}")`,
            './mcp.json',
          ),
        );
      }
    }
    return diagnostics;
  },
};
