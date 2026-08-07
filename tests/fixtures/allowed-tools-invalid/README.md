# allowed-tools-invalid

A minimal plugin whose skill declares `allowed-tools` with an invalid YAML
type (a number instead of the canonical space-separated string).

## What it tests

- The parser preserves non-string `allowed-tools` values verbatim instead of
  rejecting the skill at load time.
- DOC-2005 is the gatekeeper for the field: a non-string, non-list value
  (number, boolean, mapping) is an `error` (`allowed-tools must be a string
  or YAML list`).
- End-to-end: malformed `allowed-tools` type surfaces as a validation error
  (exit 1) rather than a load failure or a silent pass.

## Expected result

```
agent-plugins-doctor check tests/fixtures/allowed-tools-invalid
```

Exit code: `1`

Diagnostics: 1 error

```
ERROR DOC-2005
skills/bad-skill/SKILL.md
Skill "bad-skill" allowed-tools must be a string or YAML list
```

## Setup

None required. Self-contained fixture.
