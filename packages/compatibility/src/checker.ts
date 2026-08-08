// Compatibility checker: compares a plugin against every registered client
// profile. Checks are conservative — a missing client capability produces an
// issue instead of assuming compatibility. Errors are blocking (unsupported
// spec version, skills, or MCP transports); extensions are optional and
// safely ignored per spec §8, so they only ever produce warnings or info
// based on the client's extension behavior. `extensions: true` means the
// client supports the mechanism and safely ignores unknown namespaces
// (§8.2) — never that it "understands" the plugin's namespaces.

import type { McpServer, Plugin } from '@agent-plugins-doctor/core';
import type {
  CapabilityId,
  ClientProfile,
  CompatibilityCheck,
  CompatibilityIssue,
  CompatibilityResult,
  ExtensionsHandling,
} from './types.js';
import { CompatibilityLevel } from './types.js';
import { createDefaultClientRegistry } from './clients.js';
import type { ClientProfileRegistry } from './clients.js';

/** Boolean capability keys; `extensions` and `extensionsNote` are handled
 * separately — extensions are optional and never count as capabilities. */
type CapabilityKey =
  'skills' | 'mcpStdio' | 'mcpStreamableHttp' | 'mcpLegacySse';

const TRANSPORT_CAPABILITY: Record<McpServer['type'], CapabilityKey> = {
  stdio: 'mcpStdio',
  'streamable-http': 'mcpStreamableHttp',
  sse: 'mcpLegacySse',
};

/** Canonical capability ids, in deterministic order. Extensions are excluded:
 * they are optional and never contribute to `working`/`unsupported`. */
const CAPABILITY_IDS: Record<CapabilityKey, CapabilityId> = {
  skills: 'skills',
  mcpStdio: 'mcp-stdio',
  mcpStreamableHttp: 'mcp-streamable-http',
  mcpLegacySse: 'mcp-sse',
};

/** Reverse lookup: capability id → ClientCapabilities key. */
const CAPABILITY_KEYS: Record<CapabilityId, CapabilityKey> = {
  skills: 'skills',
  'mcp-stdio': 'mcpStdio',
  'mcp-streamable-http': 'mcpStreamableHttp',
  'mcp-sse': 'mcpLegacySse',
};

/** The plugin capabilities the plugin actually uses (in canonical order). */
function usedCapabilities(plugin: Plugin): CapabilityId[] {
  const used: CapabilityId[] = [];
  if (plugin.skills.length > 0) used.push('skills');
  const servers = plugin.mcpConfig?.mcpServers;
  if (servers !== undefined) {
    const transports = new Set(
      Object.values(servers)
        // A null entry is a server that failed to parse (DOC-3008); it has
        // no transport, so it contributes no capability.
        .filter((server): server is McpServer => server !== null)
        .map((server) => TRANSPORT_CAPABILITY[server.type]),
    );
    for (const capability of [
      'mcpStdio',
      'mcpStreamableHttp',
      'mcpLegacySse',
    ] as const) {
      if (transports.has(capability)) used.push(CAPABILITY_IDS[capability]);
    }
  }
  return used;
}

