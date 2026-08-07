# empty-plugin

An empty-but-valid plugin: just the required `plugin.json` manifest with no
components (no skills, no mcp.json, no extensions) and no metadata.

## What it tests

- A bare-minimum manifest with no optional content validates cleanly.
- Absent optional components are not errors.
- Boundary baseline: the smallest plugin that is still *valid* (distinct from
  `minimal-plugin` only in that it has no README at the plugin root — its
  manifest is identical in spirit).

## Expected result

```
agent-plugin-doctor check tests/fixtures/edge-cases/empty-plugin
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`)

## Setup

None required. Self-contained fixture.
