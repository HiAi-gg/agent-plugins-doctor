# security-plugin

Security-focused fixtures. Each subdirectory is an independent test plugin.

| Fixture | Scenario | Exit code |
| --- | --- | --- |
| `symlink-escape/` | symlink pointing outside the plugin root | 0 (info) |
| `embedded-secrets/` | credentials embedded in MCP env | 2 (critical) |
| `path-traversal/` | MCP server `cwd` escaping the plugin root | 0 (schema-isolated) |

All credentials used are fake. Never replace them with real secrets.