/** Whether the client supports the given capability id. */
function clientSupports(
  client: ClientProfile,
  capability: CapabilityId,
): boolean {
  return client.capabilities[CAPABILITY_KEYS[capability]];
}

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
    const specUnsupported = !client.supportedSpecVersions.includes(
      plugin.specVersion,
    );

    if (specUnsupported) {
      issues.push({
        severity: 'error',
        message: `Client "${client.name}" supports spec version(s) ${client.supportedSpecVersions.join(', ')}, but the plugin declares ${plugin.specVersion}`,
      });
    }

    issues.push(...this.checkSkills(plugin, client));
    issues.push(...this.checkMcp(plugin, client));
    issues.push(...this.checkExtensions(plugin, client));

    // Extensions are optional (ignored safely), so they never count against a
    // client: only skills and MCP transports are real capabilities.
    const capabilities = usedCapabilities(plugin);
    const working = capabilities.filter((capability) =>
      clientSupports(client, capability),
    );
    const unsupported = capabilities.filter(
      (capability) => !clientSupports(client, capability),
    );

    const level = determineLevel(client, specUnsupported, working, unsupported);
    const extensionsHandling = determineExtensionsHandling(plugin, client);

    return {
      clientId: client.id,
      clientName: client.name,
      level,
      compatible: level === CompatibilityLevel.FULL,
      working,
      unsupported,
      issues,
      evidence: client.evidence,
      extensionsHandling,
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
      // A null entry is a server that failed to parse (DOC-3008); it has no
      // transport to count against a client.
      if (server === null) continue;
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
    if (plugin.extensions.length === 0) return [];

    // An unverified profile: we cannot tell how extensions are handled, so
    // the finding is informational rather than a warning.
    if (client.evidence === 'none') {
      return [
        {
          severity: 'info',
          component: 'extensions',
          message: `Extension behavior for client "${client.name}" is unverified; the plugin's ${plugin.extensions.length} extension(s) may not be processed`,
        },
      ];
    }

    // `extensions: true` means the client supports the mechanism and safely
    // ignores unknown namespaces per spec §8.2 — never that it "understands"
    // the plugin's namespaces (that requires per-namespace verification).
    if (client.capabilities.extensions) return [];

    return [
      {
        severity: 'warning',
        component: 'extensions',
        message: `Client "${client.name}" does not support extensions, so the plugin's ${plugin.extensions.length} extension(s) will be ignored`,
      },
    ];
  }
}

/**
 * How the client handles the plugin's extensions, or `undefined` when the
 * plugin declares none. With the simple capability model (no verified
 * namespace lists) Doctor never claims `supported`: `extensions: true` means
 * the client supports the mechanism and safely ignores unknown namespaces
 * per spec §8.2, reported as `ignored`.
 */
function determineExtensionsHandling(
  plugin: Plugin,
  client: ClientProfile,
): ExtensionsHandling | undefined {
  if (plugin.extensions.length === 0) return undefined;
  if (client.evidence === 'none') return 'unknown';
  return client.capabilities.extensions ? 'ignored' : 'unsupported';
}

/**
 * Determine the compatibility level for one client check.
 *
 * - Unsupported spec version → `UNSUPPORTED` (nothing can work).
 * - Profile evidence `none` → `UNKNOWN` (insufficient evidence).
 * - No unsupported capabilities → `FULL`.
 * - Every used capability unsupported → `UNSUPPORTED`.
 * - Mixed → `PARTIAL`.
 */
function determineLevel(
  client: ClientProfile,
  specUnsupported: boolean,
  working: CapabilityId[],
  unsupported: CapabilityId[],
): CompatibilityLevel {
  if (specUnsupported) return CompatibilityLevel.UNSUPPORTED;
  if (client.evidence === 'none') return CompatibilityLevel.UNKNOWN;
  if (unsupported.length === 0) return CompatibilityLevel.FULL;
  if (working.length === 0) return CompatibilityLevel.UNSUPPORTED;
  return CompatibilityLevel.PARTIAL;
}

/**
 * Check a plugin against the default registry (or a custom one).
 *
 * `null`/`undefined` is handled gracefully: the result carries a null plugin
 * and no checks (total 0), so callers never crash on an unloadable plugin.
 */
export function checkCompatibility(
  plugin: Plugin | null | undefined,
  registry?: ClientProfileRegistry,
): CompatibilityResult {
  if (!plugin) {
    return {
      plugin: null,
      checks: [],
      summary: {
        total: 0,
        compatible: 0,
        incompatible: 0,
      },
    };
  }
  return new CompatibilityChecker(
    registry ?? createDefaultClientRegistry(),
  ).check(plugin);
}
