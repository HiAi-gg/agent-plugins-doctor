# Extensibility Guide

This guide shows how to extend Agent Plugin Doctor. Every extension point is
registry-based: you add a module and register it, you never fork the tool.
Each section ends with a complete, working example.

The extension points are:

| Extension       | Registry / dispatcher                                | Package                              |
| --------------- | ---------------------------------------------------- | ------------------------------------ |
| Validation rule | `RuleRegistry` (via `createDefaultRegistry`)         | `@agent-plugin-doctor/rules`         |
| Spec version    | `specVersions` in `packages/core/src/spec/index.ts`  | `@agent-plugin-doctor/core`          |
| Report format   | `getFormatter` in `packages/report/src/index.ts`     | `@agent-plugin-doctor/report`        |
| Client profile  | `ClientProfileRegistry` (seeded from `clients.json`) | `@agent-plugin-doctor/compatibility` |
| Auto-fix        | `fix()` method on a rule                             | `@agent-plugin-doctor/rules`         |

---

## Adding a New Validation Rule

### Steps

1. Create the rule file in `packages/rules/src/rules/<category>/` (categories:
   `manifest`/`spec`, `skill`, `mcp`, `security`, `structure`,
   `compatibility`, `format`).
2. Implement the `Rule` interface (see `packages/rules/src/rule.ts`).
3. Export the rule from the category index
   (`packages/rules/src/rules/<category>/index.ts`).
4. Write tests in `packages/rules/tests/rules/<category>/` — every rule needs
   positive and negative cases.
5. Document the diagnostic code in `docs/DIAGNOSTICS.md`.

Rules are registered automatically: `createDefaultRegistry` collects every
export with a string `id` from each category index, so **exporting from the
category index is the whole registration step**. No central registry edit is
needed.

### Example — `skill-description-min-length`

`packages/rules/src/rules/skill/description-min-length.ts`:

```ts
// DOC-2xxx: skill descriptions should not be empty (illustrative rule).

import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'skill-description-min-length';
const CODE = 'DOC-2007';

export const descriptionMinLengthRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Skill description required',
  category: 'skills',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description: 'Every skill must have a non-empty description.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      if (skill.description.trim().length === 0) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'skills',
            'error',
            `Skill "${skill.name}" has an empty description`,
            `${skill.directory}/SKILL.md`,
          ),
        );
      }
    }
    return diagnostics;
  },
};
```

Register it in `packages/rules/src/rules/skill/index.ts`:

```ts
export { descriptionMinLengthRule } from './description-min-length.js';
```

Tests in `packages/rules/tests/rules/skill/description-min-length.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { descriptionMinLengthRule } from '../../../src/rules/skill/description-min-length.js';
import { makePlugin, makeSkill } from '../../helpers.js';

describe('DOC-2007 skill-description-min-length', () => {
  test('flags an empty description', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'empty', description: '' })],
    });
    const diagnostics = descriptionMinLengthRule.check({ plugin, rootDir: '' });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('DOC-2007');
  });

  test('accepts a non-empty description', () => {
    const plugin = makePlugin({
      skills: [makeSkill({ name: 'ok', description: 'A real description' })],
    });
    expect(descriptionMinLengthRule.check({ plugin, rootDir: '' })).toEqual([]);
  });
});
```

> Rule authors: if your rule reads a raw file from disk in `check()` (e.g. to
> catch parser-stripped data), declare it with `files: ['./plugin.json']` so
> incremental validation can re-run it precisely.

---

## Adding a New Spec Version

### Steps

1. Create `packages/core/src/spec/v<N>/` with the version's constants
   (schema URLs, patterns, length limits, component types).
2. Add the constants and the `SPEC_VERSION` to the directory's `index.ts`.
3. Register the version in `packages/core/src/spec/index.ts` (`specVersions`
   map + `resolveSpecVersion`).
4. Update rules to declare support for the new version
   (`supportedSpecVersions: ['1.0.0', '2.0.0']`, or `'*'`).
