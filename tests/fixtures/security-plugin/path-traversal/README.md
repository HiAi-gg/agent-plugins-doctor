# path-traversal

A plugin whose MCP server declares `cwd: "../../etc"` — a parent-directory
traversal attempt in a stdio server configuration.

## What it tests

- Path-traversal protection in MCP server `cwd` values.
- The `security-path-traversal` rule (`DOC-4001`, critical) exists as a
  defense-in-depth check, but the vendored mcp.schema.json enforces a
  plugin-relative `cwd` pattern first: the `traversal-server` entry fails
  server-level schema validation and is preserved as `null` by per-server
  failure isolation (§7.2.2), never silently dropped. The parser reports the
  entry as a **critical** `DOC-3008` because its `cwd` escapes the plugin
  root — matching the DOC-4001 severity — so the plugin fails with exit 2.

## Expected result

```
agent-plugins-doctor check tests/fixtures/security-plugin/path-traversal
```

Exit code: `2`

Diagnostics:

- `DOC-3008` (critical, `ruleId: "parser"`): `MCP server "traversal-server" is
  invalid: cwd "../../etc" must start with "./", "${PLUGIN_ROOT}", or
  "${PLUGIN_DATA}"`

The traversal attempt is neutralized at parse time: the server is never
loaded with an escaping working directory, but the finding is reported at
security-critical severity so it is not silently ignored.

> `DOC-4001` can only be reached by constructing a plugin programmatically —
> the loader/schema combination prevents an escaping `cwd` (or escaping skill
> directory / extension path) from ever reaching the rules engine from disk.

## Setup

None required. Self-contained fixture.
