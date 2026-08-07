// Compatibility checker: compares a plugin against every registered client
// profile. Checks are conservative — a missing client capability produces an
// issue instead of assuming compatibility. Errors are blocking (unsupported
// spec version, skills, or MCP transports); warnings cover optional features
// such as extensions that clients may safely ignore.

import type { McpServer, Plugin } from '@agent-plugin-doctor/core';
import type {
  ClientCapabilities,
  ClientProfile,
  CompatibilityCheck,
  CompatibilityIssue,
  CompatibilityResult,
} from './types.js';
import { createDefaultClientRegistry } from './clients.js';
import type { ClientProfileRegistry } from './clients.js';

const TRANSPORT_CAPABILITY: Record<
  McpServer['type'],
  keyof ClientCapabilities
> = {
  stdio: 'mcpStdio',
  'streamable-http': 'mcpStreamableHttp',
  sse: 'mcpLegacySse',
};

export class CompatibilityChecker {
  constructor(private registry: ClientProfileRegistry) {}

  /** Check a plugin against every client in the registry. */
  check(plugin: Plugin): CompatibilityResult {
    const checks = this.registry
      .getAll()
      .map((client) => this.checkClient(plugin, client));
    const compatible = checks.filter((check) => check.compatible).length;
    return {
      plugin,
      checks,
      summary: {
        total: checks.length,
        compatible,
        incompatible: checks.length - compatible,
      },
    };
  }

  private checkClient(
    plugin: Plugin,
    client: ClientProfile,
  ): CompatibilityCheck {
    const issues: CompatibilityIssue[] = [];

    if (!client.supportedSpecVersions.includes(plugin.specVersion)) {
      issues.push({
        severity: 'error',
        message: `Client "${client.name}" supports spec version(s) ${client.supportedSpecVersions.join(', ')}, but the plugin declares ${plugin.specVersion}`,
      });
    }

    issues.push(...this.checkSkills(plugin, client));
    issues.push(...this.checkMcp(plugin, client));
    issues.push(...this.checkExtensions(plugin, client));

    return {
      clientId: client.id,
      clientName: client.name,
      compatible: !issues.some((issue) => issue.severity === 'error'),
      issues,
      evidence: client.evidence,
    };
  }

  private checkSkills(
    plugin: Plugin,
    client: ClientProfile,
  ): CompatibilityIssue[] {
    if (plugin.skills.length === 0 || client.capabilities.skills) return [];
    return [
      {
        severity: 'error',
        component: 'skills',
        message: `Client "${client.name}" does not support skills, but the plugin declares ${plugin.skills.length} skill(s)`,
      },
    ];
  }

  private checkMcp(
    plugin: Plugin,
    client: ClientProfile,
  ): CompatibilityIssue[] {
    const servers = plugin.mcpConfig?.mcpServers;
    if (servers === undefined) return [];

    const counts = new Map<McpServer['type'], number>();
    for (const server of Object.values(servers)) {
      counts.set(server.type, (counts.get(server.type) ?? 0) + 1);
    }

    const issues: CompatibilityIssue[] = [];
    for (const [transport, count] of counts) {
      const capability = TRANSPORT_CAPABILITY[transport];
      if (client.capabilities[capability]) continue;
      issues.push({
        severity: 'error',
        component: 'mcp',
        message: `Client "${client.name}" does not support ${transport} MCP servers, but the plugin declares ${count} of that transport`,
      });
    }
    return issues;
  }

  private checkExtensions(
    plugin: Plugin,
    client: ClientProfile,
  ): CompatibilityIssue[] {
    if (plugin.extensions.length === 0 || client.capabilities.extensions) {
      return [];
    }
    return [
      {
        severity: 'warning',
        component: 'extensions',
        message: `Client "${client.name}" does not support extensions, so the plugin's ${plugin.extensions.length} extension(s) will be ignored`,
      },
    ];
  }
}

/** Check a plugin against the default registry (or a custom one). */
export function checkCompatibility(
  plugin: Plugin,
  registry?: ClientProfileRegistry,
): CompatibilityResult {
  return new CompatibilityChecker(
    registry ?? createDefaultClientRegistry(),
  ).check(plugin);
}
