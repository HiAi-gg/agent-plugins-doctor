# Agent Plugin Doctor — SDK Reference

Complete reference for the public API of every package in the Agent Plugin
Doctor monorepo. All packages are ES modules (`"type": "module"`), written in
TypeScript with strict mode, and export fully typed APIs.

The public surface of every package is pinned by
[`tests/integration/api-stability.test.ts`](../tests/integration/api-stability.test.ts):
renames or removals fail there first. This document describes the stable
contract that programmatic consumers (notably Agent Plugin Builder) can rely
on.

## Overview

| Package                              | Purpose                                                     | Key exports                                                                                   |
| ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@agent-plugin-doctor/core`          | Canonical types, spec constants, diagnostics, path security | `resolveSpecVersion`, `resolvePluginPath`, `isWithinPath`, all domain types                   |
| `@agent-plugin-doctor/parser`        | Filesystem loading and parsing                              | `loadPlugin`, `parsePluginManifest`, `parseMcpConfig`, `parseSkillFrontmatter`, error classes |
| `@agent-plugin-doctor/rules`         | Validation engine, rule registry, auto-fixes                | `validatePlugin`, `applyFixes`, `createDefaultRegistry`, `ValidationEngine`                   |
| `@agent-plugin-doctor/compatibility` | Client-compatibility checking                               | `checkCompatibility`, `createDefaultClientRegistry`, `CompatibilityChecker`                   |
| `@agent-plugin-doctor/report`        | Report rendering                                            | `generateReport`, `getFormatter` (`human` \| `json` \| `markdown`)                            |
| `@agent-plugin-doctor/cli`           | CLI wrapper and the exit-code contract                      | `createProgram`, `main`, `computeExitCode`, `EXIT_CODES`                                      |

The typical pipeline:

```ts
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { validatePlugin } from '@agent-plugin-doctor/rules';
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';
import { generateReport } from '@agent-plugin-doctor/report';
import { computeExitCode } from '@agent-plugin-doctor/cli';

const plugin = await loadPlugin('./my-plugin');
const result = await validatePlugin(plugin);
const report = generateReport(result, { format: 'human' });
const exitCode = computeExitCode(result.diagnostics);
```

---

## 1. `@agent-plugin-doctor/core`

Canonical types, specification constants, the diagnostic system, and path
security utilities. Every other package builds on this one; it has no
dependencies.

### 1.1 Spec version registry

#### `resolveSpecVersion(schemaUrl: string): SpecVersion | null`

Maps a `$schema` URL to its spec version.

- **Parameters**
  - `schemaUrl` — a `$schema` value, e.g. `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.
- **Returns** the matching `SpecVersion`, or `null` for unknown URLs.
- **Description** Accepts both the plugin and MCP schema URLs for a known
  version. Used by the loader to decide whether a plugin is loadable.
- **Errors** None (returns `null` instead).

```ts
import { resolveSpecVersion } from '@agent-plugin-doctor/core';

const spec = resolveSpecVersion(
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
);
console.log(spec?.version); // "1.0.0"
console.log(resolveSpecVersion('https://example.com/unknown')); // null
```

#### `getSpecVersion(version: string): SpecVersion | null`

Looks up a spec version by its version string (e.g. `"1.0.0"`).

#### `getCurrentSpecVersion(): SpecVersion`

Returns the spec version Doctor is built around (currently v1.0.0).

#### `SpecVersion`

```ts
interface SpecVersion {
  version: string;
  pluginSchemaUrl: string;
  mcpSchemaUrl: string;
  namePattern: RegExp;
  nameMaxLength: number;
  skillNamePattern: RegExp;
  skillNameMaxLength: number;
  descriptionMaxLength: number;
  compatibilityMaxLength: number;
  supportedComponentTypes: readonly string[];
}
```

The `v1` namespace re-exports the v1.0.0 constants directly (see below), and
`./spec/current.js` aliases the current version.

### 1.2 Spec constants (v1.0.0)

| Constant                    | Value                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `SPEC_VERSION`              | `'1.0.0'`                                                      |
| `PLUGIN_SCHEMA_URL`         | `'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'` |
| `MCP_SCHEMA_URL`            | `'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'`    |
| `NAME_PATTERN`              | `/^(?!.*(?:--                                                  | \.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/` |
| `NAME_MAX_LENGTH`           | `64`                                                           |
| `SKILL_NAME_PATTERN`        | `/^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`                  |
| `SKILL_NAME_MAX_LENGTH`     | `64`                                                           |
| `DESCRIPTION_MAX_LENGTH`    | `1024`                                                         |
| `COMPATIBILITY_MAX_LENGTH`  | `500`                                                          |
| `SUPPORTED_COMPONENT_TYPES` | `['skills', 'mcp'] as const`                                   |
| `ComponentType`             | `'skills' \| 'mcp'`                                            |

