// Compatibility domain types for @agent-plugin-doctor/compatibility
// A client profile describes what a verified Agent Plugins client supports.
// Evidence level records how the profile was verified (docs vs runtime).

import type { Plugin } from '@agent-plugin-doctor/core';

export interface ClientProfile {
  id: string;
  name: string;
  supportedSpecVersions: string[];
  capabilities: ClientCapabilities;
  evidence: EvidenceLevel;
  source: string; // documentation URL
}

export interface ClientCapabilities {
  skills: boolean;
  mcpStdio: boolean;
  mcpStreamableHttp: boolean;
  mcpLegacySse: boolean;
  extensions: boolean;
}

export type EvidenceLevel = 'docs' | 'runtime' | 'expected' | 'none';

export interface CompatibilityCheck {
  clientId: string;
  clientName: string;
  compatible: boolean;
  issues: CompatibilityIssue[];
  evidence: EvidenceLevel;
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
