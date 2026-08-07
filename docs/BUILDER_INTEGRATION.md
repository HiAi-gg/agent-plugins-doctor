# Builder Integration

How the Builder tool consumes Agent Plugin Doctor (Doctor) as a library after
generating plugins. This is the integration contract: the public API surface,
the exit-code contract, the migration path for Builder's existing
regex-based parsing, and the testing strategy that keeps both sides honest.

## 1. Overview

Builder generates Agent Plugins (`init`, `create`, `migrate --from claude`,
`migrate --from cursor`, …). Doctor validates them. The integration is a
plain library call, not a subprocess:

```
┌────────────┐   generated plugin   ┌────────────────────────────────┐
│  Builder   │ ───────────────────▶ │ loadPlugin → validatePlugin →  │
│ (generates)│                      │ generateReport → computeExitCode│
└────────────┘                      └────────────────────────────────┘
                                           ▲
                              exit code + report back to Builder
```

Doctor never executes plugin code. Loading is parse-only with path-security
enforcement (`resolvePluginPath` rejects traversal and symlink escapes).
Doctor is also self-hosting: its own repository is a valid plugin that passes
`check .` with zero diagnostics.

The contract has four parts:

1. **API stability** — the exports Builder imports are pinned by
   `tests/integration/api-stability.test.ts`.
2. **Fixture compatibility** — simulated Builder output in
   `tests/fixtures/builder-generated/` must validate with exit 0.
3. **Exit codes** — `0` valid, `1` errors, `2` security-critical,
   `3` tool failure.
4. **Frontmatter parsing** — Builder uses `parseSkillFrontmatter` instead of
   its own regex parsers.

## 2. Required packages and their APIs

| Package                              | Purpose                                                     | Key exports                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@agent-plugin-doctor/core`          | Canonical types, spec constants, diagnostics, path security | `resolveSpecVersion`, `resolvePluginPath`, `isWithinPath`, types (`Plugin`, `PluginManifest`, `Skill`, `McpConfig`, `Diagnostic`, `ValidationResult`) |
| `@agent-plugin-doctor/parser`        | Filesystem loading and parsing                              | `loadPlugin`, `parsePluginManifest`, `parseMcpConfig`, `parseSkillFrontmatter`, error classes (`LoadError`, `ParseError`, `SchemaValidationError`)    |
| `@agent-plugin-doctor/rules`         | Validation engine, rule registry, auto-fixes                | `validatePlugin`, `applyFixes`, `createDefaultRegistry`, `ValidationEngine`, `INTERNAL_ERROR_CODE`                                                    |
| `@agent-plugin-doctor/report`        | Report rendering                                            | `generateReport`, `getFormatter` (`human` \| `json` \| `markdown`)                                                                                    |
| `@agent-plugin-doctor/compatibility` | Client-compatibility checking                               | `checkCompatibility`, `createDefaultClientRegistry`                                                                                                   |
| `@agent-plugin-doctor/cli`           | CLI wrapper **and** the exit-code contract                  | `createProgram`, `main`, `computeExitCode`, `EXIT_CODES`                                                                                              |

The CLI package is the source of truth for exit codes: Builder imports
`computeExitCode` from it so Builder's process codes always match the CLI's.

## 3. Step-by-step migration guide for Builder

### Step 1 — Add the dependencies

```json
{
  "dependencies": {
    "@agent-plugin-doctor/core": "^0.1.0",
    "@agent-plugin-doctor/parser": "^0.1.0",
    "@agent-plugin-doctor/rules": "^0.1.0",
    "@agent-plugin-doctor/report": "^0.1.0",
    "@agent-plugin-doctor/compatibility": "^0.1.0",
    "@agent-plugin-doctor/cli": "^0.1.0"
  }
}
```

All packages are ES modules (`"type": "module"`).

### Step 2 — Replace regex frontmatter parsing

Builder's existing regex parsers (one per frontmatter variant) are replaced
by the single canonical `parseSkillFrontmatter`. See
`examples/builder-integration/parse-frontmatter.ts`.

### Step 3 — Validate after generation

Wrap every generator command's output in the load → validate → report →
exit-code pipeline. See `examples/builder-integration/validate-after-generate.ts`.

### Step 4 — Wire exit codes into process exit

Use `computeExitCode(result.diagnostics)` for the process exit code and the
CLI's `EXIT_CODES` constants for messaging.

### Step 5 — Run the contract tests

Add Doctor's contract tests (or the fixture loop) to Builder's CI so
generator changes that break the contract fail fast. See §5.

## 4. Code examples for each integration point

### Load and validate

```ts
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { validatePlugin, computeSummary } from '@agent-plugin-doctor/rules';

const { plugin, parseDiagnostics } = await loadPlugin(outputDir);
const result = await validatePlugin(plugin);
// Merge parser-level parse diagnostics (skills that failed to load, DOC-2099)
// with the rule diagnostics so malformed input is a validation error (exit 1).
const diagnostics = [...parseDiagnostics, ...result.diagnostics];
// result.diagnostics: Diagnostic[]
// result.summary: { counts, byCategory } (recompute over `diagnostics`)
// result.compatible: boolean
```

### Render a report

```ts
import { generateReport } from '@agent-plugin-doctor/report';

