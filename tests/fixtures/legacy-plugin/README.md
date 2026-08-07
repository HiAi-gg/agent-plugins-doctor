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

Exit code: `3` (tool/load failure)

Output (stderr):

```
Failed to load plugin: plugin.json does not conform to plugin.schema.json (1 violation)
```

> Note: the `compatibility-spec-version` rule (`DOC-6001` "Unsupported plugin
> spec version") exists for programmatic use, but a 0.9.0 manifest never
> reaches the rules engine through the CLI: `parsePluginManifest` rejects the
> `$schema` value against the vendored 1.0.0 schema first, and `loadPlugin`
> surfaces that as a load failure (exit 3), not a diagnostic (exit 1).

## Setup

None required. Self-contained fixture.
