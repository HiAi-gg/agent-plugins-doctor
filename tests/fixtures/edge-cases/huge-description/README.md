# huge-description

A plugin that pushes description-length limits.

## What it tests

- **Skill description limit**: `skill-description-length` (`DOC-2003`, error)
  caps skill descriptions at 1024 characters (`DESCRIPTION_MAX_LENGTH`).
  `skills/huge-description/SKILL.md` declares a ~1229-character description, so
  the rule fires and the check fails with exit 1.
- **Manifest description is NOT length-limited**: `plugin.json` carries a
  ~1374-character `description`, and the schema (and the rules) place no limit
  on it — the manifest alone would pass cleanly. The manifest field is included
  to document this boundary: only *skill* descriptions are capped.

## Expected result

```
agent-plugin-doctor check tests/fixtures/edge-cases/huge-description
```

Exit code: `1`

Diagnostics: 1 error

```
ERROR DOC-2003
skills/huge-description/SKILL.md
Skill "huge-description" description is 1229 characters, exceeding the maximum of 1024
```

## Setup

None required. The long strings are generated programmatically; do not edit
them by hand. Regenerate with:

```bash
python3 - <<'PYEOF'
import json, os
root = 'tests/fixtures/edge-cases/huge-description'
manifest_desc = ('This is an intentionally very long plugin description. ' * 25).strip()
with open(os.path.join(root, 'plugin.json'), 'w') as f:
    json.dump({'$schema': 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
               'name': 'huge-description', 'description': manifest_desc}, f, indent=2)
    f.write('\n')
skill_desc = ('This is an intentionally very long skill description that exceeds the spec limit. ' * 15).strip()
with open(os.path.join(root, 'skills/huge-description/SKILL.md'), 'w') as f:
    f.write('---\nname: huge-description\ndescription: ' + skill_desc + '\n---\n\n# Huge Description Skill\n')
PYEOF
```
