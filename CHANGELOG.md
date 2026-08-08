# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.6] - 2026-08-08

### Added

- DOC-7003: Duplicate frontmatter detection (error severity, exit 1)
- Version integrity check script (`bun run check:versions`)
- External TypeScript consumer verification

### Fixed

- ECO-002: Doctor now detects duplicate YAML frontmatter blocks in SKILL.md
- ECO-010: Public SDK types fixed, isPluginLoadError exported
- ECO-006: Release publishing integrity verified

### Changed

- CLI version now sourced from package.json (no hardcoded literal)
- npm umbrella package includes vendored .d.ts for self-contained types

## [Unreleased]

### Added

- **`ParsedFileCache` hit/miss counters —
  `packages/parser/src/cache.ts`** — the cache now exposes `hits` and
  `misses` (total cache hits/misses since creation), letting callers measure
  cache efficiency and verify deterministically that unchanged files are not
  re-parsed.

### Fixed

- **Flaky benchmark: `cached reload skips re-parsing unchanged files` —
  `tests/benchmarks/benchmark.test.ts`** — the assertion compared wall-clock
  timing of a cold load + validate against a warm-cache reload. The margin is
  only a few milliseconds (~6ms cold vs ~2ms cached for 50 skills), so on a
  contended CI runner the cached reload could randomly exceed the cold run
  and fail. The test now asserts the behavior deterministically: after
  warming the cache, a reload of unchanged files produces zero additional
  cache misses (nothing is re-parsed) and increases the hit count.

## [0.0.4] - 2026-08-08

### Added

