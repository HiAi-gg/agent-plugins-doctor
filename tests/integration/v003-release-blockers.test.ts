// Integration: consolidated v0.0.3 release-blocker regression tests.
//
// One file that locks every fix shipped in v0.0.3 so a future refactor
// cannot silently reintroduce a blocker:
//
//   P0 #1  MCP per-server diagnostics — invalid entries surface as DOC-3008
//          and never silently disappear; valid siblings are preserved.
//   P0 #2  Exit codes — validation errors are exit 1, security-critical
//          findings (path traversal) are exit 2.
//   P0 #5  Unicode skill names — accented/non-Latin names accepted verbatim.
//   P1 #6  Non-object `extensions` produces an explicit DOC-1009.
//   P1 #7  Security reachability — a component-path symlink escape is
//          reported by the loader as critical DOC-4002 (CLI-reachable).
//   P1 #8  checkCompatibility(null/undefined) returns an empty result.
//   P1 #10 Unsupported spec version produces a clear DOC-1010 message.
//   P2 #12 Naming consistency — the repo's own plugin.json uses the plural
//          form (self-hosting `check .` stays green).
//
// The dedicated suites (mcp-per-server, exit-codes-v003, unicode-skill-names,
// p1-fixes) keep the deep per-case coverage; this file is the release-level
// smoke contract on top of them.

import { describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createDefaultRegistry,
  ValidationEngine,
  validatePlugin,
} from '@agent-plugins-doctor/rules';
import { loadPlugin, scanPlugin } from '@agent-plugins-doctor/parser';
import { checkCompatibility } from '@agent-plugins-doctor/compatibility';
import {
  canonicalJson,
  cleanup,
  fixturePath,
  makeTempDir,
  REPO_ROOT,
} from './helpers.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

const engine = new ValidationEngine(createDefaultRegistry());

describe('v0.0.3 release blockers — regression tests', () => {
  describe('P0 #1: MCP per-server diagnostics', () => {
    test('invalid MCP server does not silently disappear', async () => {
      const { plugin, diagnostics } = await scanPlugin(
        fixturePath('mcp-per-server/mixed-valid-invalid'),
      );
      expect(plugin).not.toBeNull();
      expect(diagnostics.some((d) => d.code === 'DOC-3008')).toBe(true);
    });

    test('valid servers preserved when others are invalid', async () => {
      const { plugin } = await scanPlugin(
        fixturePath('mcp-per-server/mixed-valid-invalid'),
      );
      expect(plugin?.mcpConfig?.mcpServers['valid-stdio']).toBeDefined();
      expect(plugin?.mcpConfig?.mcpServers['valid-http']).toBeDefined();
    });
  });

  describe('P0 #2: Exit codes', () => {
    test('invalid MCP → exit 1', async () => {
      const { plugin, diagnostics } = await scanPlugin(
        fixturePath('mcp-per-server/reserved-env'),
      );
      const result = await validatePlugin(plugin!);
      const allDiags = [...diagnostics, ...result.diagnostics];
      expect(allDiags.some((d) => d.severity === 'error')).toBe(true);
      expect(engine.computeExitCode(allDiags)).toBe(1);
    });

    test('security-critical traversal → exit 2', async () => {
      const { plugin, diagnostics } = await scanPlugin(
        fixturePath('mcp-per-server/cwd-traversal'),
      );
      const result = await validatePlugin(plugin!);
      const allDiags = [...diagnostics, ...result.diagnostics];
      expect(allDiags.some((d) => d.severity === 'critical')).toBe(true);
      expect(engine.computeExitCode(allDiags)).toBe(2);
    });
  });

  describe('P0 #5: Unicode skill names', () => {
    test('Unicode names accepted', async () => {
      const { plugin } = await loadPlugin(fixturePath('unicode-skill-name'));
      expect(plugin.skills[0].name).toBe('café');

      const result = await validatePlugin(plugin);
      expect(result.diagnostics.some((d) => d.code === 'DOC-5002')).toBe(false);
    });
  });

  describe('P1 #6: Non-object extensions', () => {
    test('non-object extensions produce diagnostic', async () => {
      const { diagnostics } = await scanPlugin(
        fixturePath('non-object-extensions'),
      );
      expect(diagnostics.some((d) => d.code === 'DOC-1009')).toBe(true);
    });
  });

  describe('P1 #7: Security reachability', () => {
    test('symlink escape is CLI-reachable', async () => {
      const root = makeTempDir();
      const outside = makeTempDir('doctor-outside-');
      try {
        writeFileSync(
          join(root, 'plugin.json'),
          canonicalJson({
            $schema: PLUGIN_SCHEMA,
            name: 'symlink-escape',
          }),
        );
        mkdirSync(join(root, 'skills'), { recursive: true });
        // skills/evil resolves outside the plugin root via a symlink.
        symlinkSync(outside, join(root, 'skills', 'evil'));

        const { plugin, diagnostics } = await scanPlugin(root);
        const diag = diagnostics.find((d) => d.code === 'DOC-4002');
        expect(diag).toBeDefined();
        expect(diag?.severity).toBe('critical');
        expect(diag?.category).toBe('security');
        expect(diag?.message).toContain('skills/evil');
        // The escaping component never loads; the rest of the plugin survives.
        expect(plugin?.skills).toEqual([]);
        // Critical findings map to the security exit code (2) on the CLI.
        expect(engine.computeExitCode(diagnostics)).toBe(2);
      } finally {
        cleanup(root);
        cleanup(outside);
      }
    });
  });

  describe('P1 #8: checkCompatibility(null)', () => {
    test('null plugin does not crash', () => {
      const result = checkCompatibility(null);
      expect(result.plugin).toBeNull();
      expect(result.checks).toEqual([]);
    });

    test('undefined plugin does not crash', () => {
      const result = checkCompatibility(undefined);
      expect(result.plugin).toBeNull();
    });
  });

  describe('P1 #10: Unsupported version', () => {
    test('unsupported version produces clear message', async () => {
      const { diagnostics } = await scanPlugin(
        fixturePath('unsupported-version'),
      );
      const diag = diagnostics.find((d) => d.code === 'DOC-1010');
      expect(diag).toBeDefined();
      expect(diag?.message).toContain('2.0.0');
      expect(diag?.message).toContain('1.0.0');
    });
  });

  describe('P2 #12: Naming consistency', () => {
    test('plugin.json uses plural form', async () => {
      const { plugin } = await loadPlugin(REPO_ROOT);
      expect(plugin.manifest.name).toBe('agent-plugins-doctor');
    });
  });
});