```ts
import {
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  PLUGIN_SCHEMA_URL,
} from '@agent-plugin-doctor/core';
```

### 1.3 Domain types

All canonical types used across the ecosystem. See
[§6 Type definitions](#6-type-definitions) for the full interfaces.

| Type                                                 | Purpose                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Plugin`                                             | A loaded plugin: root dir, spec version, manifest, MCP config, skills, extensions |
| `PluginManifest`                                     | The parsed `plugin.json`                                                          |
| `Author`                                             | The `author` object (`name`, `email`, `url`)                                      |
| `Skill`                                              | A loaded skill: name, description, body, directory, frontmatter                   |
| `SkillFrontmatter`                                   | Parsed SKILL.md frontmatter                                                       |
| `McpConfig`                                          | The parsed `mcp.json` (`$schema` + `mcpServers`)                                  |
| `McpServer`                                          | `StdioServer \| StreamableHttpServer \| SseServer`                                |
| `StdioServer` / `StreamableHttpServer` / `SseServer` | The three MCP server shapes                                                       |
| `Extension`                                          | A reverse-domain extension directory with its data                                |

### 1.4 Diagnostic system

#### `Severity`

```ts
type Severity = 'info' | 'warning' | 'error' | 'critical';
```

#### `RuleCategory`

```ts
type RuleCategory =
  | 'spec'
  | 'skills'
  | 'mcp'
  | 'security'
  | 'structure'
  | 'compatibility'
  | 'format';
```

#### `Diagnostic`

```ts
interface Diagnostic {
  code: string; // stable ID, e.g. "DOC-1001"
  severity: Severity;
  message: string;
  ruleId: string;
  category: RuleCategory;
  file?: string; // plugin-relative path
  range?: DiagnosticRange;
  fix?: Fix;
  related?: Diagnostic[];
}
```

#### `DiagnosticRange`

```ts
interface DiagnosticRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}
```

#### `Fix` and `FixKind`

```ts
type FixKind = 'replace' | 'insert' | 'delete' | 'rename';

interface Fix {
  kind: FixKind;
  file: string; // plugin-relative path
  description: string;
  oldText?: string; // used by replace/insert/delete
  newText?: string; // used by replace/insert
  oldPath?: string; // used by rename
  newPath?: string; // used by rename
}
```

#### `ValidationResult`

```ts
interface ValidationResult {
  plugin: Plugin;
  specVersion: string;
  diagnostics: Diagnostic[];
  summary: ValidationSummary;
  compatible: boolean;
  compatibility: CompatibilityResult[];
  elapsedMs: number;
}
```

#### `ValidationSummary`

```ts
interface ValidationSummary {
  counts: Record<Severity, number>;
  byCategory: Record<RuleCategory, number>;
}
```

#### `CompatibilityResult`

```ts
interface CompatibilityResult {
  clientId: string;
  clientName: string;
  compatible: boolean;
  issues: string[]; // human-readable issue messages
  evidence: 'docs' | 'runtime' | 'expected' | 'none';
}
```

#### `ValidationOptions`

```ts
interface ValidationOptions {
  fix?: boolean; // apply fixes during validation
  strict?: boolean; // promote warnings to failure
  rules?: string[]; // rule IDs to run (empty = all enabled)
  excludeRules?: string[]; // rule IDs to skip
}
```

### 1.5 Path utilities (security boundary)

All plugin-relative path access goes through these functions. They are the
security boundary of the whole tool and must never be weakened.

#### `resolvePluginPath(pluginRoot: string, relativePath: string): string`

Resolves a plugin-relative path (must start with `./`) against the plugin
root and enforces containment.

- **Throws** `Error` when the path is not plugin-relative, escapes the root
  lexically, or escapes via a symlink (resolved against the real root).
- Missing files (ENOENT) are allowed: the resolved path is returned so fix
  operations can target not-yet-existing files.

```ts
import { resolvePluginPath } from '@agent-plugin-doctor/core';

const p = resolvePluginPath('/tmp/my-plugin', './skills/summarize/SKILL.md');
// p -> the real, contained absolute path

