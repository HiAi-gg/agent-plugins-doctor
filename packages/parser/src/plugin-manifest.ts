import { readFileSync } from 'node:fs';
import {
  getCurrentSpecVersion,
  resolveSpecVersion,
  type Diagnostic,
  type PluginManifest,
} from '@agent-plugins-doctor/core';
import type { ErrorObject } from 'ajv';
import {
  ParseError,
  SchemaValidationError,
  UnsupportedVersionError,
} from './errors.js';
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
 * @param diagnostics - Optional collection for non-fatal parse findings
 *                      (DOC-1009, DOC-1010). When omitted, these findings are
 *                      not surfaced (the parser keeps its error-throwing
 *                      contract for fatal conditions).
 * @returns Parsed and validated PluginManifest
 * @throws ParseError if file cannot be read or parsed
 * @throws SchemaValidationError if manifest doesn't match schema
 * @throws UnsupportedVersionError if the declared $schema is unsupported
 */
export function parsePluginManifest(
  filePath: string,
  diagnostics?: Diagnostic[],
): PluginManifest {
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

  // 2.5. Structurally invalid `extensions` (§8.1): the spec requires the
  // field to be an object keyed by reverse-domain namespace. A non-object
  // value is reported and ignored (non-fatal) — but it must not be silently
  // dropped, so emit an explicit DOC-1009 diagnostic.
  if (diagnostics !== undefined && hasInvalidExtensions(data)) {
    diagnostics.push({
      code: 'DOC-1009',
      severity: 'error',
      message: 'extensions must be an object keyed by reverse-domain namespace',
      file: 'plugin.json',
      ruleId: 'parser',
      category: 'spec',
    });
  }

  // 2.6. Unsupported spec version: fail fast with a clear message instead of
  // the generic schema const violation (which would surface as DOC-1008).
  // The vendored schema pins $schema to the 1.0.0 URL, so an unsupported
  // version would otherwise be reported as a vague "must be equal to
  // constant" schema error. Detect it before validation and let the loader
  // surface the dedicated DOC-1010 diagnostic from the thrown error.
  const schemaUrl = (data as Record<string, unknown> | null)?.$schema;
  if (typeof schemaUrl === 'string' && resolveSpecVersion(schemaUrl) === null) {
    throw new UnsupportedVersionError(
      unsupportedVersionMessage(schemaUrl),
      filePath,
      schemaUrl,
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

/** Whether the parsed manifest declares an `extensions` field that is not a
 * plain object (§8.1). Absent fields and plain objects are valid. */
function hasInvalidExtensions(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }
  const extensions = (data as Record<string, unknown>).extensions;
  return extensions !== undefined && !isPlainObject(extensions);
}

/** The clear, actionable message for an unsupported `$schema` version. */
function unsupportedVersionMessage(schemaUrl: string): string {
  return `Plugin targets ${schemaUrl}, but Doctor validates Agent Plugins v${getCurrentSpecVersion().version}. Update your plugin or use a Doctor version that supports this schema.`;
}
