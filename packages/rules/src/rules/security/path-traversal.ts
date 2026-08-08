// DOC-4001: no path traversal in any file references (skill directories,
// extension paths, stdio cwd/command). Critical, no fix.

import { isTraversalPath } from '@agent-plugins-doctor/core';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'security-path-traversal';
const CODE = 'DOC-4001';

interface PathReference {
  value: string;
  file: string;
}

// Re-export for callers that relied on the rule module's helper; the shared
// definition now lives in @agent-plugins-doctor/core so the parser (mcp.json
// stdio command validation, DOC-3008) and the security rules agree.
export { isTraversalPath };

export const pathTraversalRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Path traversal',
  category: 'security',
  severity: 'critical',
  supportedSpecVersions: ['1.0.0'],
  description:
    'File references must stay inside the plugin root; parent traversal and absolute paths are denied.',
  enabledByDefault: true,

  check(ctx) {
    const references: PathReference[] = [];
    for (const skill of ctx.plugin.skills) {
      references.push({
        value: skill.directory,
        file: `${skill.directory}/SKILL.md`,
      });
    }
    for (const extension of ctx.plugin.extensions) {
      references.push({ value: extension.path, file: extension.path });
    }
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers !== undefined) {
      for (const [name, server] of Object.entries(servers)) {
        // A null entry is a server that failed to parse; DOC-3008 reports it.
        if (server === null) continue;
        if (server.type !== 'stdio') continue;
        if (typeof server.command === 'string') {
          references.push({
            value: server.command,
            file: `./mcp.json (server "${name}" command)`,
          });
        }
        if (typeof server.cwd === 'string') {
          references.push({
            value: server.cwd,
            file: `./mcp.json (server "${name}")`,
          });
        }
      }
    }

    const diagnostics = [];
    for (const reference of references) {
      if (isTraversalPath(reference.value)) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'security',
            'critical',
            `Path "${reference.value}" escapes the plugin root (path traversal)`,
            reference.file,
          ),
        );
      }
    }
    return diagnostics;
  },
};
