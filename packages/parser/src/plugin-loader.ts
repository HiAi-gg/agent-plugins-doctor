import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Dirent, Stats } from 'node:fs';
import type {
  AllowedToolsValue,
  Diagnostic,
  Extension,
  McpConfig,
  Plugin,
  PluginManifest,
  Skill,
} from '@agent-plugins-doctor/core';
import {
  resolvePluginPath,
  resolveSpecVersion,
} from '@agent-plugins-doctor/core';
import { ParsedFileCache } from './cache.js';
import { TRAVERSAL_SKIP_DIRS } from './traverse.js';
import {
  LoadError,
  ParseError,
  SchemaValidationError,
  type SchemaValidationErrorDetail,
} from './errors.js';
import { parseMcpConfig } from './mcp-config.js';
import { parsePluginManifest } from './plugin-manifest.js';
import {
  parseSkillFrontmatter,
  type ParsedSkill,
} from './skill-frontmatter.js';

// Reverse-domain namespace, e.g. com.example.client. Two or more dot-separated
// labels; each label is lowercase alphanumeric with optional interior hyphens.
const REVERSE_DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Options for loadPlugin.
 */
export interface LoadOptions {
  /**
   * Optional parsed-file cache shared across loadPlugin calls.
   *
   * When provided, plugin.json, mcp.json, and SKILL.md files are re-parsed
   * only when their mtime or size changed, so repeated loads of the same
   * directory (watch mode, incremental validation) skip the expensive parse
   * step entirely. The cache is keyed by absolute path; a single instance can
   * be shared across plugins and loadPlugin calls.
   */
  cache?: ParsedFileCache;
}

/**
 * The result of loadPlugin: the (possibly partial) Plugin model plus the raw
 * parse diagnostics produced while loading it.
 *
 * Failure isolation follows the spec: plugin.json failures are fatal (loadPlugin
 * throws), while skill load failures never prevent independently valid skills
 * from loading — each failure is collected here as a parse diagnostic instead.
 * Callers that run rules should merge `parseDiagnostics` into the rule
 * diagnostics so malformed user input is reported as a validation error
 * (exit 1) rather than silently dropped.
 */
export interface LoadResult {
  /** The partially loaded plugin. Skills that failed to load are omitted. */
  plugin: Plugin;
  /** Parse/load diagnostics for components that could not be loaded. */
  parseDiagnostics: Diagnostic[];
}

/**
 * The result of scanPlugin: the (possibly partial) Plugin model plus every
 * parse/schema/load error collected as a diagnostic. Unlike loadPlugin, the
 * scan never throws — every failure is reported in `diagnostics`, and the
 * components that loaded successfully are still returned so the validation
 * engine can run rules on the partial plugin.
 *
 * `plugin` is null only when plugin.json could not be loaded at all (missing,
 * unparseable, schema-invalid, or declaring an unsupported $schema). Skill,
 * mcp.json, and extension failures never prevent the rest of the plugin from
 * being represented.
 */
export interface ScanResult {
  /** Absolute path of the scanned plugin root directory. */
  rootDir: string;
  /** The partially loaded plugin, or null if plugin.json could not be loaded. */
  plugin: Plugin | null;
  /** All parse/schema/load errors, collected as diagnostics (ruleId "parser"). */
  diagnostics: Diagnostic[];
  /** What was actually loaded, component by component. */
  loaded: {
    /** plugin.json was read, parsed, and validated. */
    manifest: boolean;
    /** mcp.json was present and loaded successfully. */
    mcpConfig: boolean;
    /** Number of skills that loaded successfully. */
    skills: number;
    /** Number of discovered skills that failed to load. */
    skillsFailed: number;
    /** Number of extensions discovered. */
    extensions: number;
  };
}

/**
 * Options for scanPlugin.
 *
 * Currently supports the same parsed-file cache as loadPlugin (see
 * LoadOptions); future options for controlling scan behavior are additive.
 */
