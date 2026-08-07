# vendor-extensions

Vendor-extension fixtures. Each subdirectory is an independent test plugin.

| Fixture | Scenario | Exit code |
| --- | --- | --- |
| `valid-extensions/` | valid reverse-domain namespaces + extension.json | 0 |
| `invalid-extensions/` | non-object `extensions` field (§8.1) | 0 (stripped) |
