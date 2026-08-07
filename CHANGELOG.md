# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