resolvePluginPath('/tmp/my-plugin', '../etc/passwd');
// throws: Path escapes plugin root
```

#### `isWithinPath(child: string, parent: string): boolean`

True when `child` is `parent` or a descendant of it. Normalized paths, so
redundant separators and `..` segments are handled. Cross-platform: the
prefix check uses the platform separator, so Windows backslash paths
(e.g. `C:\plugin\skill.md` within `C:\plugin`) are contained correctly.

#### `normalizePath(p: string): string`

Normalize a path for consistent comparison (wraps `node:path.normalize`).

#### `isAbsolutePath(p: string): boolean`

True when the path is absolute (wraps `node:path.isAbsolute`).

#### `isValidPluginPath(pluginRoot: string, relativePath: string): boolean`

`true` when `resolvePluginPath` succeeds, `false` otherwise. Never throws.

---

## 2. `@agent-plugin-doctor/parser`

Filesystem loading and parsing. This is the single canonical implementation —
it replaces Builder's seven regex-based frontmatter parsers. Loader behavior
follows the spec's failure-isolation rules: `plugin.json` failures are fatal,
while `mcp.json`, skill, and extension failures are isolated to their
component type.

### 2.1 `loadPlugin(rootDir: string, options?: LoadOptions): Promise<Plugin>`

Loads a complete plugin from a directory.

- **Parameters**
  - `rootDir` — absolute path to the plugin root.
  - `options` — optional; see `LoadOptions` below.
- **Returns** a fully loaded `Plugin`.
- **Description** Discovers and parses `plugin.json` (required), `mcp.json`
  (optional), `SKILL.md` files in immediate children of `skills/` (fixed
  depth), and reverse-domain extension directories. Enforces path security
  through `resolvePluginPath`; plugin code is never executed. When
  `options.cache` is provided, unchanged files are served from the parsed-file
  cache instead of being re-parsed.
- **Errors**
  - `LoadError` — root missing or not a directory, `plugin.json` missing or
    escaping the root, or an unsupported `$schema`.
  - `ParseError` — unreadable or invalid JSON/YAML.
  - `SchemaValidationError` — manifest violates the vendored schema.

```ts
import { loadPlugin } from '@agent-plugin-doctor/parser';

const plugin = await loadPlugin('./my-plugin');
console.log(plugin.manifest.name, plugin.skills.length);
```

#### `LoadOptions`

```ts
interface LoadOptions {
  cache?: ParsedFileCache; // shared parsed-file cache across loadPlugin calls
}
```

When `cache` is provided, `plugin.json`, `mcp.json`, and each SKILL.md are
re-parsed only when their mtime or size changed. A single cache instance can
be shared across plugins and calls (watch mode, incremental validation).

### 2.2 `parsePluginManifest(filePath: string): PluginManifest`

Parses and validates a single `plugin.json` file.

- **Throws** `ParseError` (unreadable/invalid JSON) or
  `SchemaValidationError` (schema violation).
- Unknown top-level fields and a non-object `extensions` field are
  non-fatal per spec §5.2/§8.1: they are reported in the schema errors and
  stripped from the returned manifest instead of rejecting it.

### 2.3 `parseMcpConfig(filePath: string): McpConfig | undefined`

Parses and validates a single `mcp.json` file.

- **Returns** `undefined` when the file is absent (mcp.json is optional).
- **Description** Top-level violations (bad/missing `$schema`, missing or
  non-object `mcpServers`, unknown top-level fields, non-object server
  entries) throw `SchemaValidationError`; invalid _server objects_ are
  skipped individually so valid servers survive (§7.2.2).
- **Throws** `ParseError`, `SchemaValidationError`.

### 2.4 `parseSkillFrontmatter(content: string, filePath: string): ParsedSkill`

Parses SKILL.md content into frontmatter and body, using gray-matter.

- **Parameters**
  - `content` — the full text of the SKILL.md file.
  - `filePath` — used in error messages.
- **Returns**
  ```ts
  interface ParsedSkill {
    frontmatter: SkillFrontmatter; // name, description, license?, compatibility?,
    // metadata?, 'allowed-tools'?
    body: string;
  }
  ```
- **Description** Handles quoted strings, multiline descriptions, BOM
  stripping, YAML lists, and normalizes `allowed-tools` to a string array
  (a space-separated string is split; a YAML list is accepted as-is).
- **Throws** `ParseError` when the file does not start with `---`, the YAML
  is malformed, `name`/`description` are missing, or `allowed-tools` has an
  invalid type.

```ts
import { parseSkillFrontmatter } from '@agent-plugin-doctor/parser';

