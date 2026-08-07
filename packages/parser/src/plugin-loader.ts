import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Dirent } from 'node:fs';
import type {
  Extension,
  McpConfig,
  Plugin,
  PluginManifest,
  Skill,
} from '@agent-plugin-doctor/core';
import {
  resolvePluginPath,
  resolveSpecVersion,
} from '@agent-plugin-doctor/core';
import { ParsedFileCache } from './cache.js';
import { TRAVERSAL_SKIP_DIRS } from './traverse.js';
import { LoadError } from './errors.js';
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
 * Load a complete plugin from a directory.
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
 * Failure isolation follows the spec: plugin.json failures are fatal, while
 * mcp.json, skill, and extension failures are isolated to their component type
 * (§7.2.2, §7.1) and never prevent loading independently valid components.
 *
 * @param rootDir - Absolute path to plugin root directory
 * @param options - Optional load options (see LoadOptions)
 * @returns Fully loaded Plugin object
 * @throws LoadError if the root does not exist, plugin.json is missing, or
 *         plugin.json escapes the plugin root
 */
export async function loadPlugin(
  rootDir: string,
  options: LoadOptions = {},
): Promise<Plugin> {
  // 1. Verify rootDir exists and is a directory
  let rootStat;
  try {
    rootStat = statSync(rootDir);
  } catch (error) {
    throw new LoadError(
      `Plugin root does not exist: ${rootDir}`,
      rootDir,
      error,
    );
  }
  if (!rootStat.isDirectory()) {
    throw new LoadError(`Plugin root is not a directory: ${rootDir}`, rootDir);
  }

  // 2. Load and parse plugin.json (required). A manifest that escapes the
  //    plugin root rejects the plugin (§4.1 rule 1).
  let manifestPath: string;
  try {
    manifestPath = resolvePluginPath(rootDir, './plugin.json');
  } catch (error) {
    throw new LoadError(
      `plugin.json escapes the plugin root: ${(error as Error).message}`,
      rootDir,
      error,
    );
  }
  if (!existsSync(manifestPath)) {
    throw new LoadError(
      `Missing plugin.json in plugin root: ${rootDir}`,
      rootDir,
    );
  }
  const manifest = parseManifest(manifestPath, options.cache);

  // 3. Extract spec version from $schema
  const spec = resolveSpecVersion(manifest.$schema);
  if (!spec) {
    throw new LoadError(
      `Unsupported plugin manifest schema: ${manifest.$schema}`,
      rootDir,
    );
  }
  const specVersion = spec.version;

  // 4. Load mcp.json if present (optional). Failures are isolated to the MCP
  //    component type (§7.2.2 rule 2): an invalid mcp.json disables MCP but
  //    does not prevent loading the rest of the plugin.
  let mcpConfig: McpConfig | undefined;
  try {
    const mcpPath = resolvePluginPath(rootDir, './mcp.json');
    mcpConfig = parseMcp(mcpPath, options.cache);
  } catch {
    mcpConfig = undefined;
  }

  // 5. Discover skills and extensions
  const [skills, extensions] = await Promise.all([
    discoverSkills(rootDir, options.cache),
    discoverExtensions(rootDir),
  ]);

  return { rootDir, specVersion, manifest, mcpConfig, skills, extensions };
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
 */
async function discoverSkills(
  rootDir: string,
  cache: ParsedFileCache | undefined,
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
      continue;
    }

    // Security boundary: the skill directory must resolve inside the plugin
    // root. A symlink escape means the skill is skipped (§4.1 rule 3).
    let skillDir: string;
    try {
      skillDir = resolvePluginPath(rootDir, `./skills/${entry.name}`);
    } catch {
      continue;
    }

    // Only a directory containing a regular file named exactly SKILL.md is a
    // skill; anything else is skipped (non-fatal, §7.1).
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) {
      continue;
    }

    // SKILL.md itself must also resolve inside the plugin root.
    let skillFileResolved: string;
    try {
      skillFileResolved = resolvePluginPath(
        rootDir,
        `./skills/${entry.name}/SKILL.md`,
      );
    } catch {
      continue;
    }

    // A skill that does not conform is skipped, other skills still load (§7.1)
    let parsed: ParsedSkill;
    try {
      parsed = parseSkill(skillFileResolved, cache);
    } catch {
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
      // parseSkillFrontmatter already normalizes allowed-tools to an array;
      // the defensive string branch keeps this robust if that changes.
      allowedTools: normalizeAllowedToolsForSkill(
        parsed.frontmatter['allowed-tools'],
      ),
    });
  }

  return skills;
}

function normalizeAllowedToolsForSkill(
  value: string | string[] | undefined,
): string[] | undefined {
  if (typeof value === 'string') {
    return value.split(/\s+/).filter((tool) => tool.length > 0);
  }
  return value;
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