- **Self-contained npm CLI package `@hiai-gg/agent-plugins-doctor` —
  `packages/npm/`** — the CLI is now published to npm as a single bundled
  package (following the [Agent Plugin Builder](https://github.com/HiAi-gg/agent-plugin-builder)
  pattern): `bun build --target node` bundles the CLI and all five library
  packages into one `dist/index.js`, with a plain Node `bin/cli.js` entry
  (Node ≥ 18, no Bun required). The six `@agent-plugins-doctor/*` SDK
  packages remain unpublished (SDK publication deferred). Publishing commands:
  `bun run publish:npm:dry-run` / `bun run publish:npm`; see
  [PUBLISHING.md](PUBLISHING.md).

- **GitHub Actions publish workflow — `.github/workflows/publish.yml`** —
  automatic npm publishing via Trusted Publisher (OIDC): triggered on
  `release: published` (or manual `workflow_dispatch` with a `dry_run`
  toggle), builds all packages with Bun, runs the test suite, and publishes
  `packages/npm` to the npm registry with `npm publish --access public`.

### Changed

- **Prepared for public npm release** — all package versions bumped to
  0.0.4; the npm package `@hiai-gg/agent-plugins-doctor` is the release
  artifact published from the `packages/npm` workspace.

## [0.0.3] - 2026-08-07

### Added

- **Non-object `extensions` is no longer silently ignored (P1 #6) —
  `packages/parser/src/plugin-manifest.ts`** — a structurally invalid
  `extensions` field (string, array, `null`, number, or boolean) now emits an
  explicit `DOC-1009` parser diagnostic (severity `error`, exit 1) while the
  field is still stripped per §8.1 and the manifest loads. Fixtures:
  `tests/fixtures/non-object-extensions/` and the updated
  `vendor-extensions/invalid-extensions/` (exit 0 → 1).

- **`DOC-4002` (symlink escape) is CLI-reachable (P1 #7) —
  `packages/parser/src/plugin-loader.ts`** — the loader now resolves symlink
  entries (skill dirs, `SKILL.md`, extension namespaces) through the security
  boundary during discovery and emits `DOC-4002` (severity `critical`,
  exit 2, `ruleId: "parser"`) when a component path is a symlink escape —
  previously an escaping extension namespace vanished with no diagnostic and
  an escaping skill surfaced only as `DOC-2099`.

- **`checkCompatibility(null)` no longer crashes (P1 #8) —
  `packages/compatibility/src/checker.ts`, `types.ts`** — the function
  accepts `Plugin | null | undefined` and returns an empty result
  (`plugin: null`, `checks: []`, zeroed summary) instead of throwing.
  `CompatibilityResult.plugin` is now `Plugin | null`.

- **Clear unsupported-version message (P1 #10) —
  `packages/parser/src/plugin-manifest.ts`** — an unsupported `$schema`
  (older or future Agent Plugins version) now produces a dedicated `DOC-1010`
  parser diagnostic (severity `error`, exit 1) naming the detected version
  and the supported version, instead of the vendored schema's generic
  "must be equal to constant" const violation (`DOC-1008`). The strict
  `loadPlugin` API throws `UnsupportedVersionError` (a
  `SchemaValidationError` subclass). Fixtures: `tests/fixtures/unsupported-version/`;
  `legacy-plugin` and `future-spec` now report `DOC-1010`.

- **Real Builder compatibility fixtures — `tests/fixtures/builder-generated/real-builder/`** —
  byte-exact copies of plugins generated by the **real** Agent Plugin Builder
  binary (cloned and built from https://github.com/HiAi-gg/agent-plugin-builder
  at commit `7a0b9bd8`, v0.0.6), covering `init`, `create --skills-only`,
  `create --mcp-only`, `migrate --from claude`, and `migrate --from cursor`.
  The simulated `from-*` fixtures remain as the Builder integration contract;
  the real-builder fixtures prove the contract holds against actual generated
  output. All five pass `agent-plugins-doctor check` with exit 0 and zero
  diagnostics. See `docs/BUILDER_REAL_INTEGRATION.md`.

- **Cross-repo integration test — `tests/integration/builder-real.test.ts`** —
  loads and validates every real-builder fixture with zero error/critical
  diagnostics and exit code 0; the real-builder fixtures are also added to the
  E2E `check` fixture matrix (`tests/e2e/check.test.ts`).

- **Autofix idempotence suite — `tests/integration/autofix-idempotence.test.ts`** —
  18 tests covering every one of the 12 autofixes: the full
  load → validate → apply → reload → validate loop for all disk-reachable
  fixes, byte-level double-apply for the SDK-only fixes (DOC-1002, DOC-1006,
  DOC-1007, DOC-3003, DOC-6002), determinism (identical inputs converge to
  byte-identical outputs), multi-fix convergence in a single pass, and
  regressions for the issues below. See `docs/AUTOFIX_AUDIT.md`.

- **v0.0.3 exit-code contract E2E — `tests/e2e/exit-codes-v003.test.ts`** —
  locks the 0/1/2/3 exit codes against the real CLI binary: valid plugin → 0,
  invalid manifest / invalid MCP server → 1, MCP cwd/command traversal → 2
  (critical DOC-3008), and a permission-denied root → 3 (skipped on Windows
  and when running as root, where POSIX permission bits cannot be simulated).

### Fixed

- **Unicode skill names accepted (Agent Skills spec compliance) —
  `packages/core/src/spec/v1/index.ts`** — `SKILL_NAME_PATTERN` now permits
  Unicode lowercase alphanumeric characters in any script (accented Latin such
  as `café`, Cyrillic, CJK) plus digits and hyphens, matching the spec and the
  skills-ref reference validator; uppercase/titlecase letters remain rejected
  (no `--`, no leading/trailing hyphen, ≤ 64 chars). DOC-5002
  (`structure-skill-directory-name`) inherits the relaxed pattern; DOC-2001
  (name/directory match) was already equality-based and works for Unicode
  names. Fixture: `tests/fixtures/unicode-skill-name/`; coverage:
  `packages/core/tests/spec.test.ts`, `packages/rules/tests/rules/structure/skill-directory-name.test.ts`,
  `tests/integration/unicode-skill-names.test.ts` (new), and the e2e `check`
  matrix.

- **Exit code semantics for invalid MCP entries — `packages/parser/src/mcp-config.ts`,
  `packages/rules/src/rules/mcp/cwd-pattern.ts`** — an invalid individual
  MCP server entry whose stdio `command` or `cwd` escapes the plugin root
  (path traversal) is now a security-critical finding: the parser emits its
  `DOC-3008` diagnostic with severity `critical` (exit 2, matching DOC-4001)
  instead of `error` (exit 1). Non-traversal validation errors (unsupported
  `type`, reserved env keys, non-relative `cwd`) remain `error` (exit 1). The
  SDK-only `DOC-3004` (`mcp-cwd-pattern`) rule classifies an escaping `cwd`
  as `critical` too. Regression coverage:
  `tests/integration/exit-codes-mcp.test.ts` (new), the
  `mcp-per-server` and `security-plugin/path-traversal` fixtures (exit 2),
  and the `full-pipeline`/e2e fixture matrices.

- **Invalid individual MCP server entries no longer silently disappear (P0) —
  `packages/parser/src/mcp-config.ts`, `packages/parser/src/plugin-loader.ts`,
  `packages/core/src/types.ts`, `packages/rules/src/rules/mcp/invalid-server-entry.ts`** —
  the parser used to skip schema-invalid `mcpServers` entries before any rule
  could see them, so an unsupported `type` (websocket), a reserved `env` key
  (`PLUGIN_ROOT`/`PLUGIN_DATA`), a non-plugin-relative `cwd`, or an escaping
  stdio `command` produced "No issues found" with exit 0. Every raw server
  entry is now preserved — valid entries stay typed, invalid entries become
  `null` in `mcpConfig.mcpServers` — and each invalid entry emits a new
  `DOC-3008` parser diagnostic (with a precise, humanized schema reason) plus
  a new `DOC-3008` rule (`mcp-invalid-server-entry`) for the SDK path, so the
  plugin fails validation with exit 1 — or exit 2 when the entry's stdio
  `command`/`cwd` escapes the plugin root (reported at severity `critical`,
  matching DOC-4001). Valid sibling servers still load.
  Regression fixtures and tests: `tests/fixtures/mcp-per-server/` and
  `tests/integration/mcp-per-server.test.ts`. The `security-path-traversal`
  rule (DOC-4001) now also checks stdio `command`; the shared
  `isTraversalPath` helper moved to `@agent-plugins-doctor/core` so the parser
  and the rule agree.

- **Permission-denied plugin root now exits 3 (tool failure) instead of 1 —
  `packages/cli/src/utils/run.ts`, `packages/parser/src/plugin-loader.ts`** —
  a root that exists but cannot be listed (`chmod 000` or an ancestor denying
  traversal) used to scan as an unreadable tree and exit 1 with misleading
  DOC-1008/DOC-3007 diagnostics. `assertRootAccessible` now probes the root
  with `readdirSync` and reports `EACCES`/`EPERM` as `LoadError("Permission
denied")` (exit 3), and the parser's root-stat failure distinguishes a
  permission denial from a missing root.

- **DOC-3006 duplicate-header idempotence — `packages/rules/src/rules/mcp/header-validation.ts`** —
  the fix resolved its target member case-insensitively, so with three or
  more case-variant duplicates (e.g. `Authorization` / `authorization` /
  `AUTHORIZATION`) two diagnostics targeted the same span and one duplicate
  remained fixable after a fix pass. The fix now matches the exact key, so
  one pass removes every duplicate (keeping the first).

- **Fix-engine rename ordering — `packages/rules/src/fixes.ts`** — `applyFixes`
  applied fixes in diagnostic order, so a skill-directory rename (DOC-2001 /
  DOC-5002) could run before a content fix on a file inside that directory
  (DOC-7002 / DOC-2005), failing with ENOENT and leaving a fixable diagnostic
  behind. Rename fixes are now applied last (stable sort), so content fixes
  always run against the paths they were computed for.

- **Order-independent JSON member removal — `packages/rules/src/util.ts`,
  `packages/rules/src/fixes.ts`** — member-removal spans used to include
  separator commas, making removals order-sensitive when several members of
  the same object were removed (a sibling removal changed the comma layout
  and the second fix's old text no longer matched). Spans now cover only the
  member text; the engine cleans up the surrounding comma, so removals apply
  in any order and converge to the same valid JSON.

- **Robust DOC-1002 / DOC-1007 fixes — `packages/rules/src/rules/manifest/name-pattern.ts`,
  `packages/rules/src/rules/manifest/schema-match.ts`** — both fixes built a
  textual `"key": <value>` old text that failed on schema-valid odd spacing
  and could rewrite a nested member (e.g. `author.name`). They now locate the
  top-level member with the JSON member scanner and rewrite only the value
  token, preserving all other bytes, and are skipped when the file is missing
  or the on-disk value no longer matches the in-memory model.

### Changed

- **Doctor skill metadata fixed for truthfulness — `skills/doctor/SKILL.md`** —
  the `compatibility` frontmatter field no longer claims "Works with all Agent
  Plugins clients"; it now states the real requirement (a client that supports
  Agent Skills and terminal command execution, with the CLI invoked via
  `bunx agent-plugins-doctor` or `npx agent-plugins-doctor`). A new "Runtime
  Requirements" section documents that installing the skill does **not**
  install the Doctor CLI and that Bun or npm must be available. Command
  examples now use `bunx`/`npx` instead of a bare `agent-plugins-doctor`, and
  the "Output" section no longer claims diagnostics carry line numbers (no
  rule emits `range`; diagnostics carry plugin-relative `file` paths only).

- **Documentation truth pass — README.md and docs/SDK.md** — verified README,
  docs/DIAGNOSTICS.md, docs/RULES.md, docs/SPEC_SUPPORT.md, docs/SDK.md,
  docs/COMPATIBILITY.md, docs/ARCHITECTURE.md, and docs/BUILDER_INTEGRATION.md
  against the current implementation (29 rules, 32 diagnostics, 12
  auto-fixes, 5 verified clients, exit codes 0/1/2/3). README: documented the
  `--verbose` (check), `--json`/`--no-color` (fix), and `--json`
  (compatibility) CLI options; noted the six packages are publishable npm
  artifacts verified by the external-install E2E test but not yet on the
  public registry; added cross-platform (CI matrix) and test-suite (552 tests
  across 71 files) facts; linked PUBLISHING.md. SDK.md: corrected the
  `NAME_PATTERN` constant to match `packages/core/src/spec/v1/index.ts` and
  the `ValidationResult.plugin` type to `Plugin | null` to match
  `packages/core/src/diagnostics.ts`.

- **Naming consistency verified (P2 #12)** — a repo-wide search confirms every
  reference uses the plural `agent-plugins-doctor` form (no singular form
  remains anywhere): the root package, all six `@agent-plugins-doctor/*`
  packages, the `agent-plugins-doctor` CLI binary, `plugin.json`, README,
  docs, and skills all use the plural name consistently.

- **Doctor skill requires no install step (P2 #13) — `skills/doctor/SKILL.md`** —
  the "Runtime Requirements" section no longer says the Doctor CLI "must also
  be installed" via a source checkout or `npm install -g
@agent-plugins-doctor/cli`. `bunx`/`npx` fetch the published
  `@agent-plugins-doctor/cli` package (binary `agent-plugins-doctor`) from
  the npm registry on first use — no source checkout, workspace build, or
  global install required; only Bun or npm (with registry access) is needed.

- **Documentation truth pass (P2 #14) — README.md, docs/SDK.md** — README:
  the "Public SDK" section now states the SDK packages are **not yet
  published to npm** (deferred — use the CLI or import from the monorepo)
  instead of presenting a library-usage example; the diagnostic-codes section
  now states the total (35 codes) and the reachability split (24 disk /
  10 SDK-only / 1 dead under v1.0.0); the features list states the autofix
  count (12). SDK.md: added a status note that the SDK packages are not yet
  published to npm. docs/DIAGNOSTICS.md and docs/SPEC_SUPPORT.md were
  re-audited and already accurate (35 codes, 24 disk / 7 parser-level /
  10 SDK-only reachability, 12 autofixes, DOC-3008 and DOC-4002
  CLI-reachable).

## [0.0.2] - 2026-08-07

### Added

- **External-install E2E test — `tests/e2e/external-install.test.ts`** — packs
  all six workspace packages with `npm pack` (which rebuilds `dist/` via
  `prepublishOnly`) and installs them with `npm install` into a scratch
  directory outside the monorepo, simulating `bunx agent-plugins-doctor` without
  publishing: the installed node-targeted artifact is exercised end-to-end
  (`--help`, `--version`, `check`, `report`, `fix --dry-run`) against a minimal
  test plugin. Because the `@agent-plugins-doctor/*` packages are not on the
  registry yet, all six tarballs are installed in a single `npm install` so
  their `^0.0.2` inter-package dependencies resolve locally. The test removes
  the scratch directory and tarballs afterwards, and `*.tgz` is gitignored as a
  safety net.

- **Publish automation — `scripts/publish.ts`** — builds all six packages
  (`bun run build`, topologically ordered) and publishes them to npm in
  dependency order: core → parser → compatibility → report → rules → cli.
  Supports `--dry-run` (build + `npm publish --dry-run`, nothing reaches the
  registry), aborts on version mismatch between packages, checks `npm whoami`
  before a real publish, and reports the failing package with npm's output
  when a publish step errors. Root scripts: `publish:dry-run` and
  `publish:all` (the previous inline `cd && npm publish` chain is replaced).
  Each package's `prepublishOnly` still rebuilds as a safety net. New
  [PUBLISHING.md](PUBLISHING.md) documents prerequisites, the publish flow,
  verification, and troubleshooting; `docs/RELEASING.md` §7 now points at the
  scripts.

- **`scanPlugin()` — diagnostic-oriented plugin loading that never throws** —
  `@agent-plugins-doctor/parser` gains `scanPlugin(rootDir, options?)`
  returning a `ScanResult` (`plugin: Plugin | null`, `diagnostics:
Diagnostic[]`, and a `loaded` breakdown of what was loaded). Every
  parse/schema/load error is collected as a parser diagnostic instead of
  throwing, so malformed user input can be reported as a validation error
  (exit 1) rather than a tool failure (exit 3). A `plugin.json` failure leaves
  `plugin` null but scanning continues over skills, `mcp.json`, and
  extensions; `loaded.skillsFailed` counts discovered skills that failed to
  load. Two new parser-emitted codes: `DOC-1008` (manifest could not be
  loaded — one diagnostic per schema violation) and `DOC-3007` (mcp.json could
  not be loaded). `loadPlugin()` is unchanged and remains the strict variant.
  `ScanResult` also carries `rootDir` (the absolute path of the scanned
  plugin root) so the validation engine can run raw-tree rules when no plugin
  model was loaded.

- **`validatePlugin()` accepts scan results — `validatePlugin(pluginOrScanResult: Plugin | ScanResult, options?)`** — the validation engine now runs in diagnostic mode: parser parse/schema/load diagnostics (`ruleId: "parser"`) are merged ahead of the rule diagnostics, and the summary, `compatible` flag, and exit code are computed over the merged set. When `ScanResult.plugin` is null (plugin.json could not be loaded), the returned `ValidationResult.plugin` is null, `specVersion` is `''`, and only the rules that inspect the raw tree run (structure + JSON-formatting); rules that require the loaded plugin model are skipped instead of crashing. The `Rule` interface gains an optional `requiresPlugin` marker (default `true`; `false` = safe to run from raw file reads only), set on `structure-directory-layout`, `structure-extra-files`, and `format-json-formatting`. Passing a loaded `Plugin` keeps the previous strict behavior unchanged.

### Changed

- **CLI loads plugins via `scanPlugin()` instead of `loadPlugin()`** — the
  `check`, `fix`, `report`, and `compatibility` commands now use the
  diagnostic-oriented loader, which never throws. Malformed user input —
  unparseable or schema-invalid `plugin.json` (`DOC-1008`), skills that fail
  to load (`DOC-2099`), invalid `mcp.json` (`DOC-3007`) — surfaces as parser
  diagnostics merged ahead of the rule diagnostics, so it produces exit code
  `1` (validation error) instead of exit code `3` (tool failure). Only true
  tool failures still exit `3`: an inaccessible plugin root (missing
  directory) and internal rule failures (`DOC-0000`). Schema-violation
  fixtures (`invalid-plugin`, `legacy-plugin`, `future-spec`,
  `unicode-names`) now exit `1` with `DOC-1008` diagnostics instead of
  failing to load. Backward compatibility: the strict `loadPlugin()` API is
  unchanged.

- **`ValidationResult.plugin` is now `Plugin | null`** — a validation result
  produced from a scan result whose plugin.json could not be loaded has a
  null `plugin` (with `specVersion` `''`); the report formatters render
  `(unavailable)`/`null` for the plugin name in that case. Results produced
  from a loaded `Plugin` are unchanged.

- **Client profiles are re-verified against current primary documentation
  (2026-08-07)** — VS Code, Cursor, GitHub Copilot, ChatGPT & Codex, and Kiro
  profiles in `packages/compatibility/src/data/clients.json` were checked
  against the current official docs. VS Code's `mcpLegacySse`/transports and
  ChatGPT & Codex's lack of legacy SSE were reconfirmed (SSE is not documented
  anywhere in OpenAI's docs). Each profile now carries a dated
  `verificationNote` recording when and against what it was verified.

- **Extension compatibility refined: `extensions: true` no longer implies
  every namespace is understood** — `ClientCapabilities.extensions` keeps its
  boolean shape (backward compatible) but now means "supports the extension
  mechanism and safely ignores unknown namespaces per spec §8.2". Each client
  profile adds an `extensionsNote` clarifying what was verified. Each
  `CompatibilityCheck` now carries `extensionsHandling`
  (`'supported' | 'ignored' | 'unsupported' | 'unknown'`): `'ignored'` when
  the mechanism is supported (unknown namespaces safely ignored), `'unknown'`
  when the profile has insufficient evidence (info), and `'unsupported'` when
  the client does not support extensions (warning). `'supported'` is reserved
  for profiles that explicitly list verified namespaces. Extensions never
  contribute to `working`/`unsupported` and never downgrade a check from
  FULL. Documented in docs/COMPATIBILITY.md and docs/SDK.md.

- **Compatibility is now a four-level system instead of a boolean** — each
  client check carries a `CompatibilityLevel` (`full`, `partial`,
  `unsupported`, `unknown`) plus `working`/`unsupported` capability lists
  (`skills`, `mcp-stdio`, `mcp-streamable-http`, `mcp-sse`, `extensions`).
  A plugin using Skills + stdio MCP + SSE MCP is now `partial` with Codex
  (which lacks legacy SSE) instead of a flat `compatible: false`. Level
  derivation: unsupported spec version → `unsupported`; profile evidence
  `none` → `unknown`; no unsupported capabilities → `full`; every used
  capability unsupported → `unsupported`; otherwise `partial`. The
  `compatible` boolean is kept for backward compatibility and derived from the
  level (`true` only for `full`). The `CompatibilityLevel` enum lives in
  `@agent-plugins-doctor/compatibility`; core's `CompatibilityResult` carries
  an aligned string-union type with identical values. Human/Markdown/JSON
  report formatters and the `compatibility` command render the level
  (`✓`/`~`/`✗`/`?`). Documented in docs/COMPATIBILITY.md and docs/SDK.md.

- **DOC-2005: the space-separated string form of `allowed-tools` is now
  canonical** — the Agent Skills spec defines `allowed-tools` as a
  space-separated string (e.g. `Bash(git:*) Bash(jq:*) Read`), so the rule
  no longer flags the string form, and its autofix no longer rewrites a
  string into a YAML list (which is not in the spec). A YAML list is
  accepted as a Doctor-specific extension with a warning; invalid types
  (numbers, booleans, objects, lists with non-string members) remain errors.
  Empty/whitespace-only strings and comma+space-separated lists produce
  warnings. The autofix now only normalizes whitespace in the string form
  (multiple spaces → single space) and never changes the form.

- **Test suite growth** — 552 tests across 71 files (up from 478 tests across
  64 files at v0.0.1), driven by the new external-install E2E, scan-exit-codes
  E2E, and expanded rule/engine coverage.

### Fixed

- **Parser: skill load errors now surface as diagnostics instead of being
  silently dropped** — `discoverSkills` caught every `SKILL.md` parse
  failure and `continue`d, so a skill with malformed YAML, invalid
  frontmatter, or missing required fields vanished with zero diagnostics.
  `loadPlugin` now returns a `LoadResult` (`{ plugin, parseDiagnostics }`);
  each failed skill produces a `DOC-2099` error diagnostic (`ruleId:
"parser"`, category `skills`) pointing at `skills/<name>/SKILL.md`, while
  failure isolation is preserved (other skills still load). The CLI pipeline
  (`loadAndValidate`, `check`, `fix`, `report`, and the Builder example)
  merges `parseDiagnostics` into the rule diagnostics and recomputes the
  summary, so malformed input is a validation error (exit code `1`) rather
  than a silent pass. A new standalone `computeSummary` export from
  `@agent-plugins-doctor/rules` recomputes summary counts over merged
  diagnostics. Documented in docs/DIAGNOSTICS.md (DOC-2099) and
  docs/SDK.md (§2.1).
- **Parser: `allowed-tools` no longer normalized from string to array** —
  `parseSkillFrontmatter` now preserves the raw `allowed-tools` value
  verbatim per the Agent Skills specification (a space-separated string,
  typed `Optional[str]` in the reference implementation). Non-string values
  (YAML lists, numbers, booleans, mappings) are preserved as-is too —
  DOC-2005, not the parser, is the gatekeeper for the field (YAML list →
  warning, any other type → error), so malformed input is a validation
  error (exit 1) rather than a load failure. `SkillFrontmatter['allowed-tools']`
  is now `AllowedToolsValue` (`string | number | boolean | list | mapping`).
  The `Skill.allowedTools` convenience field still splits the string form
  into a list and is `undefined` for non-string values.
- **Windows: plugin loading failed with "Path escapes plugin root"** —
  `isWithinPath` appended a hardcoded `/` to the parent path, but
  `node:path` produces backslash-separated paths on Windows
  (e.g. `C:\plugin\skill.md`), so every contained path was rejected and
  `resolvePluginPath` threw for all valid plugins. The containment check now
  uses the platform separator (`path.sep`) and tolerates parents that already
  end with one, restoring the full suite (128 tests) on Windows while leaving
  POSIX behavior byte-identical. Cross-platform regression test added.
- **Windows: CRLF line endings broke formatting/line-ending rules** — git
  checks out text files with CRLF on Windows by default, so fixtures reported
  DOC-7001 (JSON formatting) and DOC-7002 (CRLF line endings) and self-hosting
  failed. Added `.gitattributes` (`* text=auto eol=lf`) to force LF on every
  platform; binary files are unaffected.
- **Windows: benchmark and e2e timing budgets too tight** — cold starts on
  Windows runners are ~1.5-2x slower (1-skill load was 136ms vs a 100ms
  budget) and 18 sequential CLI spawns exceeded the default 5s test timeout
  (exit 143 = killed). Widened benchmark budgets (250/500/2000/3000ms) and
  raised the fixture exit-code e2e test timeout to 60s.

## [0.0.1] - 2026-08-07

Initial release of Agent Plugin Doctor: the canonical validation, diagnostics,
and security-auditing tool for the Agent Plugins ecosystem.

### Added

- **6-package monorepo architecture** — `core`, `parser`, `rules`,
  `compatibility`, `report`, `cli` with a clean dependency graph
  (`core ← parser ← rules ← cli`). Documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Agent Plugins v1.0.0 support** — vendored byte-exact official JSON
  Schemas (never fetched at runtime), `$schema` version selection, and
  per-component failure isolation.
- **29 validation rules across 7 categories** — manifest/spec (DOC-1xxx),
  skills (DOC-2xxx), MCP (DOC-3xxx), security (DOC-4xxx), structure
  (DOC-5xxx), compatibility (DOC-6xxx), and format (DOC-7xxx). Full catalog in
  [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md).
- **Security auditing** — embedded-secret detection with redaction (DOC-4003),
  path-traversal and symlink-escape containment via `resolvePluginPath`.
- **Safe auto-fixes** — idempotent text-based fix engine (`--fix`); 12 of 29
  rules attach fixes.
- **Compatibility checking** — 5 verified clients (VS Code, Cursor, GitHub
  Copilot, ChatGPT & Codex, Kiro) seeded from `clients.json`. Documented in
  [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).
- **CLI** — `check`, `fix`, `report`, and `compatibility` commands with the
  stable exit-code contract (0 = valid, 1 = spec errors, 2 = security-critical,
  3 = tool failure).
- **Report formats** — human, JSON, and Markdown output (`--format`).
- **Self-hosting** — Doctor validates itself as an Agent Plugin
  (`check .` exits 0 with zero diagnostics).
- **Builder integration** — library API for Agent Plugin Builder
  (`loadPlugin → validatePlugin → generateReport → computeExitCode`), pinned
  by `tests/integration/api-stability.test.ts`.
- **Comprehensive test suite** — 478 tests across 64 files: unit, integration,
  E2E (spawns the real binary), fixture-based, and benchmark budgets.
- **Project documentation** — README, AGENTS.md, SDK, DIAGNOSTICS, RULES,
  SPEC_SUPPORT, BUILDER_INTEGRATION, and the Phase 16 architecture/
  compatibility/extensibility references.

### Performance

- **Parser file cache** — `ParsedFileCache` caches parsed plugin.json, mcp.json,
  and SKILL.md results keyed by path + mtime + size; `loadPlugin` accepts a
  shared cache and re-parses only changed files. Warm reloads drop from
  ~82ms to ~0.1ms for a 1-skill plugin.
- **Bounded filesystem traversal** — `walkPluginFiles` skips hidden entries
  and `.git`/`node_modules`, never follows symlinks, caps depth at 10 levels
  and file count at 1000 per plugin, and reports truncation. Loader discovery
  skips hidden/system entries.
- **Incremental validation** — `validateIncremental` re-runs only the rules
  affected by a list of changed files (raw-file rules by declared `files`,
  structure rules on any change, model rules on plugin-model changes) and
  reuses previous diagnostics otherwise.
- **Performance benchmarks** — `tests/benchmarks/` enforces the budgets:
  1-skill < 100ms, 10-skill < 200ms, 100-skill < 2000ms, full suite < 10s.

### Documentation

- Added [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — package architecture,
  6 ADRs (packages, Builder boundaries, validation pipeline, spec versioning,
  security model, extension points), data flow, type system, testing
  strategy, performance considerations.
- Added [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — verified-client
  matrix, evidence levels, compatibility vs validation, adding clients.
- Added [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md) — worked examples for
  new rules, spec versions, report formats, client profiles, and auto-fixes.
- Added [docs/RELEASING.md](docs/RELEASING.md) — full release and git-tag
  procedure (version bump, gates, build, changelog, annotated tag).