const human = generateReport(result, { format: 'human' }); // or 'json' | 'markdown'
const json = generateReport(result, { format: 'json' });
```

### Compute the exit code

```ts
import { computeExitCode, EXIT_CODES } from '@agent-plugin-doctor/cli';

const code = computeExitCode(result.diagnostics);
if (code === EXIT_CODES.SPEC_ERRORS) {
  /* show the report */
}
```

`computeExitCode` also accepts `{ strict: true }` to promote warnings to
failure, mirroring the CLI's `--strict`.

### Apply auto-fixes

```ts
import { applyFixes } from '@agent-plugin-doctor/rules';

const outcome = await applyFixes(plugin.rootDir, result.diagnostics, {
  dryRun: true, // preview without touching disk
});
// outcome: { fixes: AppliedFix[], applied, failed, dryRun }
// Re-load with loadPlugin after applying, then re-validate.
```

### Check client compatibility

```ts
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';

const compat = checkCompatibility(plugin);
// compat.checks: CompatibilityCheck[] (vscode, cursor, copilot, codex, kiro)
```

### Parse one SKILL.md

```ts
import { parseSkillFrontmatter } from '@agent-plugin-doctor/parser';

const parsed = parseSkillFrontmatter(content, filePath);
// parsed.frontmatter: { name, description, license?, compatibility?,
//                       metadata?, 'allowed-tools'? }
// parsed.body: string
```

## 5. Testing strategy

### Doctor side (this repository)

- `tests/integration/builder-contract.test.ts` — every
  `tests/fixtures/builder-generated/*` fixture loads and validates with zero
  error/critical diagnostics; `parseSkillFrontmatter` handles every Builder
  frontmatter shape; exit codes map to Builder's expectations
  (0/1/2/3, manifest load errors → 1, inaccessible root → 3).
- `tests/integration/builder-real.test.ts` — the **real Builder binary's**
  output (cloned from https://github.com/HiAi-gg/agent-plugin-builder and
  built at commit `7a0b9bd8`, pinned in
  `tests/fixtures/builder-generated/real-builder/`) validates with zero
  error/critical diagnostics and exit 0. See
  `docs/BUILDER_REAL_INTEGRATION.md` for the generation procedure and
  classification of every fixture.
- `tests/integration/api-stability.test.ts` — pins the public exports of
  every package Builder imports. Renames/removals fail here first.
- `tests/e2e/check.test.ts` — runs the **real binary** against every fixture,
  including the builder-generated ones, asserting the documented exit codes.
- `tests/fixtures/builder-generated/` — simulated Builder output from
  `init`, `migrate --from claude`, `migrate --from cursor`, and `create`.
  Each directory is a standalone plugin with its own README.
- `tests/fixtures/builder-generated/real-builder/` — byte-exact copies of
  output from the **real** Builder binary (see
  `docs/BUILDER_REAL_INTEGRATION.md`).

Manual verification loop:

```bash
for dir in tests/fixtures/builder-generated/*/; do
  echo "Testing $dir"
  ./packages/cli/bin/agent-plugin-doctor check "$dir"
done
```

### Builder side

- After every generator change, run `agent-plugin-doctor check` (or the
  programmatic pipeline) over a sample of generated output and assert exit 0.
- Keep one golden fixture per generator command and diff its diagnostics
  against a snapshot.
- Add Doctor's integration contract tests to Builder's CI once Doctor is
  published.

## 6. Exit code contract

| Code | Name                | Condition                                                                                                                                                                                     |
| ---- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | `SUCCESS`           | No error/critical diagnostics (warnings/info allowed, unless strict)                                                                                                                          |
| `1`  | `SPEC_ERRORS`       | At least one `error` diagnostic (or a `warning` under `--strict`) — including parser diagnostics (`DOC-1008` unloadable manifest, `DOC-2099` skill load failure, `DOC-3007` invalid mcp.json) |
| `2`  | `SECURITY_CRITICAL` | At least one `critical` diagnostic                                                                                                                                                            |
| `3`  | `TOOL_FAILURE`      | `DOC-0000` (internal rule failure), an inaccessible plugin root, or a Builder-side exception                                                                                                  |

Priority: `3 > 2 > 1 > 0`. When multiple conditions apply the highest code
wins. The CLI loads plugins via `scanPlugin`, which never throws: malformed
user input is collected as parser diagnostics and drives exit `1`. Builder
mapping **plugin-level load failures** to `3` in its own `catch` is only
relevant when it calls the strict `loadPlugin` API directly — `loadPlugin`
throws `LoadError`/`ParseError`/`SchemaValidationError` for an unloadable
plugin, it never returns a half-loaded plugin silently. Skill-level parse
failures (malformed `SKILL.md`) are _not_ thrown: they are returned as
`DOC-2099` diagnostics in `LoadResult.parseDiagnostics` and drive exit `1`
once merged into the validation results — merge them or the bad skill is
silently ignored.

## 7. Error handling patterns

```ts
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { validatePlugin, computeSummary } from '@agent-plugin-doctor/rules';
import { generateReport } from '@agent-plugin-doctor/report';
import { computeExitCode } from '@agent-plugin-doctor/cli';

