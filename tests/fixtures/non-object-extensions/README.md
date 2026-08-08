# non-object-extensions

A plugin whose manifest `extensions` field is **not an object** (it is a
string), which violates §8.1.

## What it tests

- Structurally invalid `extensions` is no longer silently ignored: the parser
  emits an explicit `DOC-1009` error diagnostic (exit 1).
- The field is still handled non-fatally per §8.1: the parser strips it from
  the in-memory manifest instead of rejecting the plugin, so the rest of the
  plugin still loads.

## Expected result

```
agent-plugins-doctor check tests/fixtures/non-object-extensions
```

Exit code: `1` (spec error)

Diagnostics:

```
ERROR DOC-1009
plugin.json
extensions must be an object keyed by reverse-domain namespace
```

## Setup

None required. Self-contained fixture.
