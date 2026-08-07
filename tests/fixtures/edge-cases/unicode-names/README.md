# unicode-names

A plugin whose `name` contains non-ASCII (unicode) characters:
`ünïcödé-plugin`. Unicode is not allowed in plugin names.

## What it tests

- Plugin names must match `NAME_PATTERN`: lowercase ASCII alphanumerics,
  hyphens and periods only (`^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`).
- The pattern is enforced in the vendored plugin.schema.json, so a unicode name
  is a **fatal manifest schema violation**.

## Expected result

```
agent-plugin-doctor check tests/fixtures/edge-cases/unicode-names
```

Exit code: `3` (tool/load failure)

Output (stderr):

```
Failed to load plugin: plugin.json does not conform to plugin.schema.json (1 violation)
```

> Note: the `manifest-name-pattern` rule (`DOC-1002`, error) implements the
> same pattern and would report a name violation — but only when a manifest
> reaches the rules engine. From disk, the schema rejects the unicode name
> first, so the CLI surfaces a load failure (exit 3) rather than a DOC-1002
> diagnostic (exit 1).

## Setup

None required. Self-contained fixture. The unicode name is intentional and
must not be ASCII-escaped.