export type ScanOptions = LoadOptions;

/**
 * Parser-level diagnostic code: a discovered skill could not be loaded
 * (malformed SKILL.md, invalid frontmatter, or a path that escapes the plugin
 * root). Emitted by the parser, not by a rule (ruleId "parser").
 */
export const SKILL_LOAD_ERROR_CODE = 'DOC-2099';

/**
 * Parser-level diagnostic code: plugin.json could not be loaded — the file is
 * missing, unreadable, unparseable JSON, schema-invalid (one diagnostic per
 * violation), or the path escapes the plugin root. Also used when the plugin
 * root itself does not exist or is not a directory. Emitted by scanPlugin,
 * not by a rule (ruleId "parser").
 */
export const MANIFEST_LOAD_ERROR_CODE = 'DOC-1008';

/**
 * Parser-level diagnostic code: mcp.json could not be loaded — the file is
 * unreadable, unparseable JSON, schema-invalid at the top level (one
 * diagnostic per violation), or the path escapes the plugin root. Emitted by
 * scanPlugin, not by a rule (ruleId "parser").
 */
export const MCP_LOAD_ERROR_CODE = 'DOC-3007';

/**
 * Build the diagnostic for a skill that was discovered but failed to load.
 * `relDir` is the plugin-relative skill directory, e.g. "skills/summarize".
 */
function skillLoadError(relDir: string, reason: string): Diagnostic {
  return {
    code: SKILL_LOAD_ERROR_CODE,
    severity: 'error',
    message: `Failed to load skill: ${reason}`,
    ruleId: 'parser',
    category: 'skills',
    file: `${relDir}/SKILL.md`,
  };
}

/**
 * Build the diagnostic for a manifest (plugin.json) that could not be loaded.
 * `file` is the plugin-relative path and is omitted when the problem is the
 * plugin root itself (missing root, not a directory) rather than a file.
 */
function manifestLoadError(message: string, file?: string): Diagnostic {
  return {
    code: MANIFEST_LOAD_ERROR_CODE,
    severity: 'error',
    message,
    ruleId: 'parser',
    category: 'structure',
    file,
  };
}

/** Build the diagnostic for an mcp.json that could not be loaded. */
function mcpLoadError(message: string): Diagnostic {
  return {
    code: MCP_LOAD_ERROR_CODE,
    severity: 'error',
    message,
    ruleId: 'parser',
    category: 'mcp',
    file: 'mcp.json',
  };
}

/**
 * Build the diagnostic for one schema violation in plugin.json or mcp.json.
 * `detail` is a mapped Ajv error (path, message, keyword).
 */
function schemaViolationDiagnostic(
  file: string,
  detail: SchemaValidationErrorDetail,
  code: string,
  category: Diagnostic['category'],
): Diagnostic {
  const location = detail.path === '/' ? file : `${file}${detail.path}`;
  return {
    code,
    severity: 'error',
    message: `${location}: ${detail.message}`,
    ruleId: 'parser',
    category,
    file,
  };
}

/**
 * Shared loading pipeline for loadPlugin (strict) and scanPlugin (scan).
 *
 * Discovers and parses:
 * - plugin.json (required)
 * - mcp.json (optional)
 * - SKILL.md files in immediate children of skills/ (fixed depth)
 * - extensions (optional, reverse-domain namespaces)
 *
 * Security: only declared component files are read and parsed; code inside the
 * plugin is never executed. Every plugin-relative path is resolved through
 * resolvePluginPath so symlink escapes from the plugin root are rejected.
 *
 * Failure isolation follows the spec: plugin.json failures are fatal (they
 * leave `plugin` null), while mcp.json, skill, and extension failures are
 * isolated to their component type (§7.2.2, §7.1) and never prevent loading
 * independently valid components. Skill load failures are surfaced as
 * diagnostics (DOC-2099) instead of being silently dropped.
 *
 * In strict mode every fatal condition (missing root, missing/unreadable/
 * schema-invalid plugin.json, unsupported $schema) throws — `LoadError` for
 * filesystem and manifest-layout problems, `ParseError`/`SchemaValidationError`
 * for unparseable or schema-invalid manifests — and mcp.json failures stay
 * isolated (silently disabling MCP). In scan mode the same conditions are
 * collected as diagnostics (DOC-1008 / DOC-3007) and scanning continues so as
 * many useful diagnostics as possible are produced.
 *
 * @param rootDir - Absolute path to plugin root directory
 * @param strict - When true, throw on fatal errors (loadPlugin); when false,
 *                 collect them as diagnostics (scanPlugin)
 * @param options - Optional load options (see LoadOptions)
 */
