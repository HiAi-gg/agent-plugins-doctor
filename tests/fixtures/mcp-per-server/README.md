# mcp-per-server

Regression fixtures for per-server MCP failure isolation (P0): an invalid
individual MCP server entry must never silently disappear — every raw entry is
preserved (valid servers typed, invalid entries `null`), each invalid entry
produces a `DOC-3008` parser diagnostic, and valid sibling servers still load.

| Fixture | Scenario | Exit code | Key diagnostics |
| --- | --- | --- | --- |
| `mixed-valid-invalid/` | 2 valid servers + 1 invalid transport (`type: websocket`) | 1 | DOC-3008 error; `invalid-transport` preserved as `null`, `valid-stdio`/`valid-http` still load |
| `reserved-env/` | stdio `env` declares reserved key `PLUGIN_ROOT` | 1 | DOC-3008 error mentioning `PLUGIN_ROOT` |
| `cwd-traversal/` | stdio `cwd` escapes the plugin root (`../escape`) | 2 | DOC-3008 critical mentioning `cwd` |
| `command-traversal/` | stdio `command` escapes the plugin root (`../bin/server`) | 2 | DOC-3008 critical mentioning `command` |

These are the exact cases the loader previously dropped silently (schema
isolation skipped the server before any rule could see it), producing
"No issues found" with exit 0.

Non-traversal schema violations (`websocket` transport, reserved env keys)
are validation errors (DOC-3008 error, exit 1); entries whose stdio
`command`/`cwd` escapes the plugin root are security-critical (DOC-3008
critical, exit 2), matching the DOC-4001 severity.
