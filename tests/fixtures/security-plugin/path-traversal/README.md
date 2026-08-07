# path-traversal

A plugin whose MCP server declares `cwd: "../../etc"` — a parent-directory
traversal attempt in a stdio server configuration.

## What it tests

- Path-traversal protection in MCP server `cwd` values.
- The `security-path-traversal` rule (`DOC-4001`, critical) exists as a
  defense-in-depth check, but the vendored mcp.schema.json enforces a
  plugin-relative `cwd` pattern first: the `traversal-server` entry fails
  server-level schema validation and is **skipped** by per-server failure
  isolation (§7.2.2). The validator never receives the offending `cwd`, so no
  diagnostic is emitted.

## Expected result

```
agent-plugin-doctor check tests/fixtures/security-plugin/path-traversal
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`)

The traversal attempt is neutralized at parse time: the plugin loads with zero
MCP servers rather than a server with an escaping working directory.

> `DOC-4001` can only be reached by constructing a plugin programmatically —
> the loader/schema combination prevents an escaping `cwd` (or escaping skill
> directory / extension path) from ever reaching the rules engine from disk.

## Setup

None required. Self-contained fixture.
