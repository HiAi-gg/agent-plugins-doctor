# Ecosystem Audit Fixes

This document tracks fixes for issues identified in the independent ecosystem audit of Agent Plugin Doctor.

## Status Summary

| Finding                             | Status      | Fix                                        | Regression                                     |
| ----------------------------------- | ----------- | ------------------------------------------ | ---------------------------------------------- |
| ECO-002 — Duplicate Frontmatter     | ✅ FIXED    | DOC-7003 rule (severity: error, exit 1)    | 16 unit tests + 2 E2E tests                    |
| ECO-006 — Release Publishing        | ✅ RESOLVED | npm 0.0.4 published, OIDC CI working       | Version integrity check script                 |
| ECO-010 — Public SDK Types          | ✅ FIXED    | isPluginLoadError exported, .d.ts vendored | External consumer test                         |
| DV-003 — Public npm Publication     | ✅ RESOLVED | npm serves 0.0.4 as latest                 | bunx/npx resolution verified                   |
| DV-011 — Release Artifact Integrity | ⚠️ PARTIAL  | v0.0.4 consistent, v0.0.5 needs attention  | Version integrity script gates future releases |

## ECO-002: Duplicate Frontmatter Detection

**Problem:** Doctor silently accepted SKILL.md files with duplicate YAML frontmatter blocks.

**Fix:** Added DOC-7003 `format-duplicate-frontmatter` rule with severity `error`.

**Implementation:**

- Rule: `packages/rules/src/rules/format/duplicate-frontmatter.ts`
- Detection: Code-fence-aware scanning for duplicate `---...---` blocks
- Severity: `error` (exit 1)
- No autofix (removing blocks is destructive)

**Tests:**

- 16 unit tests covering all scenarios
- 2 E2E regression tests
- Fixtures: `tests/fixtures/duplicate-frontmatter/`, `tests/fixtures/valid-with-horizontal-rule/`

**Verification:**

```bash
bun test packages/rules/tests/rules/format/duplicate-frontmatter.test.ts
bun test tests/integration/duplicate-frontmatter-e2e.test.ts
./packages/cli/bin/agent-plugins-doctor check tests/fixtures/duplicate-frontmatter
# Expected: exit 1, DOC-7003
```

## ECO-006: Release Publishing

**Problem:** GitHub Release v0.0.4 existed but npm publication failed.

**Fix:**

- Fixed OIDC Trusted Publisher configuration (added `environment: npm-publish` + `setup-node`)
- npm 0.0.4 successfully published
- bunx/npx resolve correctly

**Verification:**

```bash
npm view @hiai-gg/agent-plugins-doctor version
# 0.0.4

bunx @hiai-gg/agent-plugins-doctor --version
# 0.0.4
```

**Note:** v0.0.5 tag exists but was never version-bumped or published. Future releases should use the version integrity check.

## ECO-010: Public SDK Types

**Problem:** Public SDK had broken TypeScript types — imports failed, .d.ts referenced monorepo paths.

**Fix:**

- Exported `isPluginLoadError` from `@agent-plugins-doctor/cli`
- Added `commander` peerDependency to npm umbrella package
- Vendored SDK .d.ts into `dist/vendor/` with rewritten imports
- CLI version now sourced from package.json (no hardcoded literal)

**Tests:**

- `tests/integration/api-stability.test.ts` — 8 tests
- `tests/integration/external-consumer.test.ts` — 4 tests (packs npm tarball, installs, verifies tsc)

**Verification:**

```bash
bun test tests/integration/external-consumer.test.ts
# External consumer: tsc --noEmit exit 0, skipLibCheck:false exit 0
```

## DV-003: Public npm Publication

**Status:** RESOLVED (→ ECO-006)

npm now serves 0.0.4 as latest. Both bunx and npx resolve correctly.

## DV-011: Release Artifact Integrity

**Status:** PARTIALLY RESOLVED

**Issue:** v0.0.5 tag exists on GitHub but:

- All package.json files at v0.0.5 still say version 0.0.4
- v0.0.5 was never published to npm
- GitHub shows v0.0.5 as "Latest" but npm max is 0.0.4

**Resolution:**

- Version integrity check script (`scripts/check-version-integrity.ts`) gates future releases
- Run `bun run check:versions` before any release
- Next release should be 0.0.6 with proper version bump including DOC-7003

**Verification:**

```bash
bun run check:versions
# Should exit 0 if all versions agree
```

## Release Gate Checklist

Before next release, verify:

- [ ] All versions agree: `bun run check:versions`
- [ ] DOC-7003 included in CHANGELOG
- [ ] Version bumped in all package.json files
- [ ] npm publish succeeds
- [ ] GitHub Release matches npm version
- [ ] bunx/npx resolve the new version

## Collection CI Command

For validating plugins in CI:

```bash
npx @hiai-gg/agent-plugins-doctor check plugins/<plugin-name>
```

Exit codes:

- 0 = valid
- 1 = spec errors
- 2 = security-critical
- 3 = tool failure

The npm package is self-contained (Node ≥ 18, no Bun required).