5. Vendor the official schemas into
   `packages/parser/src/schemas/` (byte-exact copies) and add tests.

### Example — adding a hypothetical v2.0.0

`packages/core/src/spec/v2/index.ts`:

```ts
// Agent Plugins v2.0.0 constants (illustrative).

export const SPEC_VERSION = '2.0.0';
export const PLUGIN_SCHEMA_URL =
  'https://agent-plugins.org/schemas/2.0.0/plugin.schema.json';
export const MCP_SCHEMA_URL =
  'https://agent-plugins.org/schemas/2.0.0/mcp.schema.json';
export const NAME_PATTERN =
  /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
export const NAME_MAX_LENGTH = 64;
export const SKILL_NAME_PATTERN = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const SKILL_NAME_MAX_LENGTH = 64;
export const DESCRIPTION_MAX_LENGTH = 2048; // v2 doubled the limit
export const COMPATIBILITY_MAX_LENGTH = 500;
export const SUPPORTED_COMPONENT_TYPES = ['skills', 'mcp'] as const;
```

Register it in `packages/core/src/spec/index.ts`:

```ts
import * as v2 from './v2/index.js';

const specVersions: Record<string, SpecVersion> = {
  '1.0.0': {/* existing */},
  '2.0.0': {
    version: v2.SPEC_VERSION,
    pluginSchemaUrl: v2.PLUGIN_SCHEMA_URL,
    mcpSchemaUrl: v2.MCP_SCHEMA_URL,
    namePattern: v2.NAME_PATTERN,
    nameMaxLength: v2.NAME_MAX_LENGTH,
    skillNamePattern: v2.SKILL_NAME_PATTERN,
    skillNameMaxLength: v2.SKILL_NAME_MAX_LENGTH,
    descriptionMaxLength: v2.DESCRIPTION_MAX_LENGTH,
    compatibilityMaxLength: v2.COMPATIBILITY_MAX_LENGTH,
    supportedComponentTypes: v2.SUPPORTED_COMPONENT_TYPES,
  },
};

export function resolveSpecVersion(schemaUrl: string): SpecVersion | null {
  if (
    schemaUrl === v1.PLUGIN_SCHEMA_URL ||
    schemaUrl === v1.MCP_SCHEMA_URL ||
    schemaUrl === v2.PLUGIN_SCHEMA_URL ||
    schemaUrl === v2.MCP_SCHEMA_URL
  ) {
    return specVersions[v2.SPEC_VERSION]; // or resolve per URL
  }
  return null;
}

export { v1, v2 };
```

Then vendor the v2 schemas in `packages/parser/src/schemas/` and update the
rules (spec constants like `DESCRIPTION_MAX_LENGTH` are imported from `core`,
so rules automatically see the per-version value through `getSpecVersion`).

---

## Adding a New Report Format

### Steps

1. Implement the `ReportFormatter` interface
   (`format(result: ValidationResult): string`) in `packages/report/src/`.
2. Add the format to the `ReportFormat` union in `packages/report/src/types.ts`.
3. Register it in `getFormatter` in `packages/report/src/index.ts`.
4. Add the format to the CLI's `FORMATS` list in
   `packages/cli/src/commands/report.ts`.
5. Add tests.

### Example — an XML formatter

`packages/report/src/xml.ts`:

```ts
import type { ValidationResult } from '@agent-plugin-doctor/core';
import type { ReportFormatter } from './types.js';

export class XmlReportFormatter implements ReportFormatter {
  format(result: ValidationResult): string {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<report>'];
    for (const diagnostic of result.diagnostics) {
      lines.push(
        `  <diagnostic code="${diagnostic.code}" severity="${diagnostic.severity}" rule="${diagnostic.ruleId}">`,
        `    <message>${escapeXml(diagnostic.message)}</message>`,
        '  </diagnostic>',
      );
    }
    lines.push('</report>');
    return lines.join('\n');
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

Register it in `packages/report/src/types.ts`:

```ts
export type ReportFormat = 'human' | 'json' | 'markdown' | 'xml';
```

and in `packages/report/src/index.ts`:

```ts
import { XmlReportFormatter } from './xml.js';

