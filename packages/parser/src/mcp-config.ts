import { existsSync, readFileSync } from 'node:fs';
import type { ErrorObject } from 'ajv';
import {
  isTraversalPath,
  type Diagnostic,
  type McpConfig,
  type McpServer,
} from '@agent-plugins-doctor/core';
import { ParseError, SchemaValidationError } from './errors.js';
import {
  getMcpConfigValidator,
  getServerBranchValidators,
  mapAjvErrors,
} from './validation.js';

// Instance path of an individual server entry, e.g. /mcpServers/my-server
const SERVER_ENTRY_PATH = /^\/mcpServers\/[^/]+$/;

/**
 * Parser-level diagnostic code: an individual mcp.json server entry could not
 * be parsed — it violates mcp.schema.json, or its stdio `command`/`cwd`
 * escapes the plugin root (path traversal). The entry is preserved in
 * `mcpServers` as `null` so the rules engine can report it (DOC-3008) instead
 * of the server silently disappearing. Emitted by the parser, not by a rule
 * (ruleId "parser").
 *
 * Severity: a traversal entry (escaping stdio `command` or `cwd`) is a
 * security-critical finding (severity "critical", exit 2, matching DOC-4001);
 * every other schema violation is a validation error (severity "error",
 * exit 1).
 */
export const MCP_SERVER_ERROR_CODE = 'DOC-3008';

/**
 * Parse and validate an mcp.json file.
 *
 * mcp.json is optional: if the file does not exist, `undefined` is returned.
 * If present, it must be valid — a top-level violation (missing or wrong
 * `$schema`, missing or non-object `mcpServers`, unknown top-level field, or
 * a server entry that is not an object) throws SchemaValidationError.
 *
 * Individual server entries are validated with failure isolation (§7.2.2):
 * every raw entry is preserved in the returned config — valid entries as
 * typed servers, invalid entries as `null` — and each invalid entry produces
 * a DOC-3008 parser diagnostic in `serverDiagnostics`. One bad server never
 * invalidates its siblings, and no invalid server silently disappears.
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

  // 3. Validate the whole document against the vendored mcp.schema.json. The
  //    result decides the failure boundary only; per-server handling always
  //    runs below so schema-valid documents still get the per-server checks
  //    (e.g. stdio command containment).
  const validate = getMcpConfigValidator();
  if (!validate(data)) {
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
  }

  // 5. Per-server validation with failure isolation: every raw entry is
  //    preserved — valid servers stay typed, invalid entries become `null`
  //    with a DOC-3008 parser diagnostic, and validation continues over the
  //    valid siblings. An invalid server is never silently dropped.
  const config = data as {
    $schema: string;
    mcpServers: Record<string, unknown>;
  };
  const branches = getServerBranchValidators();
  const mcpServers: Record<string, McpServer | null> = {};
  const serverDiagnostics: Diagnostic[] = [];
  for (const [name, server] of Object.entries(config.mcpServers)) {
    // Validate against each server branch independently and keep the closest
    // match (fewest violations), so the reported problem is the real one —
    // not the oneOf noise Ajv emits for the mismatched sibling branches.
    let bestErrors: ErrorObject[] = [];
    for (const validateBranch of branches) {
      validateBranch(server);
      const errors = validateBranch.errors ?? [];
      if (errors.length === 0) {
        bestErrors = [];
        break;
      }
      if (bestErrors.length === 0 || errors.length < bestErrors.length) {
        bestErrors = errors;
      }
    }
    if (bestErrors.length === 0) {
      const commandProblem = stdioCommandTraversal(server);
      if (commandProblem !== null) {
        mcpServers[name] = null;
        serverDiagnostics.push(
          mcpServerDiagnostic(name, commandProblem, 'critical'),
        );
        continue;
      }
      mcpServers[name] = server as McpServer;
      continue;
    }
    mcpServers[name] = null;
    serverDiagnostics.push(
      mcpServerDiagnostic(
        name,
        describeServerProblem(server, bestErrors),
        // A schema-violated entry whose raw `command` or `cwd` is a traversal
        // path is a security-critical finding, matching DOC-4001.
        hasTraversalReference(server) ? 'critical' : 'error',
      ),
    );
  }

  return {
    $schema: config.$schema,
    mcpServers,
    ...(serverDiagnostics.length > 0 ? { serverDiagnostics } : {}),
  };
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

/** Build the DOC-3008 parser diagnostic for one invalid server entry. */
function mcpServerDiagnostic(
  name: string,
  problem: string,
  severity: 'error' | 'critical',
): Diagnostic {
  return {
    code: MCP_SERVER_ERROR_CODE,
    severity,
    message: `MCP server "${name}" is invalid: ${problem}`,
    file: 'mcp.json',
    ruleId: 'parser',
    category: 'mcp',
  };
}

