// Diagnostic system types

import type { Plugin } from './types.js';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export type RuleCategory =
  | 'spec'
  | 'skills'
  | 'mcp'
  | 'security'
  | 'structure'
  | 'compatibility'
  | 'format';

export interface Diagnostic {
  code: string; // stable ID, e.g., "DOC-1001"
  severity: Severity;
  message: string;
  ruleId: string;
  category: RuleCategory;
  file?: string; // plugin-relative path
  range?: DiagnosticRange;
  fix?: Fix;
  related?: Diagnostic[];
}

export interface DiagnosticRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export type FixKind = 'replace' | 'insert' | 'delete' | 'rename';

export interface Fix {
  kind: FixKind;
  file: string; // plugin-relative path
  description: string;
  // Additional data depending on kind
  oldText?: string;
  newText?: string;
  oldPath?: string;
  newPath?: string;
}

export interface ValidationResult {
  /**
   * The validated plugin, or null when it was validated from a scan result
   * whose plugin.json could not be loaded (see ScanResult).
   */
  plugin: Plugin | null;
  /**
   * The resolved spec version, or '' when unknown (plugin is null because the
   * manifest could not be loaded).
   */
  specVersion: string;
  diagnostics: Diagnostic[];
  summary: ValidationSummary;
  compatible: boolean;
  compatibility: CompatibilityResult[];
  elapsedMs: number;
}

export interface ValidationSummary {
  counts: Record<Severity, number>;
  byCategory: Record<RuleCategory, number>;
}

/**
 * Compatibility level of a client check.
 *
 * Aligned with the `CompatibilityLevel` enum in
 * `@agent-plugins-doctor/compatibility` (identical string values):
 * `full` | `partial` | `unsupported` | `unknown`. Core keeps its own type so
 * the foundation package stays dependency-free; the CLI bridge converts
 * between the two.
 */
export type CompatibilityLevel = 'full' | 'partial' | 'unsupported' | 'unknown';

export interface CompatibilityResult {
  clientId: string;
  clientName: string;
  level: CompatibilityLevel;
  /** Derived from `level`: `true` only for `'full'`. */
  compatible: boolean;
  /** Capabilities the plugin uses that the client supports. */
  working: string[];
  /** Capabilities the plugin uses that the client does not support. */
  unsupported: string[];
  issues: string[];
  evidence: 'docs' | 'runtime' | 'expected' | 'none';
}

export interface ValidationOptions {
  fix?: boolean;
  strict?: boolean;
  rules?: string[]; // rule IDs to run (empty = all)
  excludeRules?: string[]; // rule IDs to skip
}
