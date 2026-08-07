# from-migrate-cursor

Simulated output of Builder's `builder migrate --from cursor` command: an
existing Cursor project (`.cursor/rules/*.mdc`, `.cursor/settings.json`)
converted into an Agent Plugin.

## What Builder generated

- `plugin.json` — manifest with migrated metadata: `description` from the
  project, `author` from the Cursor account, `homepage` and `license` carried
  over.
- `skills/cursor-helper/SKILL.md` — the project's `.cursor` agent rules
  consolidated into a skill.
- No `mcp.json` — Cursor manages model configuration rather than MCP servers,
  so there is nothing to migrate. Builder must not emit an empty `mcp.json`.

## Integration contract

This fixture must load with `loadPlugin` and validate with `validatePlugin`
producing zero error/critical diagnostics, and `agent-plugin-doctor check .`
must exit `0`.

## Expected result

```
agent-plugin-doctor check tests/fixtures/builder-generated/from-migrate-cursor
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`).