/**
 * The most actionable description of why a server entry failed validation.
 * Picks the highest-priority schema violation and renders it with the actual
 * offending values where available, so the diagnostic reads like the
 * DOC-3xxx rule messages instead of raw Ajv output.
 */
function describeServerProblem(
  rawServer: unknown,
  errors: ErrorObject[],
): string {
  const server = isPlainObject(rawServer) ? rawServer : {};
  const error = mostActionableError(errors);
  if (error === undefined) return 'does not conform to the MCP server schema';
  switch (error.keyword) {
    case 'propertyNames': {
      const key = error.params.propertyName as string | undefined;
      return key === undefined
        ? 'env declares a reserved key'
        : `env declares reserved key "${key}"`;
    }
    case 'const':
    case 'enum': {
      const type = server.type;
      const shown = typeof type === 'string' ? `"${type}"` : String(type);
      return `type ${shown} is not supported (expected stdio, streamable-http, or sse)`;
    }
    case 'required': {
      const prop = error.params.missingProperty as string | undefined;
      return prop === undefined
        ? (error.message ?? error.keyword)
        : `missing required property '${prop}'`;
    }
    case 'pattern': {
      const cwd = server.cwd;
      const shown = typeof cwd === 'string' ? `"${cwd}"` : String(cwd);
      return `cwd ${shown} must start with "./", "\${PLUGIN_ROOT}", or "\${PLUGIN_DATA}"`;
    }
    case 'additionalProperties': {
      const prop = error.params.additionalProperty as string | undefined;
      return prop === undefined
        ? (error.message ?? error.keyword)
        : `unknown property '${prop}'`;
    }
    default:
      return error.message ?? error.keyword;
  }
}

/**
 * Pick the single schema violation that best explains the problem, preferring
 * specific keywords over noisy oneOf bookkeeping. Ajv emits every failing
 * branch with allErrors, so without prioritization the first error is often a
 * misleading "must have required property 'url'" for a stdio-shaped object.
 */
function mostActionableError(errors: ErrorObject[]): ErrorObject | undefined {
  const priority: Record<string, number> = {
    propertyNames: 1,
    const: 2,
    enum: 2,
    required: 3,
    pattern: 4,
    additionalProperties: 5,
    oneOf: 6,
  };
  return [...errors].sort(
    (a, b) => (priority[a.keyword] ?? 9) - (priority[b.keyword] ?? 9),
  )[0];
}

/**
 * Containment check for a stdio server's `command`: the command is an
 * executable token resolved against the plugin runtime, so a path that
 * escapes the plugin root (absolute path or `..` parent traversal) is an
 * invalid server entry. Returns a human-readable problem description, or
 * null when the entry (or its command) is not a traversing path.
 */
function stdioCommandTraversal(server: unknown): string | null {
  if (!isPlainObject(server) || server.type !== 'stdio') return null;
  const command = server.command;
  if (typeof command !== 'string' || command.length === 0) return null;
  if (!isTraversalPath(command)) return null;
  return `command "${command}" escapes the plugin root (path traversal)`;
}

/**
 * Whether a raw (possibly schema-invalid) server entry declares a `command`
 * or `cwd` that escapes the plugin root. Mirrors the DOC-4001 definition of a
 * traversal path so parser and rule severity agree: such an entry is a
 * security-critical finding (DOC-3008 critical, exit 2), not a plain
 * validation error.
 */
function hasTraversalReference(server: unknown): boolean {
  if (!isPlainObject(server)) return false;
  if (typeof server.command === 'string' && isTraversalPath(server.command)) {
    return true;
  }
  if (typeof server.cwd === 'string' && isTraversalPath(server.cwd)) {
    return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
