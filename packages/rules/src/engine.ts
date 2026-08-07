// Validation engine: runs the applicable rules over a plugin, computes the
// summary, and derives the process exit code.

import type {
  Diagnostic,
  Plugin,
  RuleCategory,
  Severity,
  ValidationOptions,
  ValidationResult,
  ValidationSummary,
} from '@agent-plugin-doctor/core';
import type { ScanResult } from '@agent-plugin-doctor/parser';
import type { Rule, RuleContext } from './rule.js';
import type { RuleRegistry } from './registry.js';
import { applyFixes } from './fixes.js';
import { createDefaultRegistry } from './rules/index.js';

// Code assigned when a rule throws while running. Produces exit code 3.
export const INTERNAL_ERROR_CODE = 'DOC-0000';

const SEVERITY_RANK: Record<Severity, number> = {
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

export class ValidationEngine {
  constructor(private registry: RuleRegistry) {}

  /**
   * Validate a plugin, or a scan result produced by the parser.
   *
   * In scan mode the parser's parse/schema/load diagnostics are merged ahead
   * of the rule diagnostics, and rules that require a loaded plugin model are
   * skipped when the manifest could not be loaded (scanResult.plugin is
   * null); rules that inspect the raw tree still run. Passing a Plugin
   * directly keeps the previous strict behavior (rule diagnostics only).
   */
  async validate(
    pluginOrScanResult: Plugin | ScanResult,
    options: ValidationOptions = {},
  ): Promise<ValidationResult> {
    const started = Date.now();
    const { plugin, rootDir, parseDiagnostics } =
      splitScanResult(pluginOrScanResult);
    const rules = this.selectRules(plugin, options);
    const ruleDiagnostics = this.runRules(plugin, rootDir, rules);

    // Best-effort auto-fix pass. Fixes are idempotent, so applying them in the
    // same pass is safe even when multiple rules touch the same file.
    if (options.fix === true) {
      const fixable = ruleDiagnostics.filter(
        (diagnostic) => diagnostic.fix !== undefined,
      );
      if (fixable.length > 0) {
        await applyFixes(rootDir, fixable);
      }
    }

    // Parse diagnostics come first so malformed user input (e.g. an
    // unparseable plugin.json) surfaces as the plugin's first problems.
    const diagnostics = [...parseDiagnostics, ...ruleDiagnostics];
    const summary = this.computeSummary(diagnostics);
    const compatible = !diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === 'error' || diagnostic.severity === 'critical',
    );

    return {
      plugin,
      specVersion: plugin === null ? '' : plugin.specVersion,
      diagnostics: this.sortDiagnostics(diagnostics),
      summary,
      compatible,
      // Phase 6: populated by @agent-plugin-doctor/compatibility
      compatibility: [],
      elapsedMs: Date.now() - started,
    };
  }

  /**
   * Incremental validation: re-validate a plugin using a previous result,
   * re-running only the rules affected by the changed files.
   *
   * The fresh `plugin` argument must already be loaded from disk (e.g. via
   * loadPlugin). A rule is considered affected when:
   *
   * - it declares `files` and one of those files is in `changedFiles`, or
   * - it is a structure rule (category "structure"), which inspect the tree
   *   layout and are conservatively re-run for any change, or
   * - it reads the plugin model and any changed file is part of that model
   *   (plugin.json, mcp.json, a discovered SKILL.md, or an extension.json).
   *
   * Diagnostics from unaffected rules are reused from `previous`; diagnostics
   * from affected rules are recomputed. When the plugin root or spec version
   * changed, or when rule filtering options are used, this falls back to a
   * full validation. Passing every file as changed is equivalent to a full
   * validation.
   */
  async validateIncremental(
    plugin: Plugin,
    previous: ValidationResult,
    changedFiles: string[],
    options: ValidationOptions = {},
  ): Promise<ValidationResult> {
    const started = Date.now();

    // Rule filtering does not compose with incremental reuse: the previous
    // diagnostics were produced under different selection rules.
    const hasFiltering =
      (options.rules !== undefined && options.rules.length > 0) ||
      (options.excludeRules !== undefined && options.excludeRules.length > 0);

    if (
      previous.plugin === null ||
      previous.plugin.rootDir !== plugin.rootDir ||
      previous.specVersion !== plugin.specVersion ||
      hasFiltering
    ) {
      return this.validate(plugin, options);
    }

    const rules = this.selectRules(plugin, options);
    const affected = this.affectedRules(plugin, rules, changedFiles);
    const reused = previous.diagnostics.filter(
      (diagnostic) => !affected.some((rule) => rule.id === diagnostic.ruleId),
    );
    const fresh = this.runRules(plugin, plugin.rootDir, affected);
    const diagnostics = [...reused, ...fresh];

    // Same best-effort auto-fix pass as full validation.
    if (options.fix === true) {
      const fixable = diagnostics.filter(
        (diagnostic) => diagnostic.fix !== undefined,
      );
      if (fixable.length > 0) {
        await applyFixes(plugin.rootDir, fixable);
      }
    }

    const summary = this.computeSummary(diagnostics);
    const compatible = !diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === 'error' || diagnostic.severity === 'critical',
    );

    return {
      plugin,
      specVersion: plugin.specVersion,
      diagnostics: this.sortDiagnostics(diagnostics),
      summary,
      compatible,
      compatibility: previous.compatibility,
      elapsedMs: Date.now() - started,
    };
  }

  /**
   * Determine which rules must re-run given the changed files. Rules not in
   * the returned set keep their previous diagnostics.
   */
  private affectedRules(
    plugin: Plugin,
    rules: Rule[],
    changedFiles: string[],
  ): Rule[] {
    const changed = new Set(changedFiles.map(normalizeRelPath));
    if (changed.size === 0) return [];

    const modelFiles = this.modelFileSet(plugin);
    const hasModelChange = [...changed].some((file) => modelFiles.has(file));

    return rules.filter((rule) => {
      if (rule.files !== undefined && rule.files.length > 0) {
        return rule.files.some((file) => changed.has(normalizeRelPath(file)));
      }
      if (rule.category === 'structure') {
        // Layout rules see the whole tree; conservatively re-run them for any
        // change (a new or removed root entry can change their diagnostics).
        return true;
      }
      return hasModelChange;
    });
  }

  /**
   * The set of plugin-relative files that feed the in-memory Plugin model.
   * A change to any of them can change what model-based rules observe.
   */
  private modelFileSet(plugin: Plugin): Set<string> {
    const files = new Set<string>(['plugin.json']);
    if (plugin.mcpConfig !== undefined) files.add('mcp.json');
    for (const skill of plugin.skills) {
      files.add(normalizeRelPath(`${skill.directory}/SKILL.md`));
    }
    for (const extension of plugin.extensions) {
      files.add(normalizeRelPath(`${extension.path}/extension.json`));
    }
    return files;
  }

  /**
   * Run the given rules over the plugin, attaching fixes produced by rule.fix().
   *
   * `plugin` may be null when validating a scan result whose manifest could
   * not be loaded; in that case the caller guarantees every rule in `rules`
   * declares `requiresPlugin: false` (it inspects only `rootDir`), so the
   * context's plugin field is never dereferenced.
   */
  runRules(
    plugin: Plugin | null,
    rootDir: string,
    rules: Rule[],
  ): Diagnostic[] {
    const ctx: RuleContext = { plugin: plugin as Plugin, rootDir };
    const diagnostics: Diagnostic[] = [];

    for (const rule of rules) {
      try {
        for (const diagnostic of rule.check(ctx)) {
          // Enforce consistency regardless of what the rule populated.
          diagnostic.ruleId = rule.id;
          diagnostic.category = rule.category;
          if (rule.fix) {
            try {
              const fix = rule.fix(ctx, diagnostic);
              if (fix) diagnostic.fix = fix;
            } catch {
              // A failing fix helper must not fail the whole validation.
            }
          }
          diagnostics.push(diagnostic);
        }
      } catch (error) {
        diagnostics.push({
          code: INTERNAL_ERROR_CODE,
          severity: 'error',
          message: `Rule "${rule.id}" failed during validation: ${(error as Error).message}`,
          ruleId: rule.id,
          category: rule.category,
        });
      }
    }

    return diagnostics;
  }

  /**
   * Select rules honoring, in order:
   * 1. explicit include list (options.rules) or enabledByDefault
   * 2. exclude list (options.excludeRules)
   * 3. spec-version support
   *
   * When `plugin` is null (scan result with an unloadable manifest) only the
   * rules that inspect the raw tree (requiresPlugin === false) can run; the
   * spec-version filter is skipped because the version is unknown.
   */
  private selectRules(
    plugin: Plugin | null,
    options: ValidationOptions,
  ): Rule[] {
    const include = options.rules;
    const exclude = options.excludeRules;
    let rules = this.registry.getAll();
    if (include && include.length > 0) {
      rules = rules.filter((rule) => include.includes(rule.id));
    } else {
      rules = rules.filter((rule) => rule.enabledByDefault);
    }
    if (exclude && exclude.length > 0) {
      rules = rules.filter((rule) => !exclude.includes(rule.id));
    }
    if (plugin === null) {
      return rules.filter((rule) => rule.requiresPlugin === false);
    }
    return rules.filter(
      (rule) =>
        rule.supportedSpecVersions.includes('*') ||
        rule.supportedSpecVersions.includes(plugin.specVersion),
    );
  }

  /**
   * Compute the summary counts for a set of diagnostics.
   * Public so CLI/report layers and tests can reuse it.
   */
  computeSummary(diagnostics: Diagnostic[]): ValidationSummary {
    return computeSummary(diagnostics);
  }

  /**
   * Exit codes:
   * 0 - no error/critical diagnostics (warnings ok, unless strict)
   * 1 - at least one error diagnostic (or a warning under strict mode)
   * 2 - at least one critical diagnostic
   * 3 - at least one rule failed internally (DOC-0000)
   *
   * Public so CLI/report layers and tests can reuse it.
   */
  computeExitCode(
    diagnostics: Diagnostic[],
    options: ValidationOptions = {},
  ): number {
    if (
      diagnostics.some((diagnostic) => diagnostic.code === INTERNAL_ERROR_CODE)
    ) {
      return 3;
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'critical')) {
      return 2;
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return 1;
    }
    if (
      options.strict === true &&
      diagnostics.some((diagnostic) => diagnostic.severity === 'warning')
    ) {
      return 1;
    }
    return 0;
  }

  /** Deterministic order: severity, then code, then file, then message. */
  private sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return [...diagnostics].sort((a, b) => {
      const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (rankDiff !== 0) return rankDiff;
      if (a.code !== b.code) return a.code < b.code ? -1 : 1;
      const fileA = a.file ?? '';
      const fileB = b.file ?? '';
      if (fileA !== fileB) return fileA < fileB ? -1 : 1;
      return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
    });
  }
}

