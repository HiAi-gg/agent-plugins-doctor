# from-init

Simulated output of Builder's `builder init` command: the smallest scaffold a
user gets when starting a new plugin from nothing.

## What Builder generated

- `plugin.json` — minimal manifest with only the two required fields
  (`$schema` and `name`). Builder fills these from the project name the user
  typed.
- `skills/example/SKILL.md` — one placeholder skill so the plugin is
  immediately valid and user-editable.

Builder intentionally generates no `mcp.json`, extensions, or extra metadata
at init time; those are added by `create`, `migrate`, or the user.

## Integration contract

This fixture must load with `loadPlugin` and validate with `validatePlugin`
producing zero error/critical diagnostics, and `agent-plugin-doctor check .`
must exit `0`.

## Expected result

```
agent-plugin-doctor check tests/fixtures/builder-generated/from-init
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`).
