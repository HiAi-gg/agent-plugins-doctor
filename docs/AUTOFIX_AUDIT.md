# Autofix Audit

This document records the audit of all autofixes in Agent Plugin Doctor
(session: 2026-08-07). Every rule that provides a `fix()` was reviewed against
seven criteria, exercised through the real fix pipeline by
`tests/integration/autofix-idempotence.test.ts`, and any defects found were
fixed and documented in [CHANGELOG.md](../CHANGELOG.md).

## Audit Criteria

All autofixes must be:

- **Deterministic** — the same input always produces the same output.
- **Idempotent** — applying the fix twice equals applying it once; after one
  pass a reloaded plugin has nothing left to fix, and a second `applyFixes`
  run is a byte-identical no-op.
- **Minimal** — only the text needed to fix the issue is changed.
- **Format-preserving** — unrelated formatting (indentation, whitespace,
  quoting) is untouched unless the fix is itself a formatting fix.
- **Semantically safe** — plugin behavior is never changed beyond the fix's
  stated purpose.
- **Security-conscious** — fixes never delete user data and never "fix"
  security findings. Security rules (`DOC-4001`/`DOC-4002`/`DOC-4003`)
  produce **no fixes** by design.
- **Standard-compliant** — fixes never transform standard-conformant syntax
  into a project-preferred form (e.g. `allowed-tools` YAML lists are only
  warned about, never converted).

## Autofix Inventory