async function loadPluginInternal(
  rootDir: string,
  strict: boolean,
  options: LoadOptions = {},
): Promise<ScanResult> {
  const diagnostics: Diagnostic[] = [];
  const loaded: ScanResult['loaded'] = {
    manifest: false,
    mcpConfig: false,
    skills: 0,
    skillsFailed: 0,
    extensions: 0,
  };

  // 1. Filesystem discovery: the root must exist and be a directory. A root
  //    that is missing or a plain file cannot be scanned at all.
  let rootStat: Stats;
  try {
    rootStat = statSync(rootDir);
  } catch (error) {
    if (strict) {
      throw new LoadError(
        `Plugin root does not exist: ${rootDir}`,
        rootDir,
        error,
      );
    }
    diagnostics.push(
      manifestLoadError(`Plugin root does not exist: ${rootDir}`),
    );
    return { rootDir, plugin: null, diagnostics, loaded };
  }
  if (!rootStat.isDirectory()) {
    if (strict) {
      throw new LoadError(
        `Plugin root is not a directory: ${rootDir}`,
        rootDir,
      );
    }
    diagnostics.push(
      manifestLoadError(`Plugin root is not a directory: ${rootDir}`),
    );
    return { rootDir, plugin: null, diagnostics, loaded };
  }

  // 2. Locate plugin.json. A manifest that escapes the plugin root rejects
  //    the plugin (§4.1 rule 1); in scan mode we record it and still scan the
  //    remaining components.
  let manifestPath: string | undefined;
  try {
    manifestPath = resolvePluginPath(rootDir, './plugin.json');
  } catch (error) {
    if (strict) {
      throw new LoadError(
        `plugin.json escapes the plugin root: ${(error as Error).message}`,
        rootDir,
        error,
      );
    }
    diagnostics.push(
      manifestLoadError(
        `plugin.json escapes the plugin root: ${(error as Error).message}`,
        'plugin.json',
      ),
    );
  }

  // 3. Parse and validate plugin.json, then resolve the spec version.
  let manifest: PluginManifest | undefined;
  let specVersion: string | undefined;
  if (manifestPath !== undefined) {
    if (!existsSync(manifestPath)) {
      if (strict) {
        throw new LoadError(
          `Missing plugin.json in plugin root: ${rootDir}`,
          rootDir,
        );
      }
      diagnostics.push(
        manifestLoadError(
          `Missing plugin.json in plugin root: ${rootDir}`,
          'plugin.json',
        ),
      );
    } else {
      try {
        manifest = parseManifest(manifestPath, options.cache);
        loaded.manifest = true;
      } catch (error) {
        if (strict) throw error;
        recordManifestParseError(error, diagnostics);
      }
    }
  }
  if (manifest !== undefined) {
    const spec = resolveSpecVersion(manifest.$schema);
    if (spec) {
      specVersion = spec.version;
    } else {
      if (strict) {
        throw new LoadError(
          `Unsupported plugin manifest schema: ${manifest.$schema}`,
          rootDir,
        );
      }
      diagnostics.push(
        manifestLoadError(
          `Unsupported plugin manifest schema: ${manifest.$schema}`,
          'plugin.json',
        ),
      );
    }
  }

  // 4. Load mcp.json if present (optional). Failures are isolated to the MCP
  //    component type (§7.2.2 rule 2): an invalid mcp.json disables MCP but
  //    does not prevent loading the rest of the plugin. In scan mode the
  //    failure is also surfaced as a diagnostic (DOC-3007).
  let mcpConfig: McpConfig | undefined;
  try {
    const mcpPath = resolvePluginPath(rootDir, './mcp.json');
    mcpConfig = parseMcp(mcpPath, options.cache);
    if (mcpConfig !== undefined) loaded.mcpConfig = true;
  } catch (error) {
    mcpConfig = undefined;
    if (!strict) recordMcpLoadError(error, diagnostics);
  }

  // 5. Discover skills and extensions. Skill load failures are collected into
  //    `diagnostics` (DOC-2099) and never prevent other skills from loading.
  const [skills, extensions] = await Promise.all([
    discoverSkills(rootDir, options.cache, diagnostics),
    discoverExtensions(rootDir),
  ]);
  loaded.skills = skills.length;
  loaded.extensions = extensions.length;
  loaded.skillsFailed = diagnostics.filter(
    (diagnostic) => diagnostic.code === SKILL_LOAD_ERROR_CODE,
  ).length;

  // 6. Build the (partial) plugin. Null when the manifest could not be loaded
  //    or its spec version is unsupported — in strict mode that never happens
  //    here because the conditions throw above.
  const plugin: Plugin | null =
    manifest !== undefined && specVersion !== undefined
      ? { rootDir, specVersion, manifest, mcpConfig, skills, extensions }
      : null;

  return { rootDir, plugin, diagnostics, loaded };
}