const parsed = parseSkillFrontmatter(md, 'skills/summarize/SKILL.md');
console.log(parsed.frontmatter.name, parsed.body);
```

### 2.5 `ParsedFileCache`

A simple in-memory cache for parsed file contents, keyed by absolute file
path and invalidated by the file's mtime and size. Used to skip re-parsing
unchanged files across repeated `loadPlugin` calls.

- `get(filePath: string, load: () => T): T` — returns the cached value when
  the file is unchanged, otherwise calls `load`, stores its result, and
  returns it. Unreadable files are never cached.
- `invalidate(filePath: string): void` — drop one entry.
- `clear(): void` — drop every entry.
- `size: number` — number of cached entries.

```ts
import { ParsedFileCache, loadPlugin } from '@agent-plugin-doctor/parser';

const cache = new ParsedFileCache();
await loadPlugin('./my-plugin', { cache }); // parses everything once
await loadPlugin('./my-plugin', { cache }); // unchanged files served from cache
```

### 2.6 `walkPluginFiles(rootDir: string, options?: WalkOptions): WalkResult`

Bounded filesystem traversal of a plugin tree.

- **Parameters**
  - `rootDir` — the directory to walk.
  - `options` — `maxDepth` (default `TRAVERSAL_MAX_DEPTH` = 10), `maxFiles`
    (default `TRAVERSAL_MAX_FILES` = 1000), and extra `skipDirs`.
- **Returns**
  ```ts
  interface WalkResult {
    files: string[]; // plugin-relative paths, '/' separators, no './' prefix
    truncated: boolean; // true when a depth or file-count cap was hit
  }
  ```
- **Description** Skips hidden entries, `.git`, `node_modules` (plus any
  extra `skipDirs`), never follows symlinks, and caps directory depth and
  file count so a hostile plugin cannot force an unbounded scan.

Constants: `TRAVERSAL_MAX_DEPTH` (10), `TRAVERSAL_MAX_FILES` (1000),
`TRAVERSAL_SKIP_DIRS` (`.git`, `node_modules`).

```ts
import { walkPluginFiles } from '@agent-plugin-doctor/parser';

const { files, truncated } = walkPluginFiles(plugin.rootDir);
if (truncated) console.warn('plugin tree exceeded traversal bounds');
```

### 2.7 Error classes

All three extend `Error` and are exported:

| Class                   | Fields                                                  | Meaning                                                             |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `LoadError`             | `path: string`, `cause?`                                | Root missing, `plugin.json` missing/escaping, unsupported `$schema` |
| `ParseError`            | `file: string`, `cause?`                                | Unreadable/invalid JSON or YAML                                     |
| `SchemaValidationError` | `file: string`, `errors: SchemaValidationErrorDetail[]` | Manifest/MCP violates the vendored schemas                          |

```ts
interface SchemaValidationErrorDetail {
  path: string; // JSON instance path, '/' for the root
  message: string; // actionable message ("missing required property 'name'")
  keyword: string; // AJV keyword ("required", "additionalProperties", ...)
}
```

```ts
import { SchemaValidationError } from '@agent-plugin-doctor/parser';

try {
  await loadPlugin(dir);
} catch (error) {
  if (error instanceof SchemaValidationError) {
    for (const detail of error.errors) console.log(detail.path, detail.message);
  }
}
```

---

## 3. `@agent-plugin-doctor/rules`

The validation engine, rule registry, and auto-fix engine. 29 rules across 7
categories run by default. See [DIAGNOSTICS.md](DIAGNOSTICS.md) for the rule
catalog and [RULES.md](RULES.md) for implementation details.

### 3.1 `validatePlugin(plugin: Plugin, options?: ValidationOptions): Promise<ValidationResult>`

Validates a loaded plugin with the default registry.

- **Description** Runs every applicable rule (honoring `enabledByDefault`,
  `options.rules`, `options.excludeRules`, and spec-version support), attaches
  fixes produced by rules, and computes the summary and `compatible` flag.
  When `options.fix` is true, available fixes are applied to disk during
  validation. Diagnostics are sorted deterministically (severity, code, file,
  message).
- **Does not throw** for invalid plugins — problems are returned as
  diagnostics. A rule that throws internally becomes a `DOC-0000` diagnostic.
- **Errors** None (invalid plugins are reported, not thrown).

```ts
import { validatePlugin } from '@agent-plugin-doctor/rules';

