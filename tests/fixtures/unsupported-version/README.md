# unsupported-version

A plugin that declares a future spec version (`2.0.0`) in its `$schema`.

## What it tests

- Unsupported spec versions are rejected with a clear, actionable message
  instead of the vendored schema's generic "must be equal to constant"
  const violation: the parser emits a dedicated `DOC-1010` error diagnostic
  (exit 1) that names the detected version and the supported version.

## Expected result

```
agent-plugins-doctor check tests/fixtures/unsupported-version
```

Exit code: `1` (spec error)

Diagnostics:

```
ERROR DOC-1010
plugin.json
Plugin targets https://agent-plugins.org/schemas/2.0.0/plugin.schema.json, but Doctor validates Agent Plugins v1.0.0. Update your plugin or use a Doctor version that supports this schema.
```

## Setup

None required. Self-contained fixture.
