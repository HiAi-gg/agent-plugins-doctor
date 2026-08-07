# Agent Plugin Doctor — Test Fixtures

Self-contained test plugins covering the validation scenarios exercised by
unit, integration, E2E, self-hosting, builder-compatibility, and documentation
tests. Every fixture directory is an independent plugin: it can be passed
directly to `agent-plugin-doctor check <fixture>`.

## Fixture index

| Fixture | Purpose | Exit code | Key diagnostics |
| --- | --- | --- | --- |
| `minimal-plugin/` | smallest valid plugin | 0 | none |
| `complex-plugin/` | all features (full manifest, MCP, skills, extensions) | 0 | 3 infos (DOC-5003 notes.log, 2x DOC-7001) |
| `invalid-plugin/` | multiple deliberate defects | 3 | load failure (schema violations) |
| `warning-plugin/` | valid plugin with a warning | 0 (1 with `--strict`) | DOC-1004 warning |
| `security-plugin/symlink-escape/` | symlink pointing outside the root | 0 | 1 info (DOC-5003) |
| `security-plugin/embedded-secrets/` | credentials in MCP env | 2 | DOC-4003 critical |
| `security-plugin/path-traversal/` | `cwd` escaping the plugin root | 0 | none (schema-isolated) |
| `edge-cases/empty-plugin/` | minimal manifest, no components | 0 | none |
| `edge-cases/huge-description/` | description-length limits | 1 | DOC-2003 error |
| `edge-cases/max-skills/` | 100 skills (stress test) | 0 | none |
| `edge-cases/unicode-names/` | non-ASCII plugin name | 3 | load failure (schema violation) |
| `vendor-extensions/valid-extensions/` | valid reverse-domain extensions | 0 | none |
| `vendor-extensions/invalid-extensions/` | non-object `extensions` field | 0 | none (stripped per §8.1) |
| `legacy-plugin/` | `$schema` 0.9.0 (unsupported spec) | 3 | load failure |
| `future-spec/` | `$schema` 2.0.0 (unsupported spec) | 3 | load failure |
| `builder-generated/from-init/` | simulated `builder init` output | 0 | none |
| `builder-generated/from-migrate-claude/` | simulated `builder migrate --from claude` output | 0 | none |
| `builder-generated/from-migrate-cursor/` | simulated `builder migrate --from cursor` output | 0 | none |
| `builder-generated/from-create/` | simulated `builder create` output | 0 | none |

## Exit-code contract

- `0` — clean (or only warnings/info, unless `--strict`).
- `1` — spec validation errors (or a warning under `--strict`).
- `2` — security-critical findings.
- `3` — tool failure: plugin could not be loaded/parsed (e.g. manifest schema
  violations, missing `plugin.json`).

## Notes on "expected" diagnostics

Several rule codes (`DOC-1002` name pattern, `DOC-1006` author strictness,
`DOC-2001`/`DOC-2002` skill name/required fields, `DOC-3001` MCP server type,
`DOC-4001` path traversal, `DOC-6001` spec version) are implemented as rules
but are **not reachable from disk** for these fixtures: the vendored JSON
schemas enforce the same constraints first, and manifest/mcp/skill parsing
fails or isolates before the rules engine runs. Those scenarios surface as
load failures (exit 3) or silent component skips instead. Each fixture README
documents the verified behavior precisely; the fixtures are the source of
truth for what the CLI actually emits.

## Verification

```bash
# From the repository root:
./packages/cli/bin/agent-plugin-doctor check tests/fixtures/minimal-plugin      # 0
./packages/cli/bin/agent-plugin-doctor check tests/fixtures/invalid-plugin      # 3
./packages/cli/bin/agent-plugin-doctor check tests/fixtures/security-plugin/embedded-secrets  # 2
./packages/cli/bin/agent-plugin-doctor check tests/fixtures/complex-plugin      # 0
```

All credentials in the security fixtures are fake.
