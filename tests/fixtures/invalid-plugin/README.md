# invalid-plugin

A deliberately broken plugin containing multiple independent errors, used to
test error detection. Each component violates the spec in a different way.

## What it tests

This fixture packs in five distinct defects:

| Component | Defect |
| --- | --- |
| `plugin.json` | `name: "Invalid-Name"` (uppercase, fails NAME_PATTERN) |
| `plugin.json` | `author.invalidField` (unknown author field) |
| `plugin.json` | `unknownField` (unknown top-level field, §5.2) |
| `mcp.json` | `bad-server` with `type: "invalid-type"` and empty `command` |
| `skills/bad-skill` | frontmatter name `wrong-name` mismatches directory and lacks `description` |

## Expected result

```
agent-plugin-doctor check tests/fixtures/invalid-plugin
```

Exit code: `1` (validation error)

Output (stdout):

```
ERROR DOC-1008
plugin.json
```

### Why exit 1 and not exit 3

The vendored plugin.schema.json enforces the same constraints that the rules
package would otherwise check, and manifest validation is **fatal to the
manifest** — but the CLI loads plugins via `scanPlugin`, which never throws:

- `name` has a schema-level `pattern`/`maxLength`, so `Invalid-Name` is a
  **schema violation** (the rule `manifest-name-pattern` / `DOC-1002` is a
  defense-in-depth check that only runs when a manifest reaches the rules
  engine — e.g. built programmatically).
- `author` has `additionalProperties: false`, so `author.invalidField` is a
  **schema violation** (`manifest-author-strictness` / `DOC-1006` is likewise
  unreachable from disk: the parser rejects the manifest first).
- `plugin.json` failures leave the plugin model null, but scanning continues,
  so every violation is reported as a `DOC-1008` parser diagnostic (exit 1)
  instead of stopping with a thrown load error (exit 3). For reference, if
  the manifest loaded:

  - `unknownField` would be stripped non-fatally and reported as `DOC-1004`
    (warning) — see `warning-plugin`.
  - `bad-server` in mcp.json would be **skipped** by per-server failure
    isolation (§7.2.2); `mcp-server-type` / `DOC-3001` never sees it.
  - `skills/bad-skill` would be **skipped**: `parseSkillFrontmatter` rejects a
    skill without `description` (a required field), so `DOC-2002`/`DOC-2001`
    never fire from disk for this file.

Use this fixture to test the **parser-diagnostic path** (exit 1, `DOC-1008`
in the report). Use `warning-plugin` for the DOC-1004 warning path.

## Setup

None required. Self-contained fixture.
