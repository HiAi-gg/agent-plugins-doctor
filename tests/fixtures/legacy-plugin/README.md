# legacy-plugin

A plugin that declares an outdated spec version (`0.9.0`) in its `$schema`.

## What it tests

- Unsupported spec versions are rejected.
- The vendored schema pins `$schema` to the 1.0.0 URL (`const`), so a
  non-1.0.0 manifest fails **manifest schema validation** before any rule runs.

## Expected result

```
agent-plugin-doctor check tests/fixtures/legacy-plugin
```

Exit code: `1` (validation error)

Output (stdout):

```
ERROR DOC-1008
plugin.json
```

> Note: the `compatibility-spec-version` rule (`DOC-6001` "Unsupported plugin
> spec version") exists for programmatic use, but a 0.9.0 manifest never
> reaches the rules engine through the CLI: `parsePluginManifest` rejects the
> `$schema` value against the vendored 1.0.0 schema first, and the CLI reports
> it as a `DOC-1008` parser diagnostic (exit 1), not a rule diagnostic.

## Setup

None required. Self-contained fixture.