const result = await validatePlugin(plugin, { strict: true });
console.log(result.summary.counts); // { info, warning, error, critical }
```

### 3.2 `validateIncremental(plugin: Plugin, previous: ValidationResult, changedFiles: string[], options?: ValidationOptions): Promise<ValidationResult>`

Incrementally re-validates a plugin, reusing diagnostics from `previous` for
rules unaffected by the changed files.

- **Parameters**
  - `plugin` — a freshly loaded `Plugin` (already reflects the changes).
  - `previous` — a `ValidationResult` from an earlier validation of the same
    plugin root and spec version.
  - `changedFiles` — plugin-relative paths that changed since `previous` was
    computed (may include a leading `./`).
- **Description** Only the affected rules re-run: raw-file rules (those
  declaring `files`) when one of their files changed, structure rules on any
  change, and model-based rules when any part of the loaded plugin model
  changed (`plugin.json`, `mcp.json`, a discovered SKILL.md, or an
  `extension.json`). Unaffected rules keep their previous diagnostics. Falls
  back to a full validation when the plugin root or spec version changed, or
  when rule filtering (`rules`/`excludeRules`) is requested. Passing every
  file as changed is equivalent to a full validation.
- **Errors** None (invalid plugins are reported, not thrown).

```ts
import { validateIncremental } from '@agent-plugin-doctor/rules';

const result = await validateIncremental(plugin, previousResult, [
  'skills/summarize/SKILL.md',
]);
```

### 3.3 `ValidationEngine`

`new ValidationEngine(registry: RuleRegistry)` — runs rules from a custom
registry.

- `validate(plugin, options?)` — same as `validatePlugin` with the engine's registry.
- `validateIncremental(plugin, previous, changedFiles, options?)` — same as
  `validateIncremental` with the engine's registry.
- `runRules(plugin, rules)` — runs a specific rule list over a plugin
  (normalizing `ruleId`/`category` and attaching fixes); exposed for engines
  that compose rule subsets.
- `computeSummary(diagnostics)` — public helper returning `ValidationSummary`.
- `computeExitCode(diagnostics, options?)` — public helper mirroring the CLI
  exit-code contract (3 > 2 > 1 > 0).

### 3.4 `RuleRegistry`

Stores rules by id.

| Method              | Signature                            | Behavior                                   |
| ------------------- | ------------------------------------ | ------------------------------------------ |
| `register`          | `(rule: Rule) => void`               | Throws on duplicate ids                    |
| `get`               | `(id: string) => Rule \| undefined`  | Lookup by id                               |
| `getAll`            | `() => Rule[]`                       | All rules in registration order            |
| `getByCategory`     | `(category: RuleCategory) => Rule[]` | Filter by category                         |
| `getForSpecVersion` | `(version: string) => Rule[]`        | Filter by spec support (`'*'` matches all) |
| `clear`             | `() => void`                         | Remove all rules                           |

### 3.5 `createDefaultRegistry(): RuleRegistry`

Returns a registry pre-populated with all 29 shipped rules across the 7
categories, in manifest → skills → mcp → security → structure → compatibility
→ format order.

```ts
import { createDefaultRegistry } from '@agent-plugin-doctor/rules';

const registry = createDefaultRegistry();
console.log(registry.getAll().length); // 29
```

### 3.6 The `Rule` contract

```ts
interface Rule {
  id: string; // e.g. "manifest-name-pattern"
  code: string; // stable diagnostic code, e.g. "DOC-1002"
  name: string; // human-readable name
  category: RuleCategory;
  severity: Severity;
  supportedSpecVersions: string[]; // e.g. ["1.0.0"]; "*" = all versions
  description: string;
  enabledByDefault: boolean;
  files?: string[]; // plugin-relative raw files read in check(); used by
  // incremental validation to decide when the rule must re-run
  check(ctx: RuleContext): Diagnostic[];
  fix?(ctx: RuleContext, diagnostic: Diagnostic): Fix | null;
}

interface RuleContext {
  plugin: Plugin;
  rootDir: string;
}
```

Rules are plain objects — register custom rules by implementing this shape.
Raw-file rules (those that read parser-stripped data from disk, e.g.
`manifest-unknown-fields`) declare `files` so incremental validation re-runs
them precisely.

### 3.7 `applyFixes(rootDir: string, diagnostics: Diagnostic[], options?: ApplyFixesOptions): Promise<FixResult>`

Applies every fix attached to the given diagnostics.

- **Parameters**
  - `rootDir` — plugin root (fix paths are enforced to stay inside it).
  - `diagnostics` — diagnostics that may carry `fix` objects.
  - `options.dryRun` — compute results without touching the filesystem.
- **Returns**
  ```ts
  interface FixResult {
    applied: number;
    failed: number;
    fixes: AppliedFix[];
  }
  interface AppliedFix {
    diagnostic: Diagnostic;
    fix: Fix;
    success: boolean;
    error?: string;
  }
  ```
- **Description** Text-based and idempotent: each fix re-reads the target
  file, a fix whose target state is already present is a no-op success, and
  running `applyFixes` twice never changes a file twice. Format fixes are
  re-derived against current content when the file changed since check time.
  A fix that cannot apply is reported as failed with an `error` message —
  it never throws.
- **Errors** None (failures are reported per-fix).

```ts
import { applyFixes } from '@agent-plugin-doctor/rules';

