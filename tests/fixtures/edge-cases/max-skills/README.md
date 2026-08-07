# max-skills

A plugin with 100 skills (`skills/skill-001/SKILL.md` through
`skills/skill-100/SKILL.md`) — a stress test for discovery, parsing, and
reporting at scale.

## What it tests

- Discovery of a large number of skills (fixed-depth scan of `skills/`).
- Parsing and validating 100 frontmatter documents.
- Rule-engine performance and report rendering with many diagnostics sources
  (here: none — every skill is valid).
- Exit-code stability under load.

## Expected result

```
agent-plugin-doctor check tests/fixtures/edge-cases/max-skills
```

Exit code: `0`

Diagnostics: none (`Result: No issues found`)

Runs quickly (well under a second on a modern machine) but is the slowest
fixture in the library; treat it as the performance boundary.

## Setup

The 100 SKILL.md files are generated programmatically. Regenerate with:

```bash
python3 - <<'PYEOF'
import json, os
root = 'tests/fixtures/edge-cases/max-skills'
with open(os.path.join(root, 'plugin.json'), 'w') as f:
    json.dump({'$schema': 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
               'name': 'max-skills'}, f, indent=2)
    f.write('\n')
for i in range(1, 101):
    name = f'skill-{i:03d}'
    d = os.path.join(root, 'skills', name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'SKILL.md'), 'w') as f:
        f.write(f'---\nname: {name}\ndescription: Skill number {i} in the max-skills fixture.\n---\n\n# Skill {name}\n')
PYEOF
```