try {
  const { plugin, parseDiagnostics } = await loadPlugin(dir); // throws on unloadable plugins
  const result = await validatePlugin(plugin); // never throws for invalid plugins
  const diagnostics = [...parseDiagnostics, ...result.diagnostics];
  return {
    exitCode: computeExitCode(diagnostics),
    report: generateReport(
      { ...result, diagnostics, summary: computeSummary(diagnostics) },
      { format: 'human' },
    ),
  };
} catch (error) {
  return { exitCode: 3, report: `Validation failed: ${error.message}` };
}
```

Error hierarchy (all exported from `@agent-plugin-doctor/parser`):

- `LoadError` — root missing/not a directory, `plugin.json` missing or
  escaping the root.
- `ParseError` — unreadable/invalid JSON or YAML.
- `SchemaValidationError` — manifest/MCP violates the vendored v1.0.0
  schemas (carries `errors: SchemaValidationErrorDetail[]`).

Failure isolation in the loader: `plugin.json` failures are fatal, but an
invalid `mcp.json`, skill, or extension is isolated to its component — the
rest of the plugin still loads (spec §7.2.2).

## 8. Version compatibility

- Doctor implements **Agent Plugins v1.0.0** (`$schema`
  `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`).
- `resolveSpecVersion(schemaUrl)` returns the spec for known schema URLs and
  `null` for unknown ones; `getCurrentSpecVersion()` returns v1.0.0.
- Plugins with a `$schema` Doctor does not support surface a `DOC-1008`
  parser diagnostic (exit 1) in the CLI — the strict `loadPlugin` API throws
  instead — per the spec's "must not silently ignore" requirement.
- The vendored schemas are byte-exact official copies; Doctor never fetches
  schemas at load time (spec §4.1), so Builder can use it offline.
- Doctor's own packages follow semver. The API-stability test pins the
  exports Builder depends on; any breaking change must be a major version and
  coordinated with Builder.

## 9. Troubleshooting common issues

### "Cannot find module '@agent-plugin-doctor/parser'"

In this monorepo, root-level code resolves the packages because root
`package.json` declares them as `workspace:*` devDependencies (bun symlinks
them into `node_modules`). In Builder, install the published packages instead
of using relative paths.

### Generated plugin exits 1 (spec errors)

- Skill directory name must equal the skill `name` in frontmatter
  (`DOC-2001`/`DOC-5002`): lowercase alphanumerics and hyphens, no `--`.
- `allowed-tools` must be a space-separated string (e.g.
  `Bash(git:*) Read`), never a YAML list — the parser preserves any
  non-string value and DOC-2005 diagnoses it (YAML list → warning, any other
  type → error, exit 1). DOC-2005 validates the individual tool names (a
  comma+space list gets a warning) and normalizes whitespace.
- Plugin name: 1–64 chars, lowercase alphanumerics + hyphens/periods, no `--`
  or `..` (schema `pattern`, also `DOC-1002`/`DOC-1004`).

### Generated plugin exits 2 (security-critical)

- `mcp.json` env values that look like secrets (`sk-…`, `ghp_…`, PEM blocks,
  credential-bearing URLs, ≥16 chars) are flagged (`DOC-4003`). Use
  placeholders like `<your-key>` or `your-key-here` in generated templates.
- `PLUGIN_ROOT` / `PLUGIN_DATA` are reserved env keys — never emit them
  (`DOC-3003`).

### Generated plugin exits 1 (manifest load errors)

- `plugin.json` violates the schema: wrong `$schema`, missing `name`, unknown
  fields beyond the permitted set, invalid `author` shape. These surface as
  `DOC-1008` parser diagnostics (exit 1) — the CLI loads via `scanPlugin`, so
  a bad manifest is a validation error, not a tool failure.
- The generator wrote non-canonical JSON that still parses — that is only an
  informational `DOC-7001`, not exit 1. Unparseable JSON is a `DOC-1008`
  manifest load error (exit 1).

### Builder's old regex parser and Doctor disagree

Doctor is the source of truth. `parseSkillFrontmatter` requires `name` and
`description` (throws `ParseError` otherwise) and handles quoted strings,
multiline descriptions, and YAML lists that regexes get wrong. Migrate
Builder's call sites to `parseSkillFrontmatter` — the regex parsers are
deleted, not kept in sync.

### Info diagnostics on otherwise-clean output

`DOC-5003` (unexpected root files such as `AGENTS.md`) and `DOC-7001`
(non-canonical JSON formatting) are informational and do not affect the exit
code. Emit canonical JSON (2-space indent, trailing newline) and keep only
spec files at the plugin root to produce pristine output.