const outcome = await applyFixes(plugin.rootDir, result.diagnostics, {
  dryRun: true, // preview without touching disk
});
console.log(outcome.applied, outcome.failed);
```

### 3.8 `INTERNAL_ERROR_CODE`

`'DOC-0000'` — the diagnostic code assigned when a rule throws during
validation. Produces exit code 3.

---

## 4. `@agent-plugin-doctor/compatibility`

Client-compatibility checking against verified Agent Plugins client profiles.
The default registry is seeded from `src/data/clients.json` (5 verified
clients: `vscode`, `cursor`, `copilot`, `codex`, `kiro`).

### 4.1 `checkCompatibility(plugin: Plugin, registry?: ClientProfileRegistry): CompatibilityResult`

Checks a plugin against every client in the registry.

- **Returns** `CompatibilityResult` with one `CompatibilityCheck` per client.
- **Description** Conservative: a missing client capability produces an
  issue instead of assuming compatibility. Errors are blocking (unsupported
  spec version, skills, or MCP transports); warnings cover optional features
  such as extensions that clients may safely ignore. A client is
  `compatible` when it has no error-severity issues.

```ts
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';

const compat = checkCompatibility(plugin);
console.log(compat.summary); // { total: 5, compatible: 4, incompatible: 1 }
```

### 4.2 `CompatibilityChecker`

`new CompatibilityChecker(registry: ClientProfileRegistry)` with
`check(plugin): CompatibilityResult`.

### 4.3 `ClientProfileRegistry`

Same shape as `RuleRegistry`: `register(profile)` (throws on duplicate ids),
`get(id)`, `getAll()`, `clear()`.

### 4.4 `createDefaultClientRegistry(): ClientProfileRegistry`

Registry pre-populated with the 5 verified client profiles.

### 4.5 Types

```ts
interface ClientProfile {
  id: string; // e.g. "vscode"
  name: string; // e.g. "VS Code"
  supportedSpecVersions: string[];
  capabilities: ClientCapabilities;
  evidence: EvidenceLevel;
  source: string; // documentation URL
}

interface ClientCapabilities {
  skills: boolean;
  mcpStdio: boolean;
  mcpStreamableHttp: boolean;
  mcpLegacySse: boolean;
  extensions: boolean;
}

type EvidenceLevel = 'docs' | 'runtime' | 'expected' | 'none';

interface CompatibilityCheck {
  clientId: string;
  clientName: string;
  compatible: boolean;
  issues: CompatibilityIssue[];
  evidence: EvidenceLevel;
}

interface CompatibilityIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  component?: 'skills' | 'mcp' | 'extensions';
}

interface CompatibilityResult {
  plugin: Plugin;
  checks: CompatibilityCheck[];
  summary: { total: number; compatible: number; incompatible: number };
}
```

### 4.6 Deprecations

```ts
interface Deprecation {
  field: string;
  specVersion: string;
  message: string;
  migration?: string;
}

const DEPRECATIONS: Deprecation[]; // empty for v1.0.0

function getDeprecationsForVersion(version: string): Deprecation[];
```

v1.0.0 deprecates no fields, so `DEPRECATIONS` is empty and
`getDeprecationsForVersion` always returns `[]`. Future spec versions will
populate this list.

---

## 5. `@agent-plugin-doctor/report`

Report rendering from a `ValidationResult`. Three formats: `human`
(terminal), `json` (CI), and `markdown` (documentation).

### 5.1 `generateReport(result: ValidationResult, options: ReportOptions): string`

Renders a validation result.

- **Throws** `Error` for an unknown format.

```ts
import { generateReport } from '@agent-plugin-doctor/report';

