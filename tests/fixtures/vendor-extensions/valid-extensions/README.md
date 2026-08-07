# valid-extensions

A plugin with two vendor extensions: `com.example.feature1` and
`org.example.feature2`. Each namespace is declared in the manifest's
`extensions` field **and** exists as a reverse-domain directory containing an
`extension.json`.

## What it tests

- Manifest `extensions` field with valid reverse-domain namespaces and object
  values (`DOC-1005` passes).
- Filesystem discovery of reverse-domain namespace directories (§8.2).
- `extension.json` parsing (best-effort: no portable semantics are assigned).
- Extension directories are not reported as unexpected files (DOC-5003 skips
  reverse-domain directories).

## Expected result

```
agent-plugin-doctor check tests/fixtures/vendor-extensions/valid-extensions
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`)

## Setup

None required. Self-contained fixture.
