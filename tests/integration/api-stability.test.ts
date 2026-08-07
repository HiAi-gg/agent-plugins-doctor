// Integration: the public API surface must stay stable.
//
// Builder consumes Doctor's packages programmatically, so these tests pin the
// exports of every package Builder imports. An accidental breaking change
// (rename, removal, or signature change) is caught at the source instead of
// surfacing downstream in Builder. Type-level compatibility is additionally
// proven by the explicit type annotations elsewhere in tests/integration.

import { describe, expect, test } from 'bun:test';
import * as cli from '@agent-plugin-doctor/cli';
import * as compatibility from '@agent-plugin-doctor/compatibility';
import * as core from '@agent-plugin-doctor/core';
import * as parser from '@agent-plugin-doctor/parser';
import * as report from '@agent-plugin-doctor/report';
import * as rules from '@agent-plugin-doctor/rules';

describe('public API stability', () => {
  test('core exports are stable', () => {
    // These are the functions Builder depends on for spec + path handling.
    expect(typeof core.resolveSpecVersion).toBe('function');
    expect(typeof core.resolvePluginPath).toBe('function');
    expect(typeof core.isWithinPath).toBe('function');
  });

  test('parser exports are stable', () => {
    // Parser is the single canonical loader/parser Builder calls after
    // generation; it replaces Builder's regex-based frontmatter parsing.
    expect(typeof parser.loadPlugin).toBe('function');
    expect(typeof parser.parsePluginManifest).toBe('function');
    expect(typeof parser.parseMcpConfig).toBe('function');
    expect(typeof parser.parseSkillFrontmatter).toBe('function');
    // Phase 16 performance surface: parsed-file cache and bounded traversal.
    expect(typeof parser.ParsedFileCache).toBe('function');
    expect(typeof parser.walkPluginFiles).toBe('function');
  });

  test('rules exports are stable', () => {
    // The validation engine and its default rule registry.
    expect(typeof rules.validatePlugin).toBe('function');
    expect(typeof rules.applyFixes).toBe('function');
    expect(typeof rules.createDefaultRegistry).toBe('function');
    // Phase 16 incremental validation.
    expect(typeof rules.validateIncremental).toBe('function');
  });

  test('compatibility exports are stable', () => {
    // Client-compatibility checking for generated plugins.
    expect(typeof compatibility.checkCompatibility).toBe('function');
    expect(typeof compatibility.createDefaultClientRegistry).toBe('function');
  });

  test('report exports are stable', () => {
    // Report rendering for user-facing output after validation.
    expect(typeof report.generateReport).toBe('function');
    expect(typeof report.getFormatter).toBe('function');
  });

  test('cli exports the exit-code contract', () => {
    // Builder maps diagnostics to process exit codes exactly like the CLI:
    // 0=valid, 1=spec errors, 2=security-critical, 3=tool failure.
    expect(typeof cli.computeExitCode).toBe('function');
    expect(cli.EXIT_CODES).toEqual({
      SUCCESS: 0,
      SPEC_ERRORS: 1,
      SECURITY_CRITICAL: 2,
      TOOL_FAILURE: 3,
    });
  });
});
