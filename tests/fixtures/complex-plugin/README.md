# complex-plugin

A complete plugin demonstrating every feature the Agent Plugins 1.0.0 spec
supports: a fully populated manifest, two MCP servers (stdio and
streamable-http), two skills, a vendor extension, and agent instructions.

## What it tests

- Every optional manifest field (`version`, `description`, `author`,
  `homepage`, `repository`, `license`, `keywords`, `extensions`) parses and
  validates.
- Both supported MCP transports (`stdio`, `streamable-http`) validate,
  including `args`, `env`, and `headers`.
- Skills with full frontmatter (`name`, `description`, `license`,
  `compatibility`, `metadata`) validate.
- Extension namespaces (`com.example.client`) are discovered from the
  filesystem and validated.
- A non-spec file at the root (`notes.log`) is tolerated.

## Expected result

```
agent-plugins-doctor check tests/fixtures/complex-plugin
```

Exit code: `0`

Diagnostics: 3 informational (none affect the exit code)

```
INFO DOC-5003
notes.log
Unexpected file at plugin root: "notes.log"

INFO DOC-7001
mcp.json
./mcp.json is not formatted with 2-space indentation and a trailing newline

INFO DOC-7001
plugin.json
./plugin.json is not formatted with 2-space indentation and a trailing newline
```

The informational findings:

- `DOC-5003`: notes.log is not part of the plugin specification, so the
  `structure-extra-files` rule reports it.
- `DOC-7001` (x2): the manifest and mcp.json use inline arrays
  (`"keywords": ["test", "example", "complex"]`, `"args": ["--port", "3000"]`).
  The `format-json-formatting` rule prefers the canonical form
  (JSON.stringify with 2-space indentation, arrays expanded). Run
  `--fix` to reformat both files (2 fixes available).

Compatibility: compatible with every supported client (vscode, cursor, copilot,
codex, kiro).

## Setup

None required. The referenced `./server.js` command is never executed: the
validator reads configuration only and never runs plugin code.
