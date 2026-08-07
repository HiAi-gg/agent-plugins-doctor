# invalid-extensions

A plugin whose manifest `extensions` field is **not an object** (it is a
string), which violates §8.1.

## What it tests

- Malformed `extensions` values are handled non-fatally per §8.1: the parser
  strips the field from the in-memory manifest instead of rejecting the
  plugin.
- Consequence: the `manifest-extensions-format` rule (`DOC-1005`, warning) only
  fires when `extensions` *is* an object but its namespace keys or values are
  invalid (e.g. `"extensions": { "Not A Namespace": {} }`); a non-object value
  is removed before the rule runs, so this exact fixture produces **no
  diagnostic** and exits 0.

## Expected result

```
agent-plugins-doctor check tests/fixtures/vendor-extensions/invalid-extensions
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`)

The plugin loads with the `extensions` field stripped. To observe a `DOC-1005`
warning, change the value to an object with an invalid namespace key:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "invalid-extensions",
  "extensions": {
    "Not A Namespace": { "feature": 1 }
  }
}
```

That form exits 0 with 1 warning (`DOC-1005`, extension namespace is not a
valid reverse-domain name).

## Setup

None required. Self-contained fixture.
