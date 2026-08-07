// Shared test helpers for @agent-plugins-doctor/report

import { v1 } from '@agent-plugins-doctor/core';
import type {
  CompatibilityResult,
  Diagnostic,
  Plugin,
  RuleCategory,
  Severity,
  ValidationResult,
} from '@agent-plugins-doctor/core';

export const PLUGIN_SCHEMA = v1.PLUGIN_SCHEMA_URL;

export function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    rootDir: '/tmp/doctor-plugin',
    specVersion: '1.0.0',
    manifest: { $schema: PLUGIN_SCHEMA, name: 'my-plugin' },
    mcpConfig: undefined,
    skills: [],
    extensions: [],
    ...overrides,
  };
}

/** Diagnostics mirroring the report package spec example. */
export const EXAMPLE_DIAGNOSTICS: Diagnostic[] = [
  {
    code: 'DOC-1001',
    severity: 'error',
    message: 'Missing required field "version".',
    ruleId: 'manifest-required-fields',
    category: 'spec',
    file: 'plugin.json',
  },
  {
    code: 'DOC-1002',
    severity: 'error',
    message: 'Plugin name does not match the required pattern.',
    ruleId: 'manifest-name-pattern',
    category: 'spec',
    file: 'plugin.json',
    range: {
      start: { line: 3, column: 10 },
      end: { line: 3, column: 20 },
    },
    fix: {
      kind: 'replace',
      file: 'plugin.json',
      description: 'Rename plugin to "my-plugin"',
      oldText: '"name": "My Plugin"',
      newText: '"name": "my-plugin"',
    },
  },
  {
    code: 'DOC-7001',
    severity: 'warning',
    message: 'JSON formatting could be improved.',
    ruleId: 'format-json-formatting',
    category: 'format',
    file: 'plugin.json',
    fix: {
      kind: 'replace',
      file: 'plugin.json',
      description: 'Format plugin.json as canonical JSON',
    },
  },
  {
    code: 'DOC-5003',
    severity: 'info',
    message: 'Extra file at plugin root.',
    ruleId: 'structure-extra-files',
    category: 'structure',
    file: 'README.md',
  },
];

/** The five verified Agent Plugins clients, all fully compatible. */
export const EXAMPLE_COMPATIBILITY: CompatibilityResult[] = [
  {
    clientId: 'vscode',
    clientName: 'VS Code',
    level: 'full',
    compatible: true,
    working: [],
    unsupported: [],
    issues: [],
    evidence: 'docs',
  },
  {
    clientId: 'cursor',
    clientName: 'Cursor',
    level: 'full',
    compatible: true,
    working: [],
    unsupported: [],
    issues: [],
    evidence: 'docs',
  },
  {
    clientId: 'copilot',
    clientName: 'GitHub Copilot',
    level: 'full',
    compatible: true,
    working: [],
    unsupported: [],
    issues: [],
    evidence: 'docs',
  },
  {
    clientId: 'codex',
    clientName: 'ChatGPT & Codex',
    level: 'full',
    compatible: true,
    working: [],
    unsupported: [],
    issues: [],
    evidence: 'docs',
  },
  {
    clientId: 'kiro',
    clientName: 'Kiro',
    level: 'full',
    compatible: true,
    working: [],
    unsupported: [],
    issues: [],
    evidence: 'docs',
  },
];

/** Build a ValidationResult, computing the summary from the diagnostics. */
export function makeResult(
  overrides: {
    diagnostics?: Diagnostic[];
    compatibility?: CompatibilityResult[];
    compatible?: boolean;
  } = {},
): ValidationResult {
  const diagnostics = overrides.diagnostics ?? EXAMPLE_DIAGNOSTICS;
  const counts: Record<Severity, number> = {
    info: 0,
    warning: 0,
    error: 0,
    critical: 0,
  };
  const byCategory: Record<RuleCategory, number> = {
    spec: 0,
    skills: 0,
    mcp: 0,
    security: 0,
    structure: 0,
    compatibility: 0,
    format: 0,
  };
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
    byCategory[diagnostic.category] += 1;
  }
  const compatibility = overrides.compatibility ?? EXAMPLE_COMPATIBILITY;
  const hasBlocking = diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === 'error' || diagnostic.severity === 'critical',
  );
  return {
    plugin: makePlugin(),
    specVersion: '1.0.0',
    diagnostics,
    summary: { counts, byCategory },
    compatible: overrides.compatible ?? !hasBlocking,
    compatibility,
    elapsedMs: 42,
  };
}
