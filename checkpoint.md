# Checkpoint — Phase 3.2a: CLI loads via scanPlugin

## Active intent

Switch the CLI from `loadPlugin` (strict, throws → exit 3) to `scanPlugin`
(diagnostic-oriented, never throws) so malformed user input is a validation
error (exit 1) with parser diagnostics instead of a tool failure (exit 3).
All four commands (check/fix/report/compatibility) now scan; the only
remaining exit-3 paths are an inaccessible root and internal rule failures
(DOC-0000).

## Next action

None pending. All quality gates green (537 tests, typecheck, lint, prettier,
self-hosting exit 0).

## Task tree

- [x] `packages/cli/src/utils/run.ts`: `loadAndValidate` uses `scanPlugin()` +
      `validatePlugin(scanResult, options)`; compatibility attached only when
      plugin non-null; new `assertRootAccessible` (statSync → LoadError, exit
      3 for missing/non-directory root); `mergeDiagnostics`/`isPluginLoadError`
      kept for backward compat
- [x] `packages/cli/src/commands/check.ts`: catch now only fires for true tool
      failures (comment updated)
- [x] `packages/cli/src/commands/fix.ts`: revalidation via
      `validatePlugin(await scanPlugin(pluginDir))` (engine merges parser
      diagnostics); unused mergeDiagnostics/computeSummary imports dropped
- [x] `packages/cli/src/commands/report.ts`: unchanged (uses loadAndValidate)
- [x] `packages/cli/src/commands/compatibility.ts`: scans; null plugin →
      prints parser diagnostics + exit 1; `assertRootAccessible` before scan
- [x] `packages/cli/src/utils/exit-codes.ts`: comment documents parser
      diagnostics → exit 1 (logic already correct)
- [x] `tests/e2e/scan-exit-codes.test.ts` (new): malformed plugin.json →
      1/DOC-1008, malformed SKILL.md → 1/DOC-2099, missing $schema →
      1/DOC-1008, inaccessible root → 3, valid → 0
- [x] e2e fixtures updated: invalid-plugin/unicode-names/legacy-plugin/
      future-spec exit 3 → 1 (DOC-1008); e2e fix invalid-plugin test → 1
- [x] exit-codes.test.ts: +1 parser-diagnostic test
- [x] Docs: fixtures READMEs (4), tests/fixtures/README.md, CHANGELOG.md,
      MEMORY.md, docs/{ARCHITECTURE,SPEC_SUPPORT,BUILDER_INTEGRATION,RULES,
      DIAGNOSTICS,SDK,RISK_ASSESSMENT}.md, rules-parser.test.ts comment

## Files/code

- Modified: packages/cli/src/{utils/run.ts,utils/exit-codes.ts,commands/check.ts,
  commands/fix.ts,commands/compatibility.ts}, packages/cli/tests/exit-codes.test.ts,
  tests/e2e/{check,fix}.test.ts, tests/e2e/scan-exit-codes.test.ts (new),
  tests/integration/rules-parser.test.ts, tests/fixtures/{README.md,
  invalid-plugin,legacy-plugin,future-spec,edge-cases/unicode-names}/README.md,
  CHANGELOG.md, MEMORY.md, docs/{ARCHITECTURE,SPEC_SUPPORT,BUILDER_INTEGRATION,
  RULES,DIAGNOSTICS,SDK,RISK_ASSESSMENT}.md
- Pre-existing uncommitted worktree changes (NOT mine, do not revert): Phase
  3.2a engine ScanResult support, scanPlugin parser API, allowed-tools,
  compatibility-levels work — all already in CHANGELOG and passing.

## Errors/fixes

- JSON.stringify without indentation in e2e valid-plugin test triggered
  DOC-7001; switched to canonical 2-space + trailing newline.
- compatibility command with null plugin: previously loadPlugin threw → exit
  3; now prints parser diagnostics and returns exit 1 (SPEC_ERRORS).
- The e2e FIXTURE_EXITS table and 4 fixture READMEs still claimed exit 3 for
  schema-violation fixtures; updated to 1 with DOC-1008 after verifying real
  binary behavior.

## Verification (all green)

- bun test: 537 pass / 0 fail (69 files, incl. new scan-exit-codes e2e)
- bun run typecheck: exit 0 all 6 packages
- bun run lint: exit 0
- bunx prettier --check .: all files pass
- Self-hosting: ./packages/cli/bin/agent-plugin-doctor check . → exit 0
- Manual CLI: malformed plugin.json → DOC-1008, exit 1 (not 3); missing dir →
  "Failed to load plugin: Plugin root does not exist", exit 3; report/fix/
  compatibility on bad plugin → exit 1; fix leaves files untouched