Reachability: **disk** rules fire against an on-disk plugin via the CLI/SDK
load path; **SDK** rules are shadowed by parser schema validation and can only
be produced by validating an in-memory `Plugin` (see
[DIAGNOSTICS.md](DIAGNOSTICS.md#diagnostic-reachability)).

| Rule                            | Code     | Kind                        | Deterministic | Idempotent | Minimal | Notes                                                                                                                                                  |
| ------------------------------- | -------- | --------------------------- | ------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| manifest-name-pattern           | DOC-1002 | value rewrite               | ✓             | ✓          | ✓       | SDK. Rewrites only the `name` value token; whitespace-tolerant; skipped when the file is missing or the value no longer matches the in-memory name     |
| manifest-unknown-fields         | DOC-1004 | member removal              | ✓             | ✓          | ✓       | Disk. Removes exactly the unknown member, preserving every other byte                                                                                  |
| manifest-author-strictness      | DOC-1006 | member removal              | ✓             | ✓          | ✓       | SDK. Removes only the disallowed author field                                                                                                          |
| manifest-schema-match           | DOC-1007 | value rewrite               | ✓             | ✓          | ✓       | SDK. Rewrites only the `$schema` value token; whitespace-tolerant                                                                                      |
| skill-name-match                | DOC-2001 | directory rename            | ✓             | ✓          | ✓       | Disk. Renames the skill directory; a duplicate rename to the same target is a no-op                                                                    |
| skill-allowed-tools-format      | DOC-2005 | whitespace normalize        | ✓             | ✓          | ✓       | Disk. Normalizes whitespace in the string form only; quoted values and list forms are never touched (no semantic conversion)                           |
| mcp-reserved-env-keys           | DOC-3003 | member removal              | ✓             | ✓          | ✓       | SDK. Removes the reserved env key only                                                                                                                 |
| mcp-header-validation           | DOC-3006 | member removal              | ✓             | ✓          | ✓       | Disk. Removes duplicate headers, keeping the first; each duplicate diagnostic targets its own span, so 3+ case-variant duplicates converge in one pass |
| structure-skill-directory-name  | DOC-5002 | directory rename            | ✓             | ✓          | ✓       | Disk. Renames to a valid name; skipped when the target name is itself invalid                                                                          |
| compatibility-deprecated-fields | DOC-6002 | key rename / member removal | ✓             | ✓          | ✓       | SDK. Factory with an empty default map (v1.0.0 deprecates nothing); renames the key in place or removes the member                                     |
| format-json-formatting          | DOC-7001 | whole-file reformat         | ✓             | ✓          | ✓       | Disk. Canonical 2-space formatting + trailing newline; a reformat is the fix, so whole-file change is intended; re-derived against current content     |
| format-frontmatter-style        | DOC-7002 | text normalize              | ✓             | ✓          | ✓       | Disk. BOM/CRLF/trailing-whitespace normalization limited to the frontmatter region; the markdown body is preserved byte-for-byte                       |

Security rules (`DOC-4001` path traversal, `DOC-4002` symlink escape,
`DOC-4003` embedded secrets) are **critical** and ship **no autofix**:
Doctor never deletes user data and never rewrites security-sensitive content.

## Fix Engine Properties

The engine (`packages/rules/src/fixes.ts`) makes the individual rules'
properties hold globally:

- Every replace fix is matched against the _current_ file content (each fix
  re-reads its target), and member removals are whitespace-tolerant, so fixes
  survive reformatting by earlier fixes in the same pass.
- JSON member removal spans exclude separator commas; the engine cleans up
  the surrounding comma when applying. This keeps removals order-independent:
  several members of one object can be removed in any order and converge to
  the same result (and to valid JSON).
- Directory renames are applied **last** (stable sort), so a content fix on a
  file inside a renamed directory always runs against the path it was
  computed for and never fails with ENOENT.
- A fix whose target state is already present is a no-op success
  (`applied: false`), which is what makes repeated runs idempotent at the
  byte level.
- All fixes are confined to the plugin root (`isWithinPath`); a fix that
  escapes is refused.
- Renames refuse to overwrite an existing path.

## Issues Found

### Issue 1: DOC-3006 broke idempotence with three or more case-variant duplicates

- **Rule:** `mcp-header-validation` (DOC-3006).
- **Problem:** the fix resolved the target member with a case-insensitive
  lookup (`span.key.toLowerCase() === header.toLowerCase()`). With headers
  like `Authorization` / `authorization` / `AUTHORIZATION`, the diagnostics
  for `authorization` and `AUTHORIZATION` both targeted the _same_ span, so
  one fix silently no-op'd and a duplicate remained fixable after one pass.
- **Fix:** match the exact key (`span.key === header`) so each diagnostic
  targets its own span; one pass removes every duplicate, keeping the first.
- **Test:** `three case-variant duplicate headers converge in one pass
(regression)` in the integration suite plus a unit regression in
  `packages/rules/tests/rules/mcp/header-validation.test.ts`.

### Issue 2: rename fixes stranded content fixes on ENOENT paths

- **Rules:** `skill-name-match` (DOC-2001), `structure-skill-directory-name`
  (DOC-5002), with `format-frontmatter-style` (DOC-7002) /
  `skill-allowed-tools-format` (DOC-2005).
- **Problem:** `applyFixes` applied fixes in diagnostic order. When a
  directory rename ran before a content fix on a file inside that directory,
  the content fix failed with `ENOENT` ("Cannot read skills/<old>/SKILL.md")
  and its diagnostic remained fixable after one pass.
- **Fix:** `applyFixes` now applies rename fixes **last** (stable sort), so
  content fixes always run against the paths they were computed for.
- **Test:** `rename and content fixes on one skill converge in one pass
(regression)` in the integration suite plus a unit regression in
  `packages/rules/tests/fixes.test.ts`.

### Issue 3: DOC-1002 / DOC-1007 fixes were fragile textual guesses

- **Rules:** `manifest-name-pattern` (DOC-1002), `manifest-schema-match`
  (DOC-1007).
- **Problem:** both fixes built `oldText` from the in-memory value as
  `"key": <value>` and replaced it textually. A schema-valid file with odd
  spacing (`"name" :  "My Plugin!"`) would fail the match, and a nested
  member named `name` (e.g. `author.name`) could be rewritten by mistake.
- **Fix:** both rules now locate the top-level member with the JSON member
  scanner (path-aware, whitespace-tolerant) and rewrite **only the value
  token**, preserving every other byte. They are also skipped when the file
  is missing or the on-disk value no longer matches the in-memory model, so a
  stale model never keeps offering fixes.
- **Test:** `DOC-1002 ... (SDK path)`, `formatting is preserved by targeted
fixes (SDK path)` in the integration suite; unit tests updated in
  `packages/rules/tests/rules/manifest/name-pattern.test.ts`.

No other autofix failed any criterion. In particular: DOC-1004, DOC-2001,
DOC-2005, DOC-3003, DOC-5002, DOC-6002, DOC-7001, and DOC-7002 were already
deterministic, minimal, format-preserving, and idempotent before this audit;
they are now locked in by the integration suite.

## Diagnostic Message Audit

Every diagnostic produced by the 30 rules was reviewed (38 `makeDiagnostic`
call sites) against the five questions:

- **What is wrong?** Every message states the problem concretely, naming the
  offending server/skill/field and value (e.g. `MCP server "remote" declares
duplicate header "authorization" (case-insensitive)`,
  `Skill "x" description is 500 characters, exceeding the maximum of 300`).
- **Where is it?** Every diagnostic carries a plugin-relative `file` path
  (`./plugin.json`, `./mcp.json`, `skills/<dir>/SKILL.md`, extension paths).
  Security findings point at the offending file as well.
- **Why does it matter?** Messages include the violated constraint or its
  consequence (limits, spec references, `escapes the plugin root`, `value
redacted`); the full rationale per code lives in DIAGNOSTICS.md.
- **How to fix it?** 12 of 30 rules attach an executable `fix`; every other
  code documents its manual fix in DIAGNOSTICS.md (e.g. "shorten the
  description", "split the skill").
- **Source/rule?** Every diagnostic carries `code` (DOC-xxxx), `ruleId`, and
  `category`, so output always identifies the producing rule.

**Line/column support:** no rule emits `range`; diagnostics carry
plugin-relative `file` paths only. This is already documented truthfully in
`docs/SPEC_SUPPORT.md` ("No rule currently emits `range`") and the human
report falls back to the bare file path. No claims of line/column support
exist to remove; adding ranges remains future work (desirable, not P0).

## Test Coverage

`tests/integration/autofix-idempotence.test.ts` (18 tests):

- Full load → validate → apply → reload → validate loop for every
  disk-reachable autofix (DOC-1004, DOC-2001, DOC-2005, DOC-3006, DOC-5002,
  DOC-7001, DOC-7002), asserting zero fixable diagnostics remain and a second
  application is a no-op.
- Byte-level double-apply for every SDK-only autofix (DOC-1002, DOC-1006,
  DOC-1007, DOC-3003, DOC-6002 rename and removal), plus a re-validation
  assertion that a stale in-memory model stops offering fixes.
- Determinism: identical inputs in two fresh directories converge to
  byte-identical outputs.
- Convergence: multiple fixes on the same files (unknown field + reformat,
  duplicate headers + reformat, rename + frontmatter + allowed-tools) all
  apply in a single pass with zero failures.
- Regressions for Issues 1–3 and formatting preservation.

## Conclusion

All 12 autofixes pass the audit. Three defects were found and fixed (the two
idempotence bugs and the two fragile textual rewrites), each with unit and
integration regression coverage. The fix engine now guarantees
order-independent removals and rename-last ordering, and the full suite
(578 tests) documents the guarantees.

Related verification commands (all exit 0):

```bash
bun test tests/integration/autofix-idempotence.test.ts
bun test
bun run typecheck
bun run lint
bunx prettier --check .
./packages/cli/bin/agent-plugins-doctor check .
```
