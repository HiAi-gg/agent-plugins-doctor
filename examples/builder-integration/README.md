# Builder Integration Example

Example code showing how the Builder tool integrates Agent Plugin Doctor as
a library. Every file here is runnable against this monorepo (the packages
are wired up with `workspace:*` dependencies); the same imports work unchanged
once Doctor is published to npm.

## Files

| File                         | Shows                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| `validate-after-generate.ts` | The post-generation pipeline: load → validate → report → exit code         |
| `parse-frontmatter.ts`       | Replacing Builder's regex frontmatter parsers with `parseSkillFrontmatter` |

## The integration pattern

Builder imports Doctor's packages and calls them directly after generation —
no CLI subprocess needed for programmatic checks:

```ts
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { validatePlugin } from '@agent-plugin-doctor/rules';
import { generateReport } from '@agent-plugin-doctor/report';
import { computeExitCode } from '@agent-plugin-doctor/cli';
```

1. **Load** the generated plugin with `loadPlugin(outputDir)` — it discovers
   and parses `plugin.json`, `mcp.json`, and `skills/*/SKILL.md`, enforcing
   the spec and path security (no code is ever executed).
2. **Validate** with `validatePlugin(plugin)` — all 29 rules across 7
   categories run against the loaded plugin.
3. **Report** with `generateReport(result, { format: 'human' })` (also
   `'json'` and `'markdown'`) for user-facing output.
4. **Exit** with `computeExitCode(result.diagnostics)`.

## Exit code contract

| Code | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | Valid (warnings/info allowed unless `--strict`)                                   |
| `1`  | Spec validation errors                                                            |
| `2`  | Security-critical findings                                                        |
| `3`  | Tool failure (load/parse error, internal rule failure, or Builder-side exception) |

`computeExitCode` is exported from `@agent-plugin-doctor/cli` so Builder's
process exit codes always match the Doctor CLI.

## Error handling

Wrap the whole pipeline in `try/catch`: `loadPlugin` throws `LoadError` /
`ParseError` / `SchemaValidationError` for unloadable plugins. Those become
exit code `3` (tool failure). `validatePlugin` itself does not throw for
invalid plugins — it returns diagnostics. See `validate-after-generate.ts`
for the complete pattern.

## Run it

```bash
# Type-check the examples
bunx tsc -p examples/builder-integration/tsconfig.json --noEmit

# Validate a real plugin directory
bun examples/builder-integration/validate-after-generate.ts tests/fixtures/minimal-plugin
echo "exit: $?"   # -> 0

# Feed it a broken plugin to see the 3 (tool failure) path
bun examples/builder-integration/validate-after-generate.ts tests/fixtures/invalid-plugin
echo "exit: $?"   # -> 3
```

See `docs/BUILDER_INTEGRATION.md` for the full integration contract.