/**
 * Compute the summary counts for a set of diagnostics.
 *
 * Exported so callers that merge parser-level parse diagnostics into rule
 * diagnostics (e.g. the CLI pipeline) can recompute the summary over the
 * combined set.
 */
export function computeSummary(diagnostics: Diagnostic[]): ValidationSummary {
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
  return { counts, byCategory };
}

/** Normalize a plugin-relative path for comparisons (strip a leading "./"). */
function normalizeRelPath(path: string): string {
  return path.replace(/^\.\//, '');
}

/** True when the value is a parser ScanResult rather than a loaded Plugin. */
function isScanResult(value: Plugin | ScanResult): value is ScanResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'loaded' in value &&
    'diagnostics' in value
  );
}

/**
 * Split the validation input into the plugin model (possibly null), the
 * plugin root directory, and the parser-level diagnostics to merge.
 */
function splitScanResult(pluginOrScanResult: Plugin | ScanResult): {
  plugin: Plugin | null;
  rootDir: string;
  parseDiagnostics: Diagnostic[];
} {
  if (isScanResult(pluginOrScanResult)) {
    return {
      plugin: pluginOrScanResult.plugin,
      rootDir: pluginOrScanResult.rootDir,
      parseDiagnostics: pluginOrScanResult.diagnostics,
    };
  }
  return {
    plugin: pluginOrScanResult,
    rootDir: pluginOrScanResult.rootDir,
    parseDiagnostics: [],
  };
}

/**
 * Validate a plugin with the default rule registry.
 *
 * Accepts either a loaded Plugin (strict mode: rule diagnostics only) or a
 * ScanResult from `scanPlugin` (diagnostic mode: parser parse/schema/load
 * diagnostics are merged in, and rules that need a loaded plugin model are
 * skipped when the manifest could not be loaded).
 */
export async function validatePlugin(
  pluginOrScanResult: Plugin | ScanResult,
  options?: ValidationOptions,
): Promise<ValidationResult> {
  return new ValidationEngine(createDefaultRegistry()).validate(
    pluginOrScanResult,
    options,
  );
}

/**
 * Incrementally re-validate a plugin with the default rule registry, reusing
 * diagnostics from `previous` for rules unaffected by `changedFiles`.
 *
 * See ValidationEngine.validateIncremental for the affected-rule semantics.
 */
export async function validateIncremental(
  plugin: Plugin,
  previous: ValidationResult,
  changedFiles: string[],
  options?: ValidationOptions,
): Promise<ValidationResult> {
  return new ValidationEngine(createDefaultRegistry()).validateIncremental(
    plugin,
    previous,
    changedFiles,
    options,
  );
}
