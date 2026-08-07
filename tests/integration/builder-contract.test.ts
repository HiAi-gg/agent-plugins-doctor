// Integration: the Builder integration contract (Phase 12/13).
//
// Builder generates plugins and must be able to hand them straight to Doctor:
// (1) every Builder-generated fixture validates with zero error/critical
// diagnostics, (2) parseSkillFrontmatter handles every frontmatter shape
// Builder emits, and (3) the exit-code contract (0=valid, 1=errors,
// 2=security-critical, 3=tool failure) matches Builder's expectations.

import { describe, expect, test } from 'bun:test';
import { computeExitCode } from '@agent-plugin-doctor/cli';
import { loadPlugin, parseSkillFrontmatter } from '@agent-plugin-doctor/parser';
import { validatePlugin } from '@agent-plugin-doctor/rules';
import { fixturePath } from './helpers.js';

// Every Builder command's output must validate cleanly (exit 0).
const BUILDER_FIXTURES = [
  'builder-generated/from-init',
  'builder-generated/from-migrate-claude',
  'builder-generated/from-migrate-cursor',
  'builder-generated/from-create',
];

describe('Builder integration contract', () => {
  test('all Builder-generated fixtures pass validation', async () => {
    for (const fixture of BUILDER_FIXTURES) {
      const plugin = await loadPlugin(fixturePath(fixture));
      const result = await validatePlugin(plugin);
      expect(
        result.diagnostics.filter((d) => d.severity === 'error'),
        `${fixture}: unexpected error diagnostics: ${JSON.stringify(
          result.diagnostics.filter((d) => d.severity === 'error'),
        )}`,
      ).toHaveLength(0);
      expect(
        result.diagnostics.filter((d) => d.severity === 'critical'),
        `${fixture}: unexpected critical diagnostics`,
      ).toHaveLength(0);
    }
  });

  test('parseSkillFrontmatter handles all Builder outputs', () => {
    // Frontmatter shapes Builder is expected to emit: plain, metadata maps,
    // and both allowed-tools spellings (space-separated string and YAML list).
    const cases = [
      {
        name: 'simple',
        description: 'Test skill',
        content: '---\nname: test\ndescription: Test skill\n---\nBody',
      },
      {
        name: 'with-metadata',
        description: 'Test',
        content:
          '---\nname: test\ndescription: Test\nmetadata:\n  key: value\n---\nBody',
      },
      {
        name: 'with-allowed-tools',
        description: 'Test',
        content:
          '---\nname: test\ndescription: Test\nallowed-tools: bash,read\n---\nBody',
      },
      {
        name: 'allowed-tools-space-separated',
        description: 'Test',
        content:
          '---\nname: test\ndescription: Test\nallowed-tools: bash read\n---\nBody',
      },
      {
        name: 'allowed-tools-list',
        description: 'Test',
        content:
          '---\nname: test\ndescription: Test\nallowed-tools:\n  - bash\n  - read\n---\nBody',
      },
    ];

    for (const { name, description, content } of cases) {
      const parsed = parseSkillFrontmatter(content, 'test.md');
      expect(parsed.frontmatter.name, `case ${name}: name`).toBe('test');
      expect(parsed.frontmatter.description, `case ${name}: description`).toBe(
        description,
      );
      expect(parsed.body, `case ${name}: body`).toBe('Body');
    }
  });

  test('exit codes match Builder expectations', async () => {
    // Builder expects: 0=valid, 1=errors, 2=security-critical, 3=tool failure.
    // A clean fixture (minimal-plugin) must be 0.
    const plugin = await loadPlugin(fixturePath('minimal-plugin'));
    const result = await validatePlugin(plugin);
    expect(computeExitCode(result.diagnostics)).toBe(0);
  });

  test('error and critical fixtures map to exit codes 1 and 2', async () => {
    // Spec errors -> 1 (huge-description: DOC-2003 error).
    const errorResult = await validatePlugin(
      await loadPlugin(fixturePath('edge-cases', 'huge-description')),
    );
    expect(computeExitCode(errorResult.diagnostics)).toBe(1);

    // Security-critical findings -> 2 (embedded-secrets: DOC-4003 critical).
    const criticalResult = await validatePlugin(
      await loadPlugin(fixturePath('security-plugin', 'embedded-secrets')),
    );
    expect(computeExitCode(criticalResult.diagnostics)).toBe(2);
  });

  test('load failures must be caught and mapped to exit code 3', async () => {
    // Builder wraps loadPlugin in try/catch and reports 3 (tool failure) when
    // the plugin cannot be loaded or parsed. loadPlugin must reject loudly.
    let threw = false;
    try {
      await loadPlugin(fixturePath('invalid-plugin'));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