/** Record a manifest parse failure as diagnostics (scan mode only). */
function recordManifestParseError(
  error: unknown,
  diagnostics: Diagnostic[],
): void {
  if (error instanceof ParseError) {
    diagnostics.push(manifestLoadError(error.message, 'plugin.json'));
  } else if (error instanceof SchemaValidationError) {
    // One diagnostic per schema violation (§5.2).
    for (const detail of error.errors) {
      diagnostics.push(
        schemaViolationDiagnostic(
          'plugin.json',
          detail,
          MANIFEST_LOAD_ERROR_CODE,
          'structure',
        ),
      );
    }
  } else {
    diagnostics.push(
      manifestLoadError((error as Error).message, 'plugin.json'),
    );
  }
}

/** Record an mcp.json load failure as diagnostics (scan mode only). */
function recordMcpLoadError(error: unknown, diagnostics: Diagnostic[]): void {
  if (error instanceof ParseError) {
    diagnostics.push(mcpLoadError(error.message));
  } else if (error instanceof SchemaValidationError) {
    // Top-level violations disable MCP; report each one (§7.2.2 rule 2).
    for (const detail of error.errors) {
      diagnostics.push(
        schemaViolationDiagnostic(
          'mcp.json',
          detail,
          MCP_LOAD_ERROR_CODE,
          'mcp',
        ),
      );
    }
  } else {
    diagnostics.push(mcpLoadError((error as Error).message));
  }
}

/**
 * Load a complete plugin from a directory, throwing on fatal errors.
 *
 * Strict variant of the shared pipeline: plugin.json failures (missing root,
 * missing/unreadable/schema-invalid manifest, unsupported $schema) throw,
 * while mcp.json, skill, and extension failures are isolated to their
 * component type (§7.2.2, §7.1) and never prevent loading independently valid
 * components. Skill load failures are surfaced as parse diagnostics in the
 * returned LoadResult instead of being silently dropped.
 *
 * For a diagnostic-oriented variant that never throws and reports every
 * failure as a diagnostic, see `scanPlugin`.
 *
 * @param rootDir - Absolute path to plugin root directory
 * @param options - Optional load options (see LoadOptions)
 * @returns LoadResult containing the partially loaded Plugin and any parse
 *          diagnostics collected while loading it
 * @throws LoadError if the root does not exist, plugin.json is missing, or
 *         plugin.json escapes the plugin root; ParseError or
 *         SchemaValidationError if plugin.json is unparseable or invalid
 */
