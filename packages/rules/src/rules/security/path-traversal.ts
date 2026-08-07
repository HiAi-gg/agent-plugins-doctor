// DOC-4001: no path traversal in any file references (skill directories,
// extension paths, stdio cwd). Critical, no fix.

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'security-path-traversal';
const CODE = 'DOC-4001';

interface PathReference {
  value: string;
  file: string;
}

export function isTraversalPath(value: string): boolean {
  if (value.startsWith('/')) return true; // absolute POSIX path
  if (/^[A-Za-z]:[\\/]/.test(value)) return true; // absolute Windows path
  if (value.split(/[\\/]+/).includes('..')) return true; // parent traversal
  return false;
}

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
        if (server.type === 'stdio' && typeof server.cwd === 'string') {
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
