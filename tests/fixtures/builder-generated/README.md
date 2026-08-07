# Builder-Generated Fixtures

Simulated output of Builder's plugin-generation commands, used to test the
Builder integration contract (Phase 12/13). Builder does not yet consume
Doctor directly — these fixtures represent the shape of plugins Builder is
expected to produce today, so Doctor can prove it validates them cleanly.

Each fixture maps to one Builder command:

| Fixture | Builder command | Contents | Expected exit code |
| --- | --- | --- | --- |
| `from-init/` | `builder init` | minimal manifest + one example skill | 0 |
| `from-migrate-claude/` | `builder migrate --from claude` | migrated metadata + skill + migrated stdio MCP | 0 |
| `from-migrate-cursor/` | `builder migrate --from cursor` | migrated metadata + skill, no MCP | 0 |
| `from-create/` | `builder create` | scaffolded manifest + custom skill + stdio MCP | 0 |

## Contract under test

1. Every Builder-generated plugin loads with `loadPlugin` and validates with
   `validatePlugin` with zero error/critical diagnostics (exit 0).
2. `parseSkillFrontmatter` handles every frontmatter shape Builder emits
   (plain, metadata maps, space-separated `allowed-tools` strings).
3. The exit-code contract (0=valid, 1=errors, 2=security-critical,
   3=tool failure) matches Builder's expectations.

## Verification

```bash
for dir in tests/fixtures/builder-generated/*/; do
  echo "Testing $dir"
  ./packages/cli/bin/agent-plugins-doctor check "$dir"
done
```

Each fixture must exit `0`. The fixtures are byte-exact inputs (see
`.prettierignore`): JSON is in Doctor's canonical form and frontmatter follows
the documented style so the generated output is pristine, not merely valid.
