# future-spec

A plugin that declares a future spec version (`2.0.0`) in its `$schema`.

## What it tests

- Spec versions newer than the validator's supported version are rejected.
- Like `legacy-plugin`, the vendored schema pins `$schema` to the 1.0.0 URL
  (`const`), so a 2.0.0 manifest fails **manifest schema validation** before
  any rule runs.

## Expected result

```
agent-plugin-doctor check tests/fixtures/future-spec
```

Exit code: `3` (tool/load failure)

Output (stderr):

```
Failed to load plugin: plugin.json does not conform to plugin.schema.json (1 violation)
```

> Note: the `compatibility-spec-version` rule (`DOC-6001`) is unreachable from
> disk for this fixture for the same reason as `legacy-plugin`: the schema
> `const` on `$schema` rejects the value during manifest parsing, which the CLI
> maps to a load failure (exit 3), not a diagnostic (exit 1).

## Setup

None required. Self-contained fixture.
