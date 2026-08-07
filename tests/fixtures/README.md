# Agent Plugin Doctor — Test Fixtures

Self-contained test plugins covering the validation scenarios exercised by
unit, integration, E2E, self-hosting, builder-compatibility, and documentation
tests. Every fixture directory is an independent plugin: it can be passed
directly to `agent-plugins-doctor check <fixture>`.

## Fixture index

| Fixture | Purpose | Exit code | Key diagnostics |
| --- | --- | --- | --- |
| `minimal-plugin/` | smallest valid plugin | 0 | none |
| `allowed-tools-canonical/` | canonical space-separated `allowed-tools` string | 0 | none |
| `allowed-tools-invalid/` | non-string `allowed-tools` type (number) | 1 | DOC-2005 error |
| `complex-plugin/` | all features (full manifest, MCP, skills, extensions) | 0 | 3 infos (DOC-5003 notes.log, 2x DOC-7001) |
| `invalid-plugin/` | multiple deliberate defects | 1 | DOC-1008 errors (schema violations) |
| `warning-plugin/` | valid plugin with a warning | 0 (1 with `--strict`) | DOC-1004 warning |
| `security-plugin/symlink-escape/` | symlink pointing outside the root | 0 | 1 info (DOC-5003) |
| `security-plugin/embedded-secrets/` | credentials in MCP env | 2 | DOC-4003 critical |
| `security-plugin/path-traversal/` | `cwd` escaping the plugin root | 0 | none (schema-isolated) |
| `edge-cases/empty-plugin/` | minimal manifest, no components | 0 | none |
| `edge-cases/huge-description/` | description-length limits | 1 | DOC-2003 error |
| `edge-cases/max-skills/` | 100 skills (stress test) | 0 | none |
| `edge-cases/unicode-names/` | non-ASCII plugin name | 1 | DOC-1008 error (schema violation) |
| `vendor-extensions/valid-extensions/` | valid reverse-domain extensions | 0 | none |
| `vendor-extensions/invalid-extensions/` | non-object `extensions` field | 0 | none (stripped per §8.1) |
| `legacy-plugin/` | `$schema` 0.9.0 (unsupported spec) | 1 | DOC-1008 error |
| `future-spec/` | `$schema` 2.0.0 (unsupported spec) | 1 | DOC-1008 error |
| `builder-generated/from-init/` | simulated `builder init` output | 0 | none |
| `builder-generated/from-migrate-claude/` | simulated `builder migrate --from claude` output | 0 | none |
| `builder-generated/from-migrate-cursor/` | simulated `builder migrate --from cursor` output | 0 | none |
| `builder-generated/from-create/` | simulated `builder create` output | 0 | none |
| `builder-generated/real-builder/init/` | real Builder `init` output (commit 7a0b9bd8) | 0 | none |
| `builder-generated/real-builder/create-skills/` | real Builder `create --skills-only` output | 0 | none |
| `builder-generated/real-builder/create-mcp/` | real Builder `create --mcp-only` output | 0 | none |
| `builder-generated/real-builder/migrate-claude/` | real Builder `migrate --from claude` output | 0 | none |
| `builder-generated/real-builder/migrate-cursor/` | real Builder `migrate --from cursor` output | 0 | none |

## Exit-code contract

- `0` — clean (or only warnings/info, unless `--strict`).
- `1` — spec validation errors (or a warning under `--strict`), including
  parser diagnostics: a manifest that could not be loaded (`DOC-1008`), a
  skill that failed to load (`DOC-2099`), or an invalid `mcp.json`
  (`DOC-3007`).
- `2` — security-critical findings.
- `3` — tool failure: the plugin root is inaccessible (missing directory), an
  internal rule failed (`DOC-0000`), or an unexpected exception.

## Notes on "expected" diagnostics

Several rule codes (`DOC-1002` name pattern, `DOC-1006` author strictness,
`DOC-2001`/`DOC-2002` skill name/required fields, `DOC-3001` MCP server type,
`DOC-4001` path traversal, `DOC-6001` spec version) are implemented as rules
but are **not reachable from disk** for these fixtures: the vendored JSON
schemas enforce the same constraints first, and manifest/mcp/skill parsing
fails or isolates before the rules engine runs. Those scenarios surface as
`DOC-1008`/`DOC-2099`/`DOC-3007` parser diagnostics (exit 1) or silent
component skips instead. Each fixture README documents the verified behavior
precisely; the fixtures are the source of truth for what the CLI actually
emits.

## Verification

```bash
# From the repository root:
./packages/cli/bin/agent-plugins-doctor check tests/fixtures/minimal-plugin      # 0
./packages/cli/bin/agent-plugins-doctor check tests/fixtures/invalid-plugin      # 1
./packages/cli/bin/agent-plugins-doctor check tests/fixtures/security-plugin/embedded-secrets  # 2
./packages/cli/bin/agent-plugins-doctor check tests/fixtures/complex-plugin      # 0
```

All credentials in the security fixtures are fake.