const human = generateReport(result, { format: 'human' });
const json = generateReport(result, { format: 'json' });
const md = generateReport(result, { format: 'markdown', verbose: true });
```

### 5.2 `getFormatter(format: ReportFormat, options?: ReportOptions): ReportFormatter`

Returns the formatter instance for a format. `ReportOptions`:

```ts
interface ReportOptions {
  format: ReportFormat; // 'human' | 'json' | 'markdown'
  verbose?: boolean; // adds "Rule: <id> (<category>)" lines (human)
  noColor?: boolean; // disables ANSI colors (human)
}
```

Only the human formatter accepts `ReportOptions` beyond `format`; `json` and
`markdown` ignore `verbose`/`noColor`.

### 5.3 Formatter classes

| Class                     | Format   | Notes                                                                                                                                                                       |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HumanReportFormatter`    | human    | Groups diagnostics by file (worst severity first, then alpha); summary section; compatibility section; fixes-available count. Honors `FORCE_COLOR`/`NO_COLOR`/`--no-color`. |
| `JsonReportFormatter`     | json     | Single JSON document with stable key ordering; `file`/`range`/`fix` null-padded; `counts` fixed order (error/warning/info/critical); zero categories omitted.               |
| `MarkdownReportFormatter` | markdown | GitHub-flavored; summary table; diagnostics grouped by severity; severity groups over 5 entries wrapped in `<details>`; compatibility matrix.                               |

### 5.4 Internal helpers

The report package also contains shared helpers in `src/util.ts`
(`SEVERITY_ORDER`, `SEVERITY_RANK`, `sortDiagnostics`, `worstSeverityRank`,
`normalizeFilePath`, `wrapText`, `pluralize`, `capitalize`,
`titleFromRuleId`). These are **internal** — they are not re-exported from
the package index and are not part of the stable public API. They are
described in [RULES.md](RULES.md) only insofar as they affect report output;
do not import them from the package entry point.

---

## 6. Type definitions

The canonical interfaces live in `@agent-plugin-doctor/core`:

```ts
export interface Plugin {
  rootDir: string;
  specVersion: string;
  manifest: PluginManifest;
  mcpConfig?: McpConfig;
  skills: Skill[];
  extensions: Extension[];
}

export interface PluginManifest {
  $schema: string;
  name: string;
  version?: string;
  description?: string;
  author?: Author;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  extensions?: Record<string, unknown>;
}

export interface Author {
  name?: string;
  email?: string;
  url?: string;
}

export interface Skill {
  name: string;
  description: string;
  body: string;
  directory: string; // plugin-relative, e.g. "skills/summarize"
  frontmatter: SkillFrontmatter;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  'allowed-tools'?: string | string[]; // normalized to string[] by the parser
}

export interface McpConfig {
  $schema: string;
  mcpServers: Record<string, McpServer>;
}

export type McpServer = StdioServer | StreamableHttpServer | SseServer;

export interface StdioServer {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface StreamableHttpServer {
  type: 'streamable-http';
  url: string;
  headers?: Record<string, string>;
}

export interface SseServer {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface Extension {
  namespace: string; // reverse-domain, e.g. "com.example.client"
  data: unknown;
  path: string; // plugin-relative
}
```

---

## 7. `@agent-plugin-doctor/cli`

The command-line tool and the exit-code contract. Programmatic consumers
import the exit-code contract from here so their process codes always match
the CLI's.

### 7.1 `computeExitCode(diagnostics: Diagnostic[], options?: ExitCodeOptions): ExitCode`

Derives the process exit code from diagnostics.

- **Priority** `3 > 2 > 1 > 0`.
- `3` — any `DOC-0000` (internal rule failure).
- `2` — any `critical` diagnostic.
- `1` — any `error` diagnostic (or a `warning` under `{ strict: true }`).
- `0` — otherwise.

```ts
import { computeExitCode, EXIT_CODES } from '@agent-plugin-doctor/cli';

const code = computeExitCode(result.diagnostics);
if (code === EXIT_CODES.SPEC_ERRORS) {
  /* show the report */
}
```

### 7.2 `EXIT_CODES`

```ts
const EXIT_CODES = {
  SUCCESS: 0,
  SPEC_ERRORS: 1,
  SECURITY_CRITICAL: 2,
  TOOL_FAILURE: 3,
} as const;

type ExitCode = 0 | 1 | 2 | 3;
```

### 7.3 `ExitCodeOptions`

```ts
interface ExitCodeOptions {
  strict?: boolean; // treat warnings as errors (--strict)
}
```

### 7.4 `createProgram(): Command`

Builds a fresh commander program with the four subcommands (`check`, `fix`,
`report`, `compatibility`). Tests create a new instance per run so option
state never leaks.

### 7.5 `program`

The singleton program instance used by the binary.

### 7.6 `main(): Promise<void>`

Parses `process.argv` and runs the CLI, setting `process.exitCode` after the
async handlers complete. Invoked by `bin/agent-plugin-doctor`.

---

## 8. Error handling

Doctor distinguishes two kinds of failure:

