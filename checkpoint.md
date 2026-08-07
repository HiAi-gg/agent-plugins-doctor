# Checkpoint — Phase 16-17: Performance, Extensibility, and Release

## Active intent

Phase 16-17 for Agent Plugin Doctor: parser caching + bounded traversal +
incremental validation, performance benchmarks, extensibility docs
(ARCHITECTURE, COMPATIBILITY, EXTENSIBILITY), release preparation
(RELEASING.md, CHANGELOG v0.1.0), and documentation of the git-tag process.
All quality gates green.

## Next action

None pending. Follow-ups if desired: publish to npm (blocked until tagged —
see docs/RELEASING.md), and keep the benchmark budgets in mind when adding
rules (each new rule must not push 1-skill cold load over 100ms).

## Task tree

- [x] Fix pre-existing self-hosting failure: checkpoint.md/notes.md → structure-extra-files whitelist
- [x] Parser caching: ParsedFileCache (cache.ts) + LoadOptions wired into loadPlugin
- [x] Bounded traversal: walkPluginFiles + constants (traverse.ts); loader discovery skips hidden/system entries
- [x] Incremental validation: Rule.files?, ValidationEngine.validateIncremental/runRules, validateIncremental free fn
- [x] `files` declarations on 4 raw-file rules (unknown-fields, author-strictness, deprecated-fields, json-formatting)
- [x] Tests: cache.test.ts (8), traverse.test.ts (6), incremental.test.ts (9)
- [x] Benchmarks: tests/benchmarks/benchmark.ts + benchmark.test.ts (5) — budgets enforced
- [x] docs/ARCHITECTURE.md, docs/COMPATIBILITY.md, docs/EXTENSIBILITY.md, docs/RELEASING.md
- [x] CHANGELOG.md rewritten for v0.1.0; AGENTS.md release checklist → RELEASING.md; README doc links
- [x] SDK.md updated (parser LoadOptions/ParsedFileCache/walkPluginFiles; rules validateIncremental/runRules/files)
- [x] api-stability.test.ts pins new exports
- [x] EXTENSIBILITY example compile-verified (temp rule + test, then removed; DOC-2007 is free)

## Files/code

- Created: packages/parser/src/{cache,traverse}.ts, packages/rules/tests/incremental.test.ts,
  packages/parser/tests/{cache,traverse}.test.ts, tests/benchmarks/{benchmark.ts,benchmark.test.ts},
  docs/{ARCHITECTURE,COMPATIBILITY,EXTENSIBILITY,RELEASING}.md
- Modified: packages/parser/src/{index,plugin-loader}.ts, packages/rules/src/{rule,engine}.ts,
  4 raw-file rules, packages/rules/src/rules/structure/extra-files.ts,
  tests/integration/api-stability.test.ts, CHANGELOG.md, AGENTS.md, README.md,
  docs/SDK.md, MEMORY.md

## Errors/fixes

- ParsedFileCache generic default `unknown` → boundary casts in loader helpers (manifest/mcp/skill).
- Lint: unused `options` param on runRules → removed; unused `Plugin` import in incremental.test.ts.
- Prettier: 7 files (3 docs + 4 ts) auto-fixed.
- traverse.test.ts ordering: walker uses localeCompare (case-insensitive) so scripts/run.sh < SKILL.md.
- cache.test.ts: mkdirSync missing import; skill parent dir must be created before writeFileSync.
- incremental.test.ts: manifest() needed trailing newline (DOC-7001); JSON replace() regex broke on trailing newline → rebuild object.
- bun test does not discover benchmark.ts (filename must contain .test/.spec) → paired benchmark.test.ts.
- EXTENSIBILITY example initially used nonexistent makeTestPlugin → corrected to makePlugin/makeSkill.
- SDK.md section renumbering after inserting 3.2/3.3 (createDefaultRegistry 3.4→3.5, Rule 3.5→3.6, applyFixes 3.6→3.7, INTERNAL_ERROR_CODE 3.7→3.8).

## Verification (all green)

- bun test: 483 pass / 0 fail (65 files) — was 455/61 at baseline
- bun run typecheck: exit 0 all 6 packages
- bun run lint: exit 0
- bunx prettier --check .: all matched files pass
- Self-hosting: ./packages/cli/bin/agent-plugin-doctor check . → exit 0
- bun run build: exit 0 all 6 packages
- bun test tests/benchmarks/: 5 pass; benchmarks: 1-skill 80ms, 10-skill 2ms, 100-skill 9ms (budgets 100/200/2000ms); whole file < 10s
- EXTENSIBILITY rule example compiled + passed its tests (temp files removed after)
