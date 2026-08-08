// Shared AJV setup for the vendored Agent Plugins JSON Schemas.
//
// The vendored schemas are draft 2020-12, so the 2020-12 Ajv export is used.
// Validators are created lazily and cached: schema compilation is expensive and
// the schemas are never mutated.
//
// AJV errors are mapped to SchemaValidationErrorDetail so callers receive
// stable, actionable messages instead of raw Ajv ErrorObjects.

import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { SchemaValidationErrorDetail } from './errors.js';
import pluginSchema from './schemas/plugin.schema.json';
import mcpSchema from './schemas/mcp.schema.json';

let pluginValidator: ValidateFunction | undefined;
let mcpValidator: ValidateFunction | undefined;
let serverValidator: ValidateFunction | undefined;
let stdioValidator: ValidateFunction | undefined;
let httpValidator: ValidateFunction | undefined;
let sseValidator: ValidateFunction | undefined;

/** Compile (once) and return the validator for plugin.schema.json. */
export function getPluginManifestValidator(): ValidateFunction {
  if (!pluginValidator) {
    pluginValidator = new Ajv2020({ allErrors: true, strict: false }).compile(
      pluginSchema,
    );
  }
  return pluginValidator;
}

/** Compile (once) and return the validator for mcp.schema.json. */
export function getMcpConfigValidator(): ValidateFunction {
  if (!mcpValidator) {
    mcpValidator = new Ajv2020({ allErrors: true, strict: false }).compile(
      mcpSchema,
    );
  }
  return mcpValidator;
}

/**
 * Compile (once) and return a validator for a single MCP server entry
 * (mcp.schema.json#/$defs/server). The full schema is registered on the
 * instance first so the sibling $refs inside the server definitions resolve.
 */
export function getMcpServerValidator(): ValidateFunction {
  if (!serverValidator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema(mcpSchema);
    serverValidator = ajv.compile({ $ref: `${mcpSchema.$id}#/$defs/server` });
  }
  return serverValidator;
}

/**
 * Compile (once) and return validators for the three individual server
 * branch subschemas (stdio, streamable-http, sse). Per-server failure
 * isolation validates each entry against every branch and keeps the closest
 * match, so the diagnostic reports the actual offending property instead of
 * the ambiguous oneOf noise Ajv emits for mismatched sibling branches.
 */
export function getServerBranchValidators(): ValidateFunction[] {
  if (!stdioValidator || !httpValidator || !sseValidator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema(mcpSchema);
    stdioValidator = ajv.compile({
      $ref: `${mcpSchema.$id}#/$defs/stdioServer`,
    });
    httpValidator = ajv.compile({
      $ref: `${mcpSchema.$id}#/$defs/streamableHttpServer`,
    });
    sseValidator = ajv.compile({ $ref: `${mcpSchema.$id}#/$defs/sseServer` });
  }
  return [stdioValidator, httpValidator, sseValidator];
}

/** Map raw AJV errors to the stable SchemaValidationErrorDetail shape. */
export function mapAjvErrors(
  errors: ErrorObject[],
): SchemaValidationErrorDetail[] {
  return errors.map((error) => ({
    path: error.instancePath || '/',
    message: describeError(error),
    keyword: error.keyword,
  }));
}

function describeError(error: ErrorObject): string {
  switch (error.keyword) {
    case 'required':
      return `missing required property '${String(error.params.missingProperty)}'`;
    case 'additionalProperties':
      return `unknown property '${String(error.params.additionalProperty)}'`;
    default:
      return error.message ?? error.keyword;
  }
}