export async function loadPlugin(
  rootDir: string,
  options: LoadOptions = {},
): Promise<LoadResult> {
  const { plugin, diagnostics } = await loadPluginInternal(
    rootDir,
    true,
    options,
  );
  if (!plugin) {
    // Unreachable in strict mode (every fatal condition throws above);
    // defensive so a regression cannot silently return null.
    throw new LoadError('Failed to load plugin', rootDir);
  }
  return { plugin, parseDiagnostics: diagnostics };
}

/**
 * Scan a plugin directory, collecting every load error as a diagnostic.
 *
 * Scan variant of the shared pipeline: unlike loadPlugin it never throws.
 * plugin.json failures leave `plugin` null but scanning continues over the
 * remaining components, so the result carries as many useful diagnostics as
 * possible without executing any plugin code. Skill and mcp.json failures are
 * reported as diagnostics while their components are skipped, and every
 * component that loaded successfully is still returned for validation.
 *
 * @param rootDir - Absolute path to plugin root directory
 * @param options - Optional scan options (see ScanOptions)
 * @returns ScanResult with the (possibly null) plugin, all diagnostics, and a
 *          per-component breakdown of what was loaded
 */
export async function scanPlugin(
  rootDir: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  return loadPluginInternal(rootDir, false, options);
}

/** Parse plugin.json, optionally through the parsed-file cache. */
function parseManifest(
  manifestPath: string,
  cache: ParsedFileCache | undefined,
): PluginManifest {
  if (cache === undefined) return parsePluginManifest(manifestPath);
  return cache.get(manifestPath, () =>
    parsePluginManifest(manifestPath),
  ) as PluginManifest;
}

/** Parse mcp.json, optionally through the parsed-file cache. */
function parseMcp(
  mcpPath: string,
  cache: ParsedFileCache | undefined,
): McpConfig | undefined {
  if (cache === undefined) return parseMcpConfig(mcpPath);
  return cache.get(mcpPath, () => parseMcpConfig(mcpPath)) as
    McpConfig | undefined;
}

/**
 * List the entries of a plugin directory, skipping hidden entries (names
 * starting with '.') and system/vendor directories (.git, node_modules).
 * These are never part of the plugin spec, so discovery skips them instead of
 * attempting (and failing) to parse them.
 */
