import { readFileSync } from 'node:fs';
import type { PluginManifest } from '@agent-plugin-doctor/core';
import type { ErrorObject } from 'ajv';
import { ParseError, SchemaValidationError } from './errors.js';
import { getPluginManifestValidator, mapAjvErrors } from './validation.js';

// Closed set of top-level fields permitted by the Agent Plugins spec (§5.2).
// Any other top-level field is an unknown field: it is reported and ignored
// (non-fatal) per §5.2 instead of rejecting the manifest.
const PERMITTED_TOP_LEVEL_FIELDS = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
]);

/**
 * Parse and validate a plugin.json file.
 *
 * @param filePath - Absolute path to plugin.json
 * @returns Parsed and validated PluginManifest
 * @throws ParseError if file cannot be read or parsed
 * @throws SchemaValidationError if manifest doesn't match schema
 */
export function parsePluginManifest(filePath: string): PluginManifest {
  // 1. Read file
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    const message =
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? `plugin.json not found: ${filePath}`
        : `Cannot read plugin.json: ${(error as Error).message}`;
    throw new ParseError(message, filePath, error);
  }

  // 2. Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new ParseError(
      `Invalid JSON in plugin.json: ${(error as Error).message}`,
      filePath,
      error,
    );
  }

  // 3. Validate against the vendored plugin.schema.json, collecting every error
  const validate = getPluginManifestValidator();
  if (validate(data)) {
    return data as PluginManifest;
  }

  const errors = validate.errors ?? [];

  // §5.2: unknown top-level fields and §8.1: non-object `extensions` are
  // non-fatal. Every other schema violation is fatal: reject the manifest.
  const fatalErrors = errors.filter((error) => !isNonFatalError(error));
  if (fatalErrors.length > 0) {
    throw new SchemaValidationError(
      `plugin.json does not conform to plugin.schema.json (${fatalErrors.length} violation${fatalErrors.length === 1 ? '' : 's'})`,
      filePath,
      mapAjvErrors(fatalErrors),
    );
  }

  // 4. Non-fatal path: ignore unknown top-level fields and a non-object
  //    `extensions` field, then return the sanitized manifest.
  return sanitizeManifest(data, errors);
}

/** A manifest error that the spec requires clients to report and ignore. */
function isNonFatalError(error: ErrorObject): boolean {
  // Unknown top-level field (§5.2)
  if (error.keyword === 'additionalProperties' && error.instancePath === '') {
    return true;
  }
  // Non-object `extensions` field (§8.1)
  if (error.keyword === 'type' && error.instancePath === '/extensions') {
    return true;
  }
  return false;
}

function sanitizeManifest(
  data: unknown,
  errors: ErrorObject[],
): PluginManifest {
  const manifest: Record<string, unknown> = {
    ...(data as Record<string, unknown>),
  };

  // Drop every unknown top-level field that triggered additionalProperties.
  for (const error of errors) {
    if (error.keyword === 'additionalProperties' && error.instancePath === '') {
      const property = String(error.params.additionalProperty);
      delete manifest[property];
    }
  }

  // Drop the non-object `extensions` field (§8.1).
  if (
    manifest.extensions !== undefined &&
    !isPlainObject(manifest.extensions)
  ) {
    delete manifest.extensions;
  }

  // Ensure the closed field set: defensively drop anything left over.
  for (const key of Object.keys(manifest)) {
    if (!PERMITTED_TOP_LEVEL_FIELDS.has(key)) {
      delete manifest[key];
    }
  }

  return manifest as unknown as PluginManifest;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
