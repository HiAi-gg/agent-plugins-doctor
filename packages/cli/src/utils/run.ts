// Shared command pipeline: resolve the plugin directory, load the plugin,
// validate it, and attach the compatibility check to the validation result.

import { resolve } from 'node:path';
import type {
  CompatibilityResult,
  ValidationOptions,
  ValidationResult,
} from '@agent-plugin-doctor/core';
import type { CompatibilityCheck } from '@agent-plugin-doctor/compatibility';
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';
import {
  loadPlugin,
  LoadError,
  ParseError,
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
 * Load, validate, and check compatibility for a plugin directory.
 * The compatibility check is merged into the validation result so the report
 * formatters render it alongside the diagnostics.
 */
export async function loadAndValidate(
  dir: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const plugin = await loadPlugin(resolvePluginDir(dir));
  const result = await validatePlugin(plugin, options);
  const compatibility = checkCompatibility(plugin);
  return {
    ...result,
    compatibility: toCoreCompatibility(compatibility.checks),
  };
}

/** Map compatibility package checks onto the core CompatibilityResult shape. */
export function toCoreCompatibility(
  checks: CompatibilityCheck[],
): CompatibilityResult[] {
  return checks.map((check) => ({
    clientId: check.clientId,
    clientName: check.clientName,
    compatible: check.compatible,
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