function listPluginEntries(dir: string): Dirent[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .filter((entry) => !TRAVERSAL_SKIP_DIRS.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover skills in a plugin directory.
 * Skills are discovered at fixed depth: SKILL.md in immediate children of skills/.
 *
 * Skill load failures never prevent other skills from loading (§7.1); each
 * failure is collected into `diagnostics` so the caller can surface it.
 */
async function discoverSkills(
  rootDir: string,
  cache: ParsedFileCache | undefined,
  diagnostics: Diagnostic[],
): Promise<Skill[]> {
  // Missing or non-directory skills location is not an error (§6.2)
  const skillsDir = join(rootDir, 'skills');
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
    return [];
  }

  const entries = listPluginEntries(skillsDir);
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      // Not a skill candidate (a directory containing SKILL.md is a skill);
      // skipped silently, not reported.
      continue;
    }

    // Security boundary: the skill directory must resolve inside the plugin
    // root. A symlink escape means the skill cannot be loaded; it is skipped
    // (§4.1 rule 3) and reported as a load failure.
    let skillDir: string;
    try {
      skillDir = resolvePluginPath(rootDir, `./skills/${entry.name}`);
    } catch (error) {
      diagnostics.push(
        skillLoadError(
          `skills/${entry.name}`,
          `skill directory cannot be resolved inside the plugin root: ${(error as Error).message}`,
        ),
      );
      continue;
    }

    // Only a directory containing a regular file named exactly SKILL.md is a
    // skill; anything else is skipped (non-fatal, §7.1).
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) {
      continue;
    }

    // SKILL.md itself must also resolve inside the plugin root. A file-level
    // symlink escape means the skill cannot be loaded; it is skipped and
    // reported as a load failure.
    let skillFileResolved: string;
    try {
      skillFileResolved = resolvePluginPath(
        rootDir,
        `./skills/${entry.name}/SKILL.md`,
      );
    } catch (error) {
      diagnostics.push(
        skillLoadError(
          `skills/${entry.name}`,
          `SKILL.md cannot be resolved inside the plugin root: ${(error as Error).message}`,
        ),
      );
      continue;
    }

    // A skill that does not conform is skipped, other skills still load
    // (§7.1), and the parse failure is surfaced as a diagnostic instead of
    // being silently dropped.
    let parsed: ParsedSkill;
    try {
      parsed = parseSkill(skillFileResolved, cache);
    } catch (error) {
      diagnostics.push(
        skillLoadError(`skills/${entry.name}`, (error as Error).message),
      );
      continue;
    }

    skills.push({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      body: parsed.body,
      directory: `skills/${entry.name}`,
      frontmatter: parsed.frontmatter,
      license: parsed.frontmatter.license,
      compatibility: parsed.frontmatter.compatibility,
      metadata: parsed.frontmatter.metadata,
      // parseSkillFrontmatter preserves `allowed-tools` verbatim (any YAML
      // value); split the canonical string form here for the
      // Skill.allowedTools convenience field.
      allowedTools: normalizeAllowedToolsForSkill(
        parsed.frontmatter['allowed-tools'],
      ),
    });
  }

  return skills;
}

function normalizeAllowedToolsForSkill(
  value: AllowedToolsValue | undefined,
): string[] | undefined {
  // Only the canonical space-separated string form splits into a tool list;
  // non-string values are left for the DOC-2005 rule to diagnose.
  if (typeof value !== 'string') return undefined;
  return value.split(/\s+/).filter((tool) => tool.length > 0);
}

/** Read and parse one SKILL.md, optionally through the parsed-file cache. */
function parseSkill(
  skillFile: string,
  cache: ParsedFileCache | undefined,
): ParsedSkill {
  const read = (): ParsedSkill =>
    parseSkillFrontmatter(readFileSync(skillFile, 'utf8'), skillFile);
  if (cache === undefined) return read();
  return cache.get(skillFile, read) as ParsedSkill;
}

/**
 * Discover extensions in a plugin directory.
 * Extensions are reverse-domain namespace directories (§8.2).
 */
async function discoverExtensions(rootDir: string): Promise<Extension[]> {
  const entries = listPluginEntries(rootDir);
  const extensions: Extension[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !REVERSE_DOMAIN_PATTERN.test(entry.name)) {
      continue;
    }

    // Security boundary: the extension directory must resolve inside the
    // plugin root; escaping paths are denied (§4.1 rule 5).
    let extensionDir: string;
    try {
      extensionDir = resolvePluginPath(rootDir, `./${entry.name}`);
    } catch {
      continue;
    }

    // Best-effort extension data: extension.json has no portable semantics
    // (§8), so an unreadable or unparsable file yields no data. The file is
    // resolved through the security boundary again so a file-level symlink
    // escape is denied too (extensionDir is a real path inside the root).
    let data: unknown = {};
    try {
      const extensionFile = resolvePluginPath(extensionDir, './extension.json');
      if (existsSync(extensionFile) && statSync(extensionFile).isFile()) {
        data = JSON.parse(readFileSync(extensionFile, 'utf8'));
      }
    } catch {
      data = {};
    }

    extensions.push({
      namespace: entry.name,
      data,
      path: entry.name,
    });
  }

  return extensions;
}
