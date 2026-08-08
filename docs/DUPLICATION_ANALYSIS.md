# Duplication Analysis

> **Historical record (2026-08-07).** This analysis was written for the
> pre-release v0.1.0 plan; Doctor was released as **0.0.6** (see
> [CHANGELOG.md](../CHANGELOG.md)). The analysis and migration timeline below
> are kept intact for reference.

## Overview

This document analyzes duplication between Agent Plugin Doctor and Agent Plugin
Builder, and how it has been eliminated or will be eliminated through
integration. The integration contract is documented in
[docs/BUILDER_INTEGRATION.md](BUILDER_INTEGRATION.md); the product boundaries
("Builder creates, Doctor validates") are recorded as ADR-002 in
[docs/ARCHITECTURE.md](ARCHITECTURE.md).

The Builder-side facts below were verified against the Builder repository at
`agent_plugin_builder` (commit in the research phase, session
`ses_023e29522ffeE71XvDdKWBte7g`).

## Historical Duplication (Eliminated)

### Frontmatter Parsing

**Before:** Builder had 6 simplified regex-based frontmatter parsers across:

- `packages/sources/src/claude/index.ts`
- `packages/sources/src/cursor/index.ts`
- `packages/sources/src/vscode/index.ts`
- `packages/sources/src/opencode/index.ts`
- `packages/cli/src/commands/package.ts`
- `packages/cli/src/commands/inspect.ts`

Each extracted `name`/`description` with a hand-rolled loop and
`/^name:\s*(.+)$/m`-style regexes. (Builder's `codex` source is not a
frontmatter parser — it parses MCP `config.toml` — so it is not part of this
duplication.)

**After:** Doctor provides a single canonical implementation:

- `@agent-plugins-doctor/parser` → `parseSkillFrontmatter()`
- Uses gray-matter for robust YAML parsing
- Handles all edge cases (quoted strings, multiline, colons)

**Status:** Doctor implementation complete. Builder migration pending
(Phase 12-13 of Builder's roadmap, tracked in
[docs/ROADMAP.md](ROADMAP.md)).

### Name Pattern Validation

**Before:** Builder had divergent validation:

- Plugin name pattern in `packages/core/src/schemas/plugin.ts` (zod `.regex`)
- Skill name pattern in `packages/core/src/schemas/skill.ts` (zod `.regex`)
- Loose validation in `packages/cli/src/commands/init.ts` —
  `/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/` (allows consecutive `--`/`..`)

**After:** Doctor provides canonical patterns:

- `NAME_PATTERN` in `packages/core/src/spec/v1/index.ts`
- `SKILL_NAME_PATTERN` in `packages/core/src/spec/v1/index.ts`
- Enforced consistently across all validation

The zod schemas in Builder's `plugin.ts`/`skill.ts` already match Doctor's
patterns exactly (they were written from the same spec), so this duplication is
small; the loose `init.ts` validation is the real divergence. Builder should
import the patterns from Doctor so the interactive prompt and the schema share
one source of truth.

**Status:** Doctor implementation complete. Builder migration pending.

### Schema URLs

**Before:** Builder defined schema URLs in
`packages/core/src/spec/v1/index.ts`.

**After:** Doctor defines canonical schema URLs:

- `PLUGIN_SCHEMA_URL` in `packages/core/src/spec/v1/index.ts`
- `MCP_SCHEMA_URL` in `packages/core/src/spec/v1/index.ts`
- Vendored schemas in `packages/parser/src/schemas/` (byte-exact copies, never
  fetched at runtime — spec §4.1)

**Status:** Doctor implementation complete. Builder should import from Doctor.

### Path Utilities

**Before:** Builder had path utilities in `packages/core/src/path.ts`
(`resolvePluginPath`, `isWithinPath`, plus a `normalizePath` helper).

**After:** Doctor provides canonical path utilities:

- `resolvePluginPath()` in `packages/core/src/path.ts`
- `isWithinPath()` in `packages/core/src/path.ts`
- Security boundary with symlink escape detection (see ADR-005 in
  [docs/ARCHITECTURE.md](ARCHITECTURE.md))

**Status:** Doctor implementation complete. Builder should import from Doctor.

## Current Duplication (To Be Eliminated)

### Validation Logic

**Current State:**

- Builder has shallow validation in `packages/cli/src/commands/package.ts`
  (file existence + JSON parse + schema checks)
- No security auditing
- No compatibility checking

**Target State:**

- Builder imports `validatePlugin()` from Doctor
- Builder's `package` command calls Doctor's validation
- All validation logic lives in Doctor

**Migration Path:**

1. Builder adds Doctor as dependency
2. Builder's `package` command calls `validatePlugin()`
3. Builder removes inline validation code
4. Builder's tests verify Doctor integration

**Timeline:** After Doctor v0.1.0 is published to npm (see
[docs/ROADMAP.md](ROADMAP.md)).

### Type Definitions

**Current State:**

- Builder defines `PortablePlugin` in `packages/core/src/types.ts`
- Doctor defines `Plugin` in `packages/core/src/types.ts`
- Similar but not identical

**Target State:**

- Doctor's `Plugin` is canonical for validation
- Builder's `PortablePlugin` remains for authoring
- Clear mapping between the two at the boundary

**Migration Path:**

1. Document the mapping clearly
2. Builder imports Doctor's types where appropriate
3. No duplicate validation types

**Timeline:** Ongoing.

## Duplication Prevention

### Rules

1. **Doctor owns validation** — Builder never reimplements validation logic
2. **Doctor owns diagnostics** — Builder never defines diagnostic IDs
3. **Builder owns generation** — Doctor never generates project files
4. **Shared types** — Both import from Doctor's core where appropriate

### Enforcement

- AGENTS.md documents the boundaries
- PR reviews check for duplication
- Integration tests verify the contract (`tests/integration/builder-contract.test.ts`,
  `tests/fixtures/builder-generated/`)

## Benefits of Elimination

1. **Single source of truth** — Validation logic lives in one place
2. **Consistent behavior** — Same validation everywhere
3. **Easier maintenance** — Fix bugs once, not twice
4. **Better testing** — Comprehensive test suite in Doctor (483 tests)
5. **Clearer responsibilities** — Builder creates, Doctor validates

## Risks of Not Eliminating

1. **Drift** — Implementations diverge over time
2. **Inconsistency** — Different tools validate differently
3. **Maintenance burden** — Fix bugs in multiple places
4. **Confusion** — Users don't know which tool to trust

## Conclusion

Doctor has eliminated duplication by providing canonical implementations of:

- Frontmatter parsing
- Name pattern validation
- Schema URLs
- Path utilities
- Validation logic

Builder migration is pending Doctor v0.1.0 publication. The integration
contract is documented in [docs/BUILDER_INTEGRATION.md](BUILDER_INTEGRATION.md).
