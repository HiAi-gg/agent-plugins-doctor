// Integration: the public API surface must stay stable.
//
// Builder consumes Doctor's packages programmatically, so these tests pin the
// exports of every package Builder imports. An accidental breaking change
// (rename, removal, or signature change) is caught at the source instead of
// surfacing downstream in Builder. Type-level compatibility is additionally
// proven by the explicit type annotations elsewhere in tests/integration.
//
// The export lists below mirror docs/SDK.md: every export documented there
// must resolve from its package entry point. A documented export that
// disappears (like the missing `isPluginLoadError`, ECO-010) fails here.

import { describe, expect, test } from 'bun:test';
import * as cli from '@agent-plugins-doctor/cli';
import * as compatibility from '@agent-plugins-doctor/compatibility';
import * as core from '@agent-plugins-doctor/core';
import * as parser from '@agent-plugins-doctor/parser';
import * as report from '@agent-plugins-doctor/report';
import * as rules from '@agent-plugins-doctor/rules';

// Type-level imports: resolved by tsc at typecheck time (the root tsconfig
// covers tests/), so a documented *type* that is renamed or removed also
// fails here first — not just runtime values.
import type { Diagnostic, Plugin, Severity } from '@agent-plugins-doctor/core';
import type { LoadOptions, ScanResult } from '@agent-plugins-doctor/parser';
import type { Rule } from '@agent-plugins-doctor/rules';
import type {
  ClientProfile,
  CompatibilityLevel,
} from '@agent-plugins-doctor/compatibility';
import type { ReportFormat, ReportOptions } from '@agent-plugins-doctor/report';
import type { ExitCode, ExitCodeOptions } from '@agent-plugins-doctor/cli';

