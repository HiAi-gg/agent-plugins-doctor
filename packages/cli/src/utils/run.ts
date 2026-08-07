// Shared command pipeline: resolve the plugin directory, scan the plugin,
// validate it, and attach the compatibility check to the validation result.

import { statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CompatibilityResult,
  Diagnostic,
  ValidationOptions,
  ValidationResult,
} from '@agent-plugin-doctor/core';
import type { CompatibilityCheck } from '@agent-plugin-doctor/compatibility';
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';
import {
  LoadError,
  ParseError,
  scanPlugin,
  SchemaValidationError,
} from '@agent-plugin-doctor/parser';
import { validatePlugin } from '@agent-plugin-doctor/rules';
import { EXIT_CODES } from './exit-codes.js';
import { error } from './output.js';

/** Resolve a plugin directory argument to an absolute path. */
export function resolvePluginDir(dir: string): string {
  return resolve(dir);
}

/**
 * Verify the plugin root is a readable directory before scanning.
 *
 * A missing or non-directory root is a tool failure (exit 3), not a
 * validation error: `scanPlugin` would collect it as a DOC-1008 diagnostic,
 * but the CLI keeps tool-failure semantics for an inaccessible root.
 */
export function assertRootAccessible(rootDir: string): void {
  let stat: Stats;
  try {
    stat = statSync(rootDir);
  } catch (cause) {
    throw new LoadError(
      `Plugin root does not exist: ${rootDir}`,
      rootDir,
      cause,
    );
  }
  if (!stat.isDirectory()) {
    throw new LoadError(`Plugin root is not a directory: ${rootDir}`, rootDir);
  }
}

/**
 * Load, validate, and check compatibility for a plugin directory.
 *
 * Uses `scanPlugin` (diagnostic-oriented loading, never throws): malformed
 * user input — unparseable or schema-invalid plugin.json (DOC-1008), skills
 * that fail to load (DOC-2099), invalid mcp.json (DOC-3007) — is collected as
 * parser diagnostics and merged ahead of the rule diagnostics by
 * `validatePlugin`, so it surfaces as a validation error (exit 1) instead of
 * a tool failure (exit 3). Only an inaccessible root (missing directory) is
 * still a tool failure.
 *
 * The compatibility check is merged into the validation result so the report
 * formatters render it alongside the diagnostics. When plugin.json could not
 * be loaded there is no plugin to check clients against, so the compatibility
 * array is empty.
 */
export async function loadAndValidate(
  dir: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const rootDir = resolvePluginDir(dir);
  assertRootAccessible(rootDir);
  const scanResult = await scanPlugin(rootDir);
  const result = await validatePlugin(scanResult, options);
  const compatibility =
    result.plugin === null
      ? []
      : toCoreCompatibility(checkCompatibility(result.plugin).checks);
  return { ...result, compatibility };
}

/** Merge parser-level parse diagnostics with rule diagnostics. */
export function mergeDiagnostics(
  parseDiagnostics: Diagnostic[],
  ruleDiagnostics: Diagnostic[],
): Diagnostic[] {
  return [...parseDiagnostics, ...ruleDiagnostics];
}

/** Map compatibility package checks onto the core CompatibilityResult shape. */
export function toCoreCompatibility(
  checks: CompatibilityCheck[],
): CompatibilityResult[] {
  return checks.map((check) => ({
    clientId: check.clientId,
    clientName: check.clientName,
    level: check.level,
    compatible: check.compatible,
    working: check.working,
    unsupported: check.unsupported,
    issues: check.issues.map((issue) => issue.message),
    evidence: check.evidence,
  }));
}

/** Errors that mean the plugin could not be loaded or parsed. */
export function isPluginLoadError(error: unknown): boolean {
  return (
    error instanceof LoadError ||
    error instanceof ParseError ||
    error instanceof SchemaValidationError
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Report a command failure and set the tool-failure exit code (3).
 * Load/parse errors get a contextual prefix; anything else is unexpected.
 */
export function handleCommandError(cause: unknown): void {
  if (isPluginLoadError(cause)) {
    error(`Failed to load plugin: ${errorMessage(cause)}`);
  } else {
    error(`Unexpected error: ${errorMessage(cause)}`);
  }
  process.exitCode = EXIT_CODES.TOOL_FAILURE;
}

/** Split a comma-separated option value into a trimmed, non-empty list. */
export function splitList(value: string | undefined): string[] {
  if (value === undefined || value === '') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
