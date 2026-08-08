# legacy-plugin

A plugin that declares an outdated spec version (`0.9.0`) in its `$schema`.

## What it tests

- Unsupported spec versions are rejected with a clear, actionable message.
- The parser detects the unsupported `$schema` before schema validation and
  emits a dedicated `DOC-1010` error diagnostic (exit 1) that names the
  detected version and the supported version — not the vendored schema's
  generic "must be equal to constant" const violation.

## Expected result

```
agent-plugins-doctor check tests/fixtures/legacy-plugin
```

Exit code: `1` (validation error)

Output (stdout):

```
ERROR DOC-1010
plugin.json
Plugin targets https://agent-plugins.org/schemas/0.9.0/plugin.schema.json, but Doctor validates Agent Plugins v1.0.0. Update your plugin or use a Doctor version that supports this schema.
```

> Note: the `compatibility-spec-version` rule (`DOC-6001` "Unsupported plugin
> spec version") exists for programmatic use, but a 0.9.0 manifest never
> reaches the rules engine through the CLI: the parser rejects the `$schema`
> value before validation, and the CLI reports it as a `DOC-1010` parser
> diagnostic (exit 1), not a rule diagnostic.

## Setup

None required. Self-contained fixture.
