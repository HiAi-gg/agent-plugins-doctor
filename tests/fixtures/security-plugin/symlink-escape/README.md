# symlink-escape

A valid plugin that contains a symlink (`escape-link`) pointing **outside** the
plugin root. The symlink targets the repository root `package.json`
(`../../../../package.json`), a real file the validator must never read.

## What it tests

- Symlink-escape protection: the validator must not follow the link and read
  content from outside the plugin root.
- The `security-symlink-escape` rule (`DOC-4002`, critical) guards component
  directories (skill dirs and extension namespaces). Because the loader already
  resolves every component path through `resolvePluginPath` — which rejects
  symlink escapes with a containment check — an escaping component never
  reaches the rules engine.
- A stray escaping symlink at the root is treated as an unexpected file
  (`DOC-5003`, informational) and is never followed.

## Expected result

```
agent-plugins-doctor check tests/fixtures/security-plugin/symlink-escape
```

Exit code: `0`

Diagnostics: 1 informational

```
INFO DOC-5003
escape-link
Unexpected file at plugin root: "escape-link"
```

The fixture is green because no component path (plugin.json, mcp.json, skills,
extensions) resolves through the escaping link.

> If you want to exercise `DOC-4002` directly, it can only be reached by
> constructing a plugin programmatically (e.g. with a skill directory that
> `realpath`s outside the root) — the loader will not produce such a plugin
> from disk.

## Setup

The `escape-link` symlink must exist and point outside the plugin root. It was
created with:

```
ln -s ../../../../package.json tests/fixtures/security-plugin/symlink-escape/escape-link
```

On filesystems without symlink support the entry appears as a plain text file;
the fixture is still valid (the validator simply reports the unexpected file).
