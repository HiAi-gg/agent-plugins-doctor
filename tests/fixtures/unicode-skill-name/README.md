# unicode-skill-name

A valid plugin whose skill name contains non-ASCII Unicode characters. Per the
Agent Skills specification, skill names may contain Unicode lowercase
alphanumeric characters (letters in any script plus digits) and hyphens, so
accented names like `café` are valid.

## What it tests

- A skill directory named `café` with a matching frontmatter `name: café`
  loads and validates cleanly (no DOC-2001/DOC-5002 error).
- The skill-name pattern accepts Unicode lowercase letters while still
  rejecting uppercase letters, underscores, whitespace, consecutive hyphens,
  and leading/trailing hyphens (covered by unit and integration tests).

## Expected result

```
agent-plugins-doctor check tests/fixtures/unicode-skill-name
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`).

## Setup

None required. Self-contained fixture.
