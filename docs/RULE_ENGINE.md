# Rule Engine Design

## Overview

The rule engine is the core of Agent Plugin Doctor's validation capability. It
provides a modular, extensible system for defining and executing validation
rules. This document describes the design as implemented in
`packages/rules/src/` (`rule.ts`, `registry.ts`, `engine.ts`, `fixes.ts`).
Architecture context lives in [docs/ARCHITECTURE.md](ARCHITECTURE.md) (ADR-003,
ADR-006); the user-facing diagnostic codes are cataloged in
[docs/DIAGNOSTICS.md](DIAGNOSTICS.md).

## Architecture

### Components

1. **Rule Interface** — Defines the contract for validation rules
2. **Rule Registry** — Manages rule registration and retrieval
3. **Validation Engine** — Executes rules and collects diagnostics
4. **Auto-Fix Engine** — Applies safe fixes to plugins

### Rule Interface

The contract lives in `packages/rules/src/rule.ts`:

```typescript
interface Rule {
  id: string; // Unique identifier, e.g. "manifest-name-pattern"
  code: string; // Stable diagnostic code (e.g., "DOC-1002")
  name: string; // Human-readable name
  category: RuleCategory; // spec | skills | mcp | security | structure | compatibility | format
  severity: Severity; // info | warning | error | critical
  supportedSpecVersions: string[]; // e.g., ["1.0.0"]; "*" means all versions
  description: string; // What the rule checks
  enabledByDefault: boolean; // Whether the rule runs by default
  files?: string[]; // Plugin-relative paths read directly in check()
  // (used by incremental validation)
  requiresPlugin?: boolean; // false = inspects only rootDir, so it can run
  // when no plugin model was loaded (scan mode); defaults to true

  check(ctx: RuleContext): Diagnostic[];
  fix?(ctx: RuleContext, diagnostic: Diagnostic): Fix | null;
}
```

The optional `files` field declares which raw plugin-relative paths the rule
reads from disk in `check()` (e.g. `"./plugin.json"` for rules that detect
parser-stripped fields). Incremental validation uses it to decide which rules
must re-run when a file changes.

The optional `requiresPlugin` field marks rules that can run without a loaded
plugin model: when `validatePlugin` is given a `ScanResult` whose manifest
could not be loaded (`plugin` null), only rules with `requiresPlugin: false`
run — they must inspect the tree via `rootDir` only and never dereference
`ctx.plugin`.

### Rule Context

```typescript
interface RuleContext {
  plugin: Plugin; // Loaded plugin
  rootDir: string; // Plugin root directory
}
```

### Rule Categories

| Category      | Code Range | Description                 |
| ------------- | ---------- | --------------------------- |
| spec          | DOC-1xxx   | Manifest & spec conformance |
| skills        | DOC-2xxx   | Skill validation            |
| mcp           | DOC-3xxx   | MCP server validation       |
| security      | DOC-4xxx   | Security auditing           |
| structure     | DOC-5xxx   | File structure              |
| compatibility | DOC-6xxx   | Client compatibility        |
| format        | DOC-7xxx   | Formatting & quality        |

Doctor ships 29 rules across the 7 categories (see
[docs/RULES.md](RULES.md) for the full catalog with rule IDs and module
locations).

## Rule Execution

### Flow

1. **Load Plugin** — `loadPlugin` parses plugin.json, mcp.json, skills
   (see [docs/SDK.md](SDK.md)). Skills that fail to load are surfaced as
   `DOC-2099` parse diagnostics in `LoadResult.parseDiagnostics` (merged
   into the rule diagnostics by the CLI pipeline) instead of being dropped
2. **Select Rules** — the engine filters by include/exclude lists, spec-version
   support, and `enabledByDefault` (`selectRules`)
3. **Execute Rules** — run each selected rule's `check()` (`runRules`)
4. **Collect Diagnostics** — normalize `ruleId`/`category`, attach fixes from
   `rule.fix()`, and sort deterministically
5. **Apply Fixes** — if requested, apply safe fixes via `applyFixes`
6. **Generate Report** — format the `ValidationResult` (human, JSON, Markdown)

### Execution Model

Rules execute **serially in declaration order**. Each rule's `check()` is
synchronous and pure with respect to the in-memory `Plugin`, so execution is
deterministic and error-isolated:

```typescript
// packages/rules/src/engine.ts (runRules)
for (const rule of rules) {
  try {
    for (const diagnostic of rule.check(ctx)) {
      // collect, attach fix via rule.fix(ctx, diagnostic)
    }
  } catch (error) {
    // emit a DOC-0000 internal error for this rule; continue with the rest
  }
}
```

Serial execution keeps diagnostics deterministic (sorted once, then stable)
and avoids ordering surprises when multiple rules touch the same file. Rules
are independent by design, so a future parallel scheduler could run categories
concurrently without changing rule contracts; this is not currently needed
because measured pipelines are far inside budget (see Performance
Considerations).

### Error Isolation

If a rule throws an exception, the engine catches it and reports a DOC-0000
internal error (`INTERNAL_ERROR_CODE`), attributing it to the failing rule.
Other rules continue executing. A DOC-0000 diagnostic drives exit code 3
(tool failure) via the CLI's exit-code contract.

## Auto-Fix System

### Fix Interface

`Fix` and `FixKind` are defined in `packages/core/src/diagnostics.ts`:

```typescript
interface Fix {
  kind: FixKind; // "replace" | "insert" | "delete" | "rename"
  file: string; // Plugin-relative path
  description: string; // What the fix does
  oldText?: string; // For replace/insert/delete
  newText?: string; // For replace/insert
  oldPath?: string; // For rename
  newPath?: string; // For rename
}
```

### Fix Application (`applyFixes`)

1. **Dry-run** — `applyFixes(rootDir, diagnostics, { dryRun: true })` computes
   results without touching the filesystem
2. **Apply** — write changes to disk in order; each fix re-reads its target
   file so earlier fixes never invalidate later ones
3. **Re-validate** — the CLI re-runs validation after `fix` to confirm

### Safety Guarantees

- Fix paths are resolved through `isWithinPath` — a fix that escapes the
  plugin root is rejected
- Fixes are **idempotent**: if the target state is already present, the fix is
  a no-op success; running `applyFixes` twice never changes a file twice
- Text replacement is exact-match with a whitespace-tolerant fallback for
  removals, and format fixes are re-derived against current file content, so
  fixes stay conflict-free in any order
- Fixes never change plugin behavior — they only repair spec/format issues

## Adding a New Rule

### Step 1: Create Rule File

```typescript
// packages/rules/src/rules/manifest/my-rule.ts
import type { Rule, RuleContext } from '../../rule.js';
import type { Diagnostic } from '@agent-plugins-doctor/core';

export const myRule: Rule = {
  id: 'my-rule',
  code: 'DOC-1XXX',
  name: 'My Rule',
  category: 'spec',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: 'Checks that...',
  enabledByDefault: true,

  check(ctx: RuleContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    // Validation logic
    return diagnostics;
  },

  fix(ctx: RuleContext, diagnostic: Diagnostic): Fix | null {
    // Fix logic (optional)
    return null;
  },
};
```

### Step 2: Register Rule

```typescript
// packages/rules/src/rules/manifest/index.ts
export * from './my-rule.js';
```

`createDefaultRegistry` picks rules up automatically when they are exported
from a category module.

### Step 3: Write Tests

```typescript
// packages/rules/tests/rules/manifest/my-rule.test.ts
import { describe, test, expect } from 'bun:test';
import { myRule } from '../../../src/rules/manifest/my-rule.js';

describe('my-rule', () => {
  test('passes for valid input', () => {
    // Test case
  });

  test('fails for invalid input', () => {
    // Test case
  });
});
```

### Step 4: Document

Add to [docs/DIAGNOSTICS.md](DIAGNOSTICS.md) and [docs/RULES.md](RULES.md):

```markdown
### DOC-1XXX: My Rule

**Severity:** error
**Category:** spec
**Autofix:** No

**Description:** ...

**Example:** ...

**Fix:** ...
```

## Performance Considerations

### Caching

- `ParsedFileCache` (parser) caches parsed files keyed by path + mtime + size;
  `loadPlugin` re-parses only changed files
- `validateIncremental` re-runs only the rules affected by changed files
  (raw-file rules by declared `files`, structure rules on any change, model
  rules when the plugin model changed) and reuses previous diagnostics

### Optimization

- Rules run against the in-memory `Plugin` object; only rules that need
  parser-stripped data read files directly (and declare them in `files`)
- Bounded traversal caps scans at 1000 files and 10 levels deep, skipping
  `.git`, `node_modules`, and hidden entries

### Benchmarking

```bash
bun test tests/benchmarks/
```

Budget assertions (the release contract):

| Size       | Budget   |
| ---------- | -------- |
| 1 skill    | < 100ms  |
| 10 skills  | < 200ms  |
| 50 skills  | < 1500ms |
| 100 skills | < 2000ms |

Measured (2026-08-07): 1-skill ~84ms, 10-skill ~2ms, 100-skill ~14ms cold, and
cached reloads are faster than cold loads by construction. The target of
< 2000ms for a 100-skill plugin is met with a wide margin.

## Extensibility

### Custom Rules

Users can register custom rules:

```typescript
import { createDefaultRegistry } from '@agent-plugins-doctor/rules';

const registry = createDefaultRegistry();
registry.register(myCustomRule);
```

### Rule Filters

Users can filter rules on the CLI:

```bash
# Run only specific rules
agent-plugins-doctor check . --rule DOC-1001,DOC-1002

# Exclude specific rules
agent-plugins-doctor check . --exclude-rule DOC-7001
```

Worked examples for all extension points (rules, spec versions, report
formats, client profiles) are in [docs/EXTENSIBILITY.md](EXTENSIBILITY.md).

## Testing Strategy

### Unit Tests

Every rule has:

- Positive test (valid input, no diagnostic)
- Negative test (invalid input, correct diagnostic)
- Edge case tests

### Integration Tests

- Rules work together without interference (`tests/integration/full-pipeline.test.ts`,
  `tests/integration/rules-parser.test.ts`)
- Exit codes are correct (`tests/e2e/`)
- Fixes are idempotent (`packages/rules/tests/fixes.test.ts`)
- The public rule surface is pinned (`tests/integration/api-stability.test.ts`)

### Fixture Tests

- All 15 fixtures in `tests/fixtures/` validate with expected diagnostics
  (each has a README explaining its purpose)

## Conclusion

The rule engine provides a modular, extensible, and performant validation
system. It supports 29 rules across 7 categories, with safe auto-fixes and
comprehensive testing (483 tests across 65 files in the full suite). The
design keeps validation deterministic, error-isolated, and incremental — ready
for both the CLI and library consumers such as Agent Plugin Builder.
