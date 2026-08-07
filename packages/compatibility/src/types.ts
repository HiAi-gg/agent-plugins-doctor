// Compatibility domain types for @agent-plugins-doctor/compatibility
// A client profile describes what a verified Agent Plugins client supports.
// Evidence level records how the profile was verified (docs vs runtime).

import type { Plugin } from '@agent-plugins-doctor/core';

export interface ClientProfile {
  id: string;
  name: string;
  supportedSpecVersions: string[];
  capabilities: ClientCapabilities;
  evidence: EvidenceLevel;
  source: string; // documentation URL
  /** When and against what the profile's capabilities were last verified. */
  verificationNote: string;
}

export interface ClientCapabilities {
  skills: boolean;
  mcpStdio: boolean;
  mcpStreamableHttp: boolean;
  mcpLegacySse: boolean;
  /**
   * Whether the client supports the extension mechanism and safely ignores
   * unknown extension namespaces (spec §8.2). This does **not** mean the
   * client understands every extension namespace — namespaces are
   * vendor/client-specific, and understanding a namespace must be verified
   * per namespace, not implied by the mechanism flag.
   */
  extensions: boolean;
  /** Clarification of what `extensions` means for this client: which
   * namespaces are verified, or how unknown namespaces are handled. */
  extensionsNote?: string;
}

/**
 * How a client handles the plugin's extension namespaces in a check (spec §8).
 *
 * - `supported` — the client verifiably understands the namespace(s); only
 *   possible when a profile explicitly lists verified namespaces.
 * - `ignored` — the client supports the extension mechanism and safely
 *   ignores unknown namespaces (the spec-sanctioned default, §8.2); the
 *   plugin still works.
 * - `unsupported` — the client does not support extensions.
 * - `unknown` — there is insufficient evidence about extension behavior.
 */
export type ExtensionsHandling =
  'supported' | 'ignored' | 'unsupported' | 'unknown';

export type EvidenceLevel = 'docs' | 'runtime' | 'expected' | 'none';

/**
 * How fully a client supports a plugin.
 *
 * - `FULL` — every plugin capability the client can honor is supported
 *   (an unsupported extension is optional and safely ignored, so it does not
 *   downgrade a check from FULL).
 * - `PARTIAL` — at least one plugin capability works with the client and at
 *   least one does not (e.g. a plugin using Skills + stdio MCP + SSE MCP
 *   checked against a client that lacks the legacy SSE transport).
 * - `UNSUPPORTED` — no plugin capability works with the client (e.g. the
 *   plugin's spec version is not supported, or every transport it uses is
 *   unavailable).
 * - `UNKNOWN` — there is insufficient evidence to determine a level (e.g. the
 *   client profile has `evidence: 'none'`).
 */
export enum CompatibilityLevel {
  FULL = 'full',
  PARTIAL = 'partial',
  UNSUPPORTED = 'unsupported',
  UNKNOWN = 'unknown',
}

/**
 * A plugin capability that a client can support or lack. Extensions are not
 * in this set: they are optional and safely ignored, so they never appear in
 * `working`/`unsupported`.
 */
export type CapabilityId =
  'skills' | 'mcp-stdio' | 'mcp-streamable-http' | 'mcp-sse';

export interface CompatibilityCheck {
  clientId: string;
  clientName: string;
  level: CompatibilityLevel;
  /** Derived from `level`: `true` only for `CompatibilityLevel.FULL`. */
  compatible: boolean;
  /** Capabilities the plugin uses that the client supports. */
  working: CapabilityId[];
  /** Capabilities the plugin uses that the client does not support. */
  unsupported: CapabilityId[];
  issues: CompatibilityIssue[];
  evidence: EvidenceLevel;
  /** How the plugin's extensions are handled; undefined when the plugin
   * declares none. Set when the plugin has extensions: `'ignored'` when the
   * client supports the mechanism (unknown namespaces safely ignored per
   * §8.2), `'unsupported'` when it does not, `'unknown'` when the profile has
   * insufficient evidence, and `'supported'` only for explicitly verified
   * namespaces. */
  extensionsHandling?: ExtensionsHandling;
}

export interface CompatibilityIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  component?: 'skills' | 'mcp' | 'extensions';
}

export interface CompatibilityResult {
  plugin: Plugin;
  checks: CompatibilityCheck[];
  summary: {
    total: number;
    compatible: number;
    incompatible: number;
  };
}
