# minimal-plugin

The smallest possible valid Agent Plugin. `plugin.json` contains only the two
required fields: `$schema` and `name`. There are no skills, no MCP servers, and
no extensions.

## What it tests

- A plugin with only the required manifest fields loads and validates cleanly.
- Optional components (skills, mcp.json, extensions) are absent without error.
- Baseline exit-code behavior: a clean plugin exits 0.

## Expected result

```
agent-plugin-doctor check tests/fixtures/minimal-plugin
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`).

Compatibility: compatible with every supported client (vscode, cursor, copilot,
codex, kiro).

## Setup

None required. Self-contained fixture.