1. **Plugin problems** — returned as `Diagnostic[]`, never thrown.
   `validatePlugin`, `checkCompatibility`, and `applyFixes` do not throw for
   invalid plugins.
2. **Tool failures** — thrown by the loader/parser. Map to exit code `3`:

| Error                   | When                                                                          | Fields             |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------ |
| `LoadError`             | root missing/not a dir, `plugin.json` missing/escaping, unsupported `$schema` | `path`, `cause?`   |
| `ParseError`            | unreadable/invalid JSON or YAML                                               | `file`, `cause?`   |
| `SchemaValidationError` | manifest/MCP violates the vendored schemas                                    | `file`, `errors[]` |

Recommended pattern (mirrors the CLI and Builder):

```ts
try {
  const plugin = await loadPlugin(dir);
  const result = await validatePlugin(plugin);
  return {
    exitCode: computeExitCode(result.diagnostics),
    report: generateReport(result, { format: 'human' }),
  };
} catch (error) {
  // LoadError | ParseError | SchemaValidationError -> tool failure
  return {
    exitCode: 3,
    report: `Validation failed: ${(error as Error).message}`,
  };
}
```

The CLI exports `isPluginLoadError(error): boolean` from
`packages/cli/src/utils/run.ts` to classify thrown errors (importable for
consumers that want the same classification).

## 9. Examples

### Full pipeline with fixes

```ts
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { validatePlugin, applyFixes } from '@agent-plugin-doctor/rules';
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';
import { generateReport } from '@agent-plugin-doctor/report';
import { computeExitCode } from '@agent-plugin-doctor/cli';

// 1. Load
const plugin = await loadPlugin('./my-plugin');

// 2. Validate
const result = await validatePlugin(plugin);

// 3. Apply safe fixes, then re-validate
const fixOutcome = await applyFixes(plugin.rootDir, result.diagnostics);
const fixed = await loadPlugin('./my-plugin');
const after = await validatePlugin(fixed);

// 4. Compatibility
const compat = checkCompatibility(fixed);

// 5. Report
console.log(generateReport(after, { format: 'markdown' }));

// 6. Exit code
process.exitCode = computeExitCode(after.diagnostics);
```

### Custom rule

```ts
import {
  createDefaultRegistry,
  validatePlugin,
  type Rule,
} from '@agent-plugin-doctor/rules';
import { loadPlugin } from '@agent-plugin-doctor/parser';

const customRule: Rule = {
  id: 'example-no-todo',
  code: 'DOC-9001',
  name: 'No TODO markers',
  category: 'format',
  severity: 'info',
  supportedSpecVersions: ['*'],
  description: 'Bodies should not contain TODO markers.',
  enabledByDefault: true,
  check(ctx) {
    return ctx.plugin.skills
      .filter((skill) => skill.body.includes('TODO'))
      .map((skill) => ({
        code: 'DOC-9001',
        severity: 'info' as const,
        message: `Skill "${skill.name}" contains TODO markers`,
        ruleId: 'example-no-todo',
        category: 'format' as const,
        file: `${skill.directory}/SKILL.md`,
      }));
  },
};

const registry = createDefaultRegistry();
registry.register(customRule);

const plugin = await loadPlugin('./my-plugin');
const result = await validatePlugin(plugin); // default registry; pass your own
// To use the custom registry: new ValidationEngine(registry).validate(plugin)
```

### Custom client profile

```ts
import {
  ClientProfileRegistry,
  CompatibilityChecker,
} from '@agent-plugin-doctor/compatibility';

const registry = new ClientProfileRegistry();
registry.register({
  id: 'my-client',
  name: 'My Client',
  supportedSpecVersions: ['1.0.0'],
  capabilities: {
    skills: true,
    mcpStdio: true,
    mcpStreamableHttp: true,
    mcpLegacySse: false,
    extensions: false,
  },
  evidence: 'docs',
  source: 'https://example.com/docs',
});

const compat = new CompatibilityChecker(registry).check(plugin);
```

### Machine-readable report for CI

```ts
import { generateReport } from '@agent-plugin-doctor/report';

const json = generateReport(result, { format: 'json' });
// Stable key order; counts always { error, warning, info, critical };
// zero categories omitted from byCategory.
```

---

See [DIAGNOSTICS.md](DIAGNOSTICS.md) for the diagnostic code catalog,
[RULES.md](RULES.md) for rule implementation details,
[SPEC_SUPPORT.md](SPEC_SUPPORT.md) for the validation coverage matrix, and
[BUILDER_INTEGRATION.md](BUILDER_INTEGRATION.md) for the Builder integration
contract.
