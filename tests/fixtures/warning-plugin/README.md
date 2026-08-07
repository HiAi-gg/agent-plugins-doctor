# warning-plugin

A structurally valid plugin that contains an unknown top-level field. Per
Spec §5.2, unknown top-level manifest fields are **reported and ignored**
(non-fatal): the parser strips them at load time and the
`manifest-unknown-fields` rule reports them against the raw file.

## What it tests

- `DOC-1004` (warning): unknown top-level field in plugin.json.
- Warnings do not fail a check by default (exit 0).
- `--strict` promotes warnings to errors (exit 1).

## Expected result

```
agent-plugins-doctor check tests/fixtures/warning-plugin
```

Exit code: `0`

Diagnostics: 1 warning

```
WARNING DOC-1004
plugin.json
plugin.json contains unknown top-level field "unknownField"
```

`--fix` can remove the offending field (1 fix available).

```
agent-plugins-doctor check tests/fixtures/warning-plugin --strict
```

Exit code: `1` (warning promoted to an error under `--strict`).

## Setup

None required. Self-contained fixture.
