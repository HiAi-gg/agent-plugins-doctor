# from-create

Simulated output of Builder's `builder create` command: a new plugin
scaffolded from a template when the user already knows what they want (unlike
`init`, which starts empty).

## What Builder generated

- `plugin.json` — scaffolded manifest with `name`, `version`, `description`,
  and `license` filled from the create prompt.
- `skills/custom-skill/SKILL.md` — one skill named after the user's choice,
  with frontmatter the template provides.
- `mcp.json` — a `stdio` server pointing at a relative entry script
  (`./server.js`), the canonical shape for a local MCP server. The command is
  a single token with arguments in `args`; the environment is declared
  explicitly and avoids the reserved `PLUGIN_ROOT` / `PLUGIN_DATA` keys.

## Integration contract

This fixture must load with `loadPlugin` and validate with `validatePlugin`
producing zero error/critical diagnostics, and `agent-plugin-doctor check .`
must exit `0`.

## Expected result

```
agent-plugin-doctor check tests/fixtures/builder-generated/from-create
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`).