describe('public API stability', () => {
  test('core exports are stable', () => {
    // These are the functions Builder depends on for spec + path handling.
    expect(typeof core.resolveSpecVersion).toBe('function');
    expect(typeof core.getSpecVersion).toBe('function');
    expect(typeof core.getCurrentSpecVersion).toBe('function');
    expect(typeof core.resolvePluginPath).toBe('function');
    expect(typeof core.isWithinPath).toBe('function');
    expect(typeof core.normalizePath).toBe('function');
    expect(typeof core.isAbsolutePath).toBe('function');
    expect(typeof core.isValidPluginPath).toBe('function');
    // Spec constants (docs/SDK.md §1.2).
    expect(core.SPEC_VERSION).toBe('1.0.0');
    expect(typeof core.PLUGIN_SCHEMA_URL).toBe('string');
    expect(typeof core.MCP_SCHEMA_URL).toBe('string');
    expect(core.NAME_PATTERN).toBeInstanceOf(RegExp);
    expect(typeof core.NAME_MAX_LENGTH).toBe('number');
    expect(core.SKILL_NAME_PATTERN).toBeInstanceOf(RegExp);
    expect(typeof core.SKILL_NAME_MAX_LENGTH).toBe('number');
    expect(typeof core.DESCRIPTION_MAX_LENGTH).toBe('number');
    expect(typeof core.COMPATIBILITY_MAX_LENGTH).toBe('number');
    expect(Array.isArray(core.SUPPORTED_COMPONENT_TYPES)).toBe(true);
  });

  test('parser exports are stable', () => {
    // Parser is the single canonical loader/parser Builder calls after
    // generation; it replaces Builder's regex-based frontmatter parsing.
    expect(typeof parser.loadPlugin).toBe('function');
    expect(typeof parser.scanPlugin).toBe('function');
    expect(typeof parser.parsePluginManifest).toBe('function');
    expect(typeof parser.parseMcpConfig).toBe('function');
    expect(typeof parser.parseSkillFrontmatter).toBe('function');
    // Phase 16 performance surface: parsed-file cache and bounded traversal.
    expect(typeof parser.ParsedFileCache).toBe('function');
    expect(typeof parser.walkPluginFiles).toBe('function');
    // Error classes (docs/SDK.md §2.7).
    expect(typeof parser.LoadError).toBe('function');
    expect(typeof parser.ParseError).toBe('function');
    expect(typeof parser.SchemaValidationError).toBe('function');
    expect(typeof parser.UnsupportedVersionError).toBe('function');
  });

  test('rules exports are stable', () => {
    // The validation engine and its default rule registry.
    expect(typeof rules.validatePlugin).toBe('function');
    expect(typeof rules.applyFixes).toBe('function');
    expect(typeof rules.createDefaultRegistry).toBe('function');
    // Phase 16 incremental validation.
    expect(typeof rules.validateIncremental).toBe('function');
    expect(typeof rules.ValidationEngine).toBe('function');
    expect(typeof rules.RuleRegistry).toBe('function');
    expect(typeof rules.computeSummary).toBe('function');
    expect(rules.INTERNAL_ERROR_CODE).toBe('DOC-0000');
  });

  test('compatibility exports are stable', () => {
    // Client-compatibility checking for generated plugins.
    expect(typeof compatibility.checkCompatibility).toBe('function');
    expect(typeof compatibility.createDefaultClientRegistry).toBe('function');
    expect(typeof compatibility.CompatibilityChecker).toBe('function');
    expect(typeof compatibility.ClientProfileRegistry).toBe('function');
    expect(typeof compatibility.CompatibilityLevel).toBe('object');
  });

  test('report exports are stable', () => {
    // Report rendering for user-facing output after validation.
    expect(typeof report.generateReport).toBe('function');
    expect(typeof report.getFormatter).toBe('function');
    expect(typeof report.HumanReportFormatter).toBe('function');
    expect(typeof report.JsonReportFormatter).toBe('function');
    expect(typeof report.MarkdownReportFormatter).toBe('function');
  });

  test('cli exports the exit-code contract and error classification', () => {
    // Builder maps diagnostics to process exit codes exactly like the CLI:
    // 0=valid, 1=spec errors, 2=security-critical, 3=tool failure.
    expect(typeof cli.computeExitCode).toBe('function');
    expect(cli.EXIT_CODES).toEqual({
      SUCCESS: 0,
      SPEC_ERRORS: 1,
      SECURITY_CRITICAL: 2,
      TOOL_FAILURE: 3,
    });
    // ECO-010: the documented error classifier must be importable.
    expect(typeof cli.isPluginLoadError).toBe('function');
    // Program construction and entry points.
    expect(typeof cli.createProgram).toBe('function');
    expect(typeof cli.main).toBe('function');
    expect(cli.program).toBeDefined();
  });

  test('cli.isPluginLoadError classifies parser load/parse errors', () => {
    expect(
      cli.isPluginLoadError(new parser.LoadError('missing root', '/tmp/x')),
    ).toBe(true);
    expect(
      cli.isPluginLoadError(
        new parser.ParseError('invalid json', '/tmp/x/plugin.json'),
      ),
    ).toBe(true);
    expect(
      cli.isPluginLoadError(
        new parser.SchemaValidationError(
          'violates schema',
          '/tmp/x/plugin.json',
          [],
        ),
      ),
    ).toBe(true);
    expect(
      cli.isPluginLoadError(
        new parser.UnsupportedVersionError(
          'unsupported $schema',
          '/tmp/x/plugin.json',
          'https://agent-plugins.org/schemas/9.9.9/plugin.schema.json',
        ),
      ),
    ).toBe(true);
    // Anything else is not a plugin load error.
    expect(cli.isPluginLoadError(new Error('boom'))).toBe(false);
    expect(cli.isPluginLoadError('not an error')).toBe(false);
    expect(cli.isPluginLoadError(null)).toBe(false);
  });

  test('documented public types resolve from package entries', () => {
    // Compile-time surface: the type imports above must resolve from the
    // package entry points (covered by `bun run typecheck`). The runtime
    // assertions below use every imported type so a dangling import cannot
    // hide behind noUnusedLocals.
    const severity: Severity = 'error';
    const diagnostic: Diagnostic = {
      code: 'DOC-1001',
      severity,
      message: 'sample',
      ruleId: 'manifest-name-pattern',
      category: 'spec',
    };
    const exitCode: ExitCode = cli.computeExitCode([diagnostic]);
    const exitOptions: ExitCodeOptions = { strict: false };
    const format: ReportFormat = 'human';
    const reportOptions: ReportOptions = { format };
    const scanResult: ScanResult | null = null;
    const loadOptions: LoadOptions = {};
    const rule: Rule | null = null;
    const profile: ClientProfile | null = null;
    const level: CompatibilityLevel | null = null;
    const plugin: Plugin | null = null;

    expect(exitCode).toBe(cli.EXIT_CODES.SPEC_ERRORS);
    expect(exitOptions.strict).toBe(false);
    expect(reportOptions.format).toBe('human');
    expect(scanResult).toBeNull();
    expect(loadOptions).toEqual({});
    expect(rule).toBeNull();
    expect(profile).toBeNull();
    expect(level).toBeNull();
    expect(plugin).toBeNull();
  });
});
