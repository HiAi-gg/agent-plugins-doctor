# duplicate-frontmatter

A plugin whose skill contains a duplicate YAML frontmatter block.

## What it tests

- **Duplicate frontmatter detection**: `format-duplicate-frontmatter`
  (`DOC-7003`, error). The loader reads only the first `---`-delimited block,
  so `skills/test/SKILL.md` carries a second frontmatter block that gray-matter
  silently ignores — dead content, usually a paste or merge error. Structural
  corruption must fail the Builder Contract, so this is an **error** and the
  check exits with code 1.

## Expected result

```
agent-plugins-doctor check tests/fixtures/duplicate-frontmatter
```

Exit code: `1`

Diagnostics: 1 error

```
ERROR DOC-7003
skills/test/SKILL.md
skills/test/SKILL.md: 1 duplicate frontmatter block(s) found after the first — gray-matter silently ignores these; remove or merge them
```

## Setup

None required.
