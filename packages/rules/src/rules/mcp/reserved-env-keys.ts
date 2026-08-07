// DOC-3003: env must not declare the reserved keys PLUGIN_ROOT / PLUGIN_DATA.

import type { Diagnostic, Fix } from '@agent-plugin-doctor/core';
import type { Rule, RuleContext } from '../../rule.js';
import {
  findJsonMemberSpans,
  makeDiagnostic,
  memberRemovalFix,
  readTextFile,
} from '../../util.js';

const ID = 'mcp-reserved-env-keys';
const CODE = 'DOC-3003';

const RESERVED_KEYS = new Set(['PLUGIN_ROOT', 'PLUGIN_DATA']);

export const reservedEnvKeysRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Reserved env keys',
  category: 'mcp',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'The plugin runtime reserves PLUGIN_ROOT and PLUGIN_DATA; env must not override them.',
  enabledByDefault: true,

  check(ctx) {
    const servers = ctx.plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];
    const diagnostics = [];
    for (const [name, server] of Object.entries(servers)) {
      if (server.type !== 'stdio' || server.env === undefined) continue;
      const reserved = Object.keys(server.env).filter((key) =>
        RESERVED_KEYS.has(key),
      );
      for (const key of reserved) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'mcp',
            'error',
            `MCP server "${name}" env declares reserved key "${key}"`,
            './mcp.json',
          ),
        );
      }
    }
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    const raw = readTextFile(ctx.rootDir, './mcp.json');
    if (raw === null) return null;
    const server = extractServerName(diagnostic.message);
    const key = extractEnvKey(diagnostic.message);
    if (server === null || key === null) return null;
    const spans = findJsonMemberSpans(
      raw,
      (path, member) =>
        path.length === 3 &&
        path[0] === 'mcpServers' &&
        path[1] === server &&
        path[2] === 'env' &&
        member === key,
    );
    if (spans === null || spans.length === 0) return null;
    return memberRemovalFix(
      raw,
      spans[0],
      './mcp.json',
      `Remove reserved env key "${key}" from server "${server}"`,
    );
  },
};

function extractServerName(message: string): string | null {
  const match = /server "([^"]+)"/.exec(message);
  return match === null ? null : match[1];
}

function extractEnvKey(message: string): string | null {
  const match = /key "([^"]+)"/.exec(message);
  return match === null ? null : match[1];
}
