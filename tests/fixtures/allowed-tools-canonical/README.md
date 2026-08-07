# allowed-tools-canonical

A minimal plugin whose skill declares `allowed-tools` in the canonical
space-separated string form defined by the Agent Skills specification
(e.g. `Bash(git:*) Bash(jq:*) Read`).

## What it tests

- `allowed-tools` as a plain YAML scalar string parses and is preserved
  verbatim by `parseSkillFrontmatter` (no whitespace normalization, no
  conversion to a list).
- DOC-2005 accepts the canonical string form: each whitespace-separated tool
  token (`Bash(git:*)`, `Bash(jq:*)`, `Read`) matches the tool-name pattern.
- End-to-end: a plugin using the spec's canonical form loads and validates
  with zero diagnostics.

## Expected result

```
agent-plugin-doctor check tests/fixtures/allowed-tools-canonical
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`).

Compatibility: compatible with every supported client (vscode, cursor, copilot,
codex, kiro).

## Setup

None required. Self-contained fixture.
