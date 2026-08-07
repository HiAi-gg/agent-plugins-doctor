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

Exit code: `1` (validation error)

Output (stdout):

```
ERROR DOC-1008
plugin.json
```

> Note: the `compatibility-spec-version` rule (`DOC-6001`) is unreachable from
> disk for this fixture for the same reason as `legacy-plugin`: the schema
> `const` on `$schema` rejects the value during manifest parsing, which the CLI
> reports as a `DOC-1008` parser diagnostic (exit 1), not a rule diagnostic.

## Setup

None required. Self-contained fixture.
