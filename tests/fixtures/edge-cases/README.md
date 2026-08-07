# edge-cases

Boundary-condition fixtures. Each subdirectory is an independent test plugin.

| Fixture | Scenario | Exit code |
| --- | --- | --- |
| `empty-plugin/` | minimal manifest, no components | 0 |
| `huge-description/` | description-length limits (skill DOC-2003) | 1 |
| `max-skills/` | plugin with 100 skills | 0 |
| `unicode-names/` | non-ASCII plugin name | 3 (schema) |
