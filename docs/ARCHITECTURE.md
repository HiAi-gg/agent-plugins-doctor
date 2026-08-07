# Agent Plugin Doctor — Architecture

## Overview

Agent Plugin Doctor is a Bun workspaces monorepo with 6 packages designed for
clean separation of concerns, testability, and extensibility.

The tool validates plugins against the official
[Agent Plugins specification](https://agent-plugins.org/) (v1.0.0), checks
compatibility against verified clients, and provides safe automatic fixes. It
is built to be consumed both as a CLI and as a library (notably by
[Agent Plugin Builder](https://github.com/HiAi-gg/agent-plugin-builder), which
generates plugins and calls Doctor to validate them).

Each package is an ES module (`"type": "module"`) written in strict-mode
TypeScript with no runtime dependencies outside the monorepo (except the
parser's `ajv` and `gray-matter`). Package boundaries follow the dependency
direction `core ← parser ← rules ← cli`, with `compatibility` and `report`
sitting beside `rules`:

## Package Architecture

### Dependency Graph

```
cli → rules → parser → core
cli → report → core
cli → compatibility → core
rules → compatibility → core
```

- `core` has **no dependencies** on other Doctor packages.
- `parser` depends only on `core`.
- `rules` depends on `core`, `parser` (for the `Plugin` shape and error
  classes), and `compatibility`.
- `compatibility` and `report` depend only on `core`.
- `cli` depends on all five other packages.

### Package Responsibilities

**@agent-plugin-doctor/core**

- Canonical domain types (`Plugin`, `PluginManifest`, `Skill`, `McpServer`,
  `McpConfig`, `Extension`, `Diagnostic`, `ValidationResult`, …)
- Spec version constants and the version registry
  (`resolveSpecVersion`, `getSpecVersion`, `getCurrentSpecVersion`)
- Path security utilities (`resolvePluginPath`, `isWithinPath`)
- Diagnostic system types (`Severity`, `RuleCategory`, `Fix`, `FixKind`)
- No dependencies on other Doctor packages

**@agent-plugin-doctor/parser**

- Filesystem loading and parsing (`loadPlugin`, `parsePluginManifest`,
  `parseMcpConfig`, `parseSkillFrontmatter`)
- Vendored official JSON Schemas in `src/schemas/` — byte-exact copies, never
  fetched at runtime (spec §4.1)
- plugin.json, mcp.json, SKILL.md parsing with per-component failure
  isolation (§7.1, §7.2.2)
- Plugin discovery and loading (skills at fixed depth, reverse-domain
  extensions)
- Performance: `ParsedFileCache` (mtime-keyed parsed-file cache) and
  `walkPluginFiles` (bounded traversal — see Performance Considerations)
- Dependencies: core

**@agent-plugin-doctor/rules**

- Modular validation engine (`ValidationEngine`, `validatePlugin`)
- 29 rules across 7 categories (spec, skills, mcp, security, structure,
  compatibility, format)
- Rule registry and execution (`RuleRegistry`, `createDefaultRegistry`)
- Auto-fix engine (`applyFixes`) — text-based, idempotent, conflict-free
- Incremental validation (`validateIncremental`)
- Dependencies: core, parser, compatibility

**@agent-plugin-doctor/compatibility**

- Client profile registry (`ClientProfileRegistry`,
  `createDefaultClientRegistry`)
- Compatibility checking (`CompatibilityChecker`, `checkCompatibility`)
- 5 verified clients seeded from `src/data/clients.json` (VS Code, Cursor,
  GitHub Copilot, ChatGPT & Codex, Kiro)
- Dependencies: core

**@agent-plugin-doctor/report**

- Report generation (`generateReport`, `getFormatter`)
- Formatter registry pattern: human, JSON, Markdown
- Dependencies: core

**@agent-plugin-doctor/cli**

- Command-line interface (commander-based)
- Commands: `check`, `fix`, `report`, `compatibility`
- Exit code handling (`computeExitCode`, `EXIT_CODES`) — the exit-code
  contract is the source of truth for library consumers too
- Dependencies: all other packages

## Design Decisions

### ADR-001: Six Packages, Not Nine

An earlier plan split Doctor into nine packages, separating the JSON Schemas,
path security, and the auto-fix engine into their own packages. Building the
first rules showed the split was mostly artificial:

- **schemas → core + parser.** The _constants_ derived from the schemas
  (name patterns, length limits, schema URLs, component types) belong in
  `core` so every package can reference them; the _byte-exact vendored JSON
  Schema files_ belong in `parser`, which is the only package that validates
  against them.
- **security → rules.** Security checks are just rules that emit diagnostics
  (DOC-4xxx). The underlying _enforcement_ — path containment — lives in
  `core`'s `path.ts` as a security boundary used by both the loader and the
  rules, so the "security package" would have duplicated either the loader or
  the rule machinery.
- **fixes → rules.** A fix is a method on a rule; the fix _engine_ is a
  thin, idempotent text-transform layer over diagnostics. Keeping both with
  the rules package avoids a package with one file and a circular
  dependency back into the rule contract.

Six packages gives the clean dependency graph above with no cycles and no
single-purpose packages.

### ADR-002: Build-vs-Doctor Boundaries

Builder creates plugins; Doctor validates them. The contract:

- Doctor **never generates** project files (that is Builder's job) and
  **never migrates** from other formats.
- Builder consumes Doctor as a library: `loadPlugin → validatePlugin →
generateReport → computeExitCode`, with the CLI package as the source of
  truth for exit codes so Builder's process codes always match the CLI's.
- Doctor is **self-hosting**: the repository itself is a valid Agent Plugin
  and `check .` must exit 0 with zero diagnostics.
- The public API surface is pinned by
  `tests/integration/api-stability.test.ts`; any rename or removal fails
  there first.

See [docs/BUILDER_INTEGRATION.md](BUILDER_INTEGRATION.md) for the full
integration contract (the "PRODUCT_BOUNDARIES" document historically
referenced for this contract is now BUILDER_INTEGRATION.md) and the
README's [Relationship with Builder](../README.md#relationship-with-builder)
section.

### ADR-003: Validation Pipeline

Validation is a six-stage pipeline:

```
loadPlugin → parse → discover → run rules → collect diagnostics → report
```

1. **load** — verify the root directory exists.
2. **parse** — read and validate `plugin.json` (fatal on failure), `mcp.json`
   (isolated), SKILL.md files (isolated), extensions (isolated).
3. **discover** — enumerate skills at fixed depth (`skills/*/SKILL.md`) and
   reverse-domain extension directories; every path goes through
   `resolvePluginPath`.
4. **run rules** — the engine selects applicable rules (include/exclude
   lists, spec-version support, `enabledByDefault`) and runs each against the
   in-memory `Plugin`.
5. **collect diagnostics** — each rule returns `Diagnostic[]`; the engine
   normalizes `ruleId`/`category`, attaches fixes from `rule.fix()`, sorts
   deterministically, and computes the summary.
6. **report** — a formatter renders the `ValidationResult` as human, JSON, or
   Markdown; the CLI maps diagnostics to exit codes (0/1/2/3).

Incremental validation reuses stages 1–3 on the changed subset: a fresh
`loadPlugin` (optionally cache-backed) followed by `validateIncremental`,
which re-runs only the rules affected by the changed files.

### ADR-004: Spec Versioning Strategy

Spec support is version-isolated:

- Each spec version lives in `packages/core/src/spec/v<N>/` with its own
  constants (schema URLs, name patterns, length limits, component types).
- `packages/core/src/spec/index.ts` holds the version registry — a plain
  `Record<string, SpecVersion>` — and the `resolveSpecVersion(schemaUrl)`
  mapper. `./spec/current.ts` aliases the current version.
- The official JSON Schemas are **vendored** into
  `packages/parser/src/schemas/` as byte-exact copies and are **never fetched
  at runtime** (spec §4.1 requires clients not to fetch schemas at load
  time). AJV validators are compiled lazily and cached module-level.
- `$schema` selection: `loadPlugin` reads `manifest.$schema`, maps it via
  `resolveSpecVersion`, and rejects plugins whose schema URL is unknown
  (exit 3) — per the spec's "must not silently ignore" requirement.
- Rules declare `supportedSpecVersions`; a rule that applies to all versions
  uses `"*"`. Future spec versions are additive: a new `v<N>` directory, a
  registry entry, and rules declaring the new version.

### ADR-005: Security Model

Plugin content is **untrusted input**. The security model is:

- **No code execution** — the loader and rules only read and parse files;
  plugin code is never executed.
- **Path containment is a security boundary** — every plugin-relative path is
  resolved through `resolvePluginPath` (in `core/src/path.ts`); traversal
  (`../`) and symlink escapes from the plugin root are rejected. A manifest
  that escapes rejects the plugin; an escaping skill/mcp.json/extension is
  skipped/disabled in isolation.
- **No runtime schema fetching** — schemas are vendored, so Doctor works
  offline and cannot be fed a malicious schema URL.
- **Secret redaction** — secret-detection diagnostics (DOC-4003) redact the
  detected values from messages; detection is conservative (strong value
  patterns only, placeholder-shaped values skipped) to avoid false positives.
- **Bounded traversal** — deep scans use `walkPluginFiles`, which skips
  hidden entries and `.git`/`node_modules`, never follows symlinks, and caps
  depth and file count, so a hostile plugin cannot force an unbounded scan.

### ADR-006: Extension Points

Extensibility is registry-based, not fork-based:

- **Rules** — the `Rule` interface + `RuleRegistry`; new rules are picked up
  by `createDefaultRegistry` automatically when exported from a category
  module.
- **Spec versions** — the `specVersions` registry in `core/src/spec/index.ts`.
- **Report formats** — `ReportFormatter` + the `getFormatter` dispatcher.
- **Client profiles** — `ClientProfileRegistry` seeded from `clients.json`.
- **Fixes** — the `fix()` method on a rule, applied by the idempotent
  `applyFixes` engine.

See [docs/EXTENSIBILITY.md](EXTENSIBILITY.md) for worked examples of each.

## Data Flow

```
                        ┌──────────────────────────────────────────────┐
                        │                  plugin dir                  │
                        │  plugin.json  mcp.json  skills/*  extensions │
                        └──────────────┬───────────────────────────────┘
                                       │ loadPlugin (parse + discover,
                                       │ path-containment enforced)
                                       ▼
                              ┌──────────────────┐
                              │  Plugin (core)   │  specVersion, manifest,
                              │                  │  mcpConfig, skills[],
                              └────────┬─────────┘  extensions[]
                                       │
              ┌────────────────────────┼─────────────────────────┐
              │ validatePlugin         │ checkCompatibility      │
              ▼                        ▼                         ▼
      ┌───────────────┐      ┌──────────────────┐     ┌─────────────────┐
      │ RuleRegistry  │      │ ClientProfile    │     │                 │
      │ 29 rules, 7   │      │ Registry (5      │     │  ValidationResult│
      │ categories    │      │ verified clients)│     │  + Compatibility│
      └───────┬───────┘      └──────────────────┘     └────────┬────────┘
              │ runRules (select → check → fix)               │
              ▼                                                │
      ┌───────────────┐    applyFixes (idempotent text edits)  │
      │ Diagnostics[] │◀───────────────────────────────────────┘
      └───────┬───────┘
              │
              ├──────────────────────────────┐
              ▼                              ▼
      ┌───────────────┐             ┌─────────────────┐
      │ Report (human │             │ computeExitCode │
      │ /json/markdown)│            │ 0|1|2|3         │
      └───────────────┘             └─────────────────┘
```

When the plugin changes between runs, `loadPlugin` (with a shared
`ParsedFileCache`) re-parses only changed files, and `validateIncremental`
re-runs only affected rules, reusing the previous diagnostics for the rest.

## Type System

The canonical types live in `core/src/types.ts` and flow through every
package:

- **`Plugin`** — the loaded model: `rootDir`, `specVersion`, `manifest`,
  `mcpConfig?`, `skills[]`, `extensions[]`. This is the single object rules
  validate against; raw-file rules additionally read the original file from
  disk when they need parser-stripped data.
- **`PluginManifest`** — the sanitized `plugin.json` (unknown fields and
  non-object `extensions` are stripped per §5.2/§8.1).
- **`Skill`** — parsed SKILL.md: `name`, `description`, `body`,
  `frontmatter`, `directory` (plugin-relative), plus normalized
  `allowedTools`.
- **`McpConfig` / `McpServer`** — typed union of `stdio` | `streamable-http`
  | `sse` servers.
- **`Diagnostic`** — `code` (stable `DOC-xxxx`), `severity`, `message`,
  `ruleId`, `category`, optional `file`/`range`/`fix`/`related`.
- **`ValidationResult`** — `plugin`, `diagnostics[]`, `summary`
  (counts + byCategory), `compatible`, `compatibility[]`, `elapsedMs`.

Types are exported from `core` and re-used everywhere; no package redefines a
type it can import. The parser produces `Plugin`-compatible shapes (proven by
`tests/integration/core-parser.test.ts` with explicit type annotations), and
the CLI maps the compatibility package's checks onto the core
`CompatibilityResult` shape so report formatters need only the core types.

## Testing Strategy

- **Unit tests** — per package in `packages/<pkg>/tests/`, covering rules
  (positive and negative cases), the engine, fixes, loader, parsers, and the
  new cache/traversal/incremental modules.
- **Integration tests** — `tests/integration/` import the packages directly
  and exercise cross-package flows: parser → rules → report/compatibility,
  the Builder contract, and API stability.
- **E2E tests** — `tests/e2e/` spawn the real CLI binary against on-disk
  fixtures and assert exit codes and output.
- **Fixtures** — `tests/fixtures/` holds 15 self-contained plugins covering
  every validation scenario; each fixture has a README explaining its
  purpose. Fixtures are byte-exact inputs (prettier-ignored).
- **Self-hosting** — the repository is itself a valid plugin; `check .` must
  exit 0 with zero diagnostics. New root-level files must be added to the
  `structure-extra-files` whitelist to preserve this contract.
- **Benchmarks** — `tests/benchmarks/` enforces the performance budgets for
  the load + validate pipeline.

## Performance Considerations

- **Lazy AJV compilation** — validators are compiled once, module-level, and
  reused across calls (`parser/src/validation.ts`).
- **Parser caching** — `ParsedFileCache` (parser) caches parsed results keyed
  by path + mtime + size; `loadPlugin` re-parses a file only when it changed.
  In benchmarks the second load of a 100-skill plugin drops from ~10ms to
  ~3ms; warm single-plugin loads drop from ~82ms to ~0.1ms.
- **Bounded filesystem traversal** — `walkPluginFiles` skips hidden entries
  and `.git`/`node_modules`, never follows symlinks, caps depth at 10 levels
  and file count at 1000 per plugin, and reports truncation. The loader's own
  discovery is fixed-depth (skills) and root-level (extensions), so loading
  is inherently O(components).
- **Incremental validation** — `validateIncremental` re-runs only the rules
  affected by the changed files (raw-file rules by declared `files`, structure
  rules on any change, model rules when the plugin model changed) and reuses
  previous diagnostics otherwise. The plugin is still re-loaded (optionally
  cache-backed) so diagnostics never go stale.
- **Deterministic ordering** — diagnostics are sorted once in the engine
  (severity, then code, file, message) so reports are stable and diff-friendly.

## Future Extensibility

- **New rules** — add a file to `packages/rules/src/rules/<category>/`,
  implement `Rule`, export it from the category index, write tests, document
  the code in `docs/DIAGNOSTICS.md`.
- **New spec versions** — create `packages/core/src/spec/v<N>/`, register it
  in `spec/index.ts`, vendor the schemas, declare support on rules.
- **New report formats** — implement `ReportFormatter`, register it in
  `getFormatter`, accept it in the CLI.
- **New client profiles** — add a verified client to
  `packages/compatibility/src/data/clients.json`, test, document.

Worked examples for all four are in [docs/EXTENSIBILITY.md](EXTENSIBILITY.md).
