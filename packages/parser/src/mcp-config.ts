import { existsSync, readFileSync } from 'node:fs';
import type { ErrorObject } from 'ajv';
import type { McpConfig, McpServer } from '@agent-plugin-doctor/core';
import { ParseError, SchemaValidationError } from './errors.js';
import {
  getMcpConfigValidator,
  getMcpServerValidator,
  mapAjvErrors,
} from './validation.js';

// Instance path of an individual server entry, e.g. /mcpServers/my-server
const SERVER_ENTRY_PATH = /^\/mcpServers\/[^/]+$/;

/**
 * Parse and validate an mcp.json file.
 *
 * mcp.json is optional: if the file does not exist, `undefined` is returned.
 * If present, it must be valid — a top-level violation (missing or wrong
 * `$schema`, missing or non-object `mcpServers`, unknown top-level field, or
 * a server entry that is not an object) throws SchemaValidationError.
 *
 * Individual server entries are validated with failure isolation (§7.2.2):
 * an invalid server object is skipped and the remaining servers are returned,
 * so one bad server does not invalidate the others.
 *
 * @param filePath - Absolute path to mcp.json
 * @returns Parsed and validated McpConfig, or undefined if the file is absent
 * @throws ParseError if file cannot be read or parsed
 * @throws SchemaValidationError if the configuration violates the schema at
 *         the top level (see §7.2.1)
 */
export function parseMcpConfig(filePath: string): McpConfig | undefined {
  // mcp.json is optional (§6.2): a missing file is not an error
  if (!existsSync(filePath)) {
    return undefined;
  }

  // 1. Read file
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ParseError(
      `Cannot read mcp.json: ${(error as Error).message}`,
      filePath,
      error,
    );
  }

  // 2. Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new ParseError(
      `Invalid JSON in mcp.json: ${(error as Error).message}`,
      filePath,
      error,
    );
  }

  // 3. Validate the whole document against the vendored mcp.schema.json
  const validate = getMcpConfigValidator();
  if (validate(data)) {
    return data as McpConfig;
  }

  // 4. Failure boundary: top-level violations disable MCP for the plugin
  //    (§7.2.2 rule 2). Violations inside a server entry are isolated and
  //    handled per-server below (§7.2.2 rule 3).
  const errors = validate.errors ?? [];
  const fatalErrors = errors.filter((error) => !isServerEntryError(error));
  if (fatalErrors.length > 0) {
    throw new SchemaValidationError(
      `mcp.json does not conform to mcp.schema.json (${fatalErrors.length} violation${fatalErrors.length === 1 ? '' : 's'})`,
      filePath,
      mapAjvErrors(fatalErrors),
    );
  }

  // 5. Per-server validation with failure isolation: keep valid servers,
  //    skip invalid ones.
  const config = data as {
    $schema: string;
    mcpServers: Record<string, unknown>;
  };
  const validateServer = getMcpServerValidator();
  const mcpServers: Record<string, McpServer> = {};
  for (const [name, server] of Object.entries(config.mcpServers)) {
    if (validateServer(server)) {
      mcpServers[name] = server as McpServer;
    }
  }

  return { $schema: config.$schema, mcpServers };
}

/**
 * An error contained within an individual server entry (the server object
 * itself or one of its properties). Such errors are isolated per-server.
 *
 * A server entry whose *value* is not an object is a top-level violation
 * (§7.2.1: "member values are server configuration objects") and is fatal.
 */
function isServerEntryError(error: ErrorObject): boolean {
  const path = error.instancePath;
  // A non-object server value violates the top-level structure (§7.2.1)
  if (error.keyword === 'type' && SERVER_ENTRY_PATH.test(path)) {
    return false;
  }
  // Everything under a server object is isolated per-server (§7.2.2 rule 3)
  return path.startsWith('/mcpServers/');
}
