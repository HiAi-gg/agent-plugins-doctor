// The Rule contract: a single, independently testable validation rule.

import type {
  Diagnostic,
  Fix,
  Plugin,
  RuleCategory,
  Severity,
} from '@agent-plugins-doctor/core';

export interface RuleContext {
  plugin: Plugin;
  rootDir: string;
}

export interface Rule {
  id: string; // e.g., "manifest-name-pattern"
  code: string; // stable diagnostic code, e.g., "DOC-1002"
  name: string; // human-readable name
  category: RuleCategory;
  severity: Severity;
  supportedSpecVersions: string[]; // e.g., ["1.0.0"]; "*" means all versions
  description: string;
  enabledByDefault: boolean;

  /**
   * Plugin-relative paths this rule reads directly from disk in `check()`
   * (raw files the parser strips or normalizes at load time, e.g.
   * "./plugin.json" for rules that detect parser-stripped fields).
   *
   * Rules that read only the in-memory Plugin object omit this. Incremental
   * validation uses the declaration to decide which rules must re-run when a
   * file changes: a rule re-runs when one of its declared files changed,
   * while rules without `files` re-run whenever any part of the loaded plugin
   * model changed.
   */
  files?: string[];

  /**
   * When false, `check()` inspects only the raw tree (via `ctx.rootDir`) and
   * never dereferences `ctx.plugin`, so the rule can run on a scan result
   * whose plugin model could not be loaded (plugin.json missing or
   * unparseable). Defaults to true: rules without this flag require a valid
   * Plugin and are skipped when only scan diagnostics are available.
   */
  requiresPlugin?: boolean;

  check(ctx: RuleContext): Diagnostic[];
  fix?(ctx: RuleContext, diagnostic: Diagnostic): Fix | null;
}
