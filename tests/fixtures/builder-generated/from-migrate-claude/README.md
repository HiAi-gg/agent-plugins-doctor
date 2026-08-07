# from-migrate-claude

Simulated output of Builder's `builder migrate --from claude` command: an
existing Claude Code project (`.claude/` config, `CLAUDE.md`, `.mcp.json`)
converted into an Agent Plugin.

## What Builder generated

- `plugin.json` — manifest with migrated metadata: `description` derived from
  the project's `CLAUDE.md`, `author` from git config, `license` and `version`
  carried over.
- `skills/migrated-skill/SKILL.md` — the project's workflow instructions
  promoted to a skill with frontmatter.
- `mcp.json` — Claude's MCP servers are stdio-based, so Builder emits them
  verbatim as `stdio` servers (`npx` is a single-token command; the package
  name and args live in `args`).

Builder strips Claude-only concepts (permission rules, `allowedTools` hooks)
that have no Agent Plugins representation; it does not invent an `env` or
`cwd` where the source had none.

## Integration contract

This fixture must load with `loadPlugin` and validate with `validatePlugin`
producing zero error/critical diagnostics, and `agent-plugins-doctor check .`
must exit `0`.

## Expected result

```
agent-plugins-doctor check tests/fixtures/builder-generated/from-migrate-claude
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`).