case 'xml':
  return new XmlReportFormatter();
```

and accept it in `packages/cli/src/commands/report.ts`:

```ts
const FORMATS: readonly ReportFormat[] = ['human', 'json', 'markdown', 'xml'];
```

---

## Adding a New Client Profile

### Steps

1. Verify the client supports Agent Plugins (with evidence — official docs).
2. Add the profile to
   `packages/compatibility/src/data/clients.json`.
3. Add tests in `packages/compatibility/tests/`.
4. Update `docs/COMPATIBILITY.md` and the README table.

### Example — a hypothetical "Acme IDE"

`packages/compatibility/src/data/clients.json`:

```json
{
  "clients": [
    {
      "id": "acme-ide",
      "name": "Acme IDE",
      "supportedSpecVersions": ["1.0.0"],
      "capabilities": {
        "skills": true,
        "mcpStdio": true,
        "mcpStreamableHttp": true,
        "mcpLegacySse": false,
        "extensions": true,
        "extensionsNote": "Safely ignores unknown namespaces per spec §8.2"
      },
      "evidence": "docs",
      "source": "https://acme.example/docs/plugins"
    }
  ]
}
```

`createDefaultClientRegistry()` picks the profile up automatically — no code
change. Add a test in `packages/compatibility/tests/`:

```ts
import { describe, expect, test } from 'bun:test';
import { createDefaultClientRegistry } from '../src/index.js';

describe('verified clients', () => {
  test('acme-ide is registered', () => {
    const profile = createDefaultClientRegistry().get('acme-ide');
    expect(profile?.name).toBe('Acme IDE');
    expect(profile?.capabilities.mcpLegacySse).toBe(false);
  });
});
```

---

## Adding a New Auto-Fix

### Steps

1. Implement the `fix()` method on the rule
   (`fix?(ctx, diagnostic): Fix | null`).
2. Ensure the fix is **safe** (only edits declared files inside the plugin
   root) and **idempotent** (applying it twice is a no-op).
3. Add tests for fix application (and that re-running after the fix produces
   no diagnostics).
4. Document fix availability in `docs/DIAGNOSTICS.md` (a rule "fixable" flag).

### Example — a fix on the illustrative min-length rule

```ts
fix(ctx, diagnostic) {
  const file = diagnostic.file;
  if (file === undefined) return null;
  const raw = readTextFile(ctx.rootDir, file);
  if (raw === null) return null;
  return {
    kind: 'replace',
    file,
    description: `Set a placeholder description in ${file}`,
    oldText: 'description: ',
    newText: 'description: TODO',
  };
}
```

The fix engine (`applyFixes` in `packages/rules/src/fixes.ts`) matches
`oldText`/`newText` against the _current_ file content, applies fixes in any
order, and treats a fix whose target state is already present as a no-op —
which is what makes idempotence automatic. Fixes are attached during
validation (`rule.fix` is called per diagnostic), so a fixable diagnostic
carries its `fix` in `result.diagnostics`, and `--fix`/`applyFixes` applies
them.

> Fix kinds: `replace`, `insert`, `delete`, `rename`. Whole-file replace
> fixes are used by format rules, which re-derive the canonical text if the
> file changed since check time.

---

## Testing Your Extension

Every extension must keep the quality gates green:

```bash
bun test                 # unit + integration + E2E + benchmarks
bun run typecheck        # strict-mode TS across all packages
bun run lint             # oxlint via eslint
bunx prettier --check .  # formatting
./packages/cli/bin/agent-plugin-doctor check .   # self-hosting: exit 0
```

New rules, spec versions, and report formats must also be documented
(`docs/DIAGNOSTICS.md`, `docs/ARCHITECTURE.md`) and, for public API changes,
reflected in `docs/SDK.md` and pinned by `tests/integration/api-stability.test.ts`.
