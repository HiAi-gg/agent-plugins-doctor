// Integration: per-server MCP failure isolation (P0 regression).
//
// Invalid individual MCP server entries must never silently disappear before
// diagnostics: the parser preserves every raw entry (valid servers typed,
// invalid entries `null`), emits a DOC-3008 parser diagnostic per invalid
// entry, and keeps validating valid sibling servers. This test file locks the
// four P0 cases from the bug report (invalid transport, reserved env key,
// cwd traversal, command traversal) plus the mixed valid/invalid case.

import { describe, expect, test } from 'bun:test';
import {
  createDefaultRegistry,
  ValidationEngine,
  validatePlugin,
} from '@agent-plugins-doctor/rules';
import { loadPlugin, scanPlugin } from '@agent-plugins-doctor/parser';
import { fixturePath } from './helpers.js';

const engine = new ValidationEngine(createDefaultRegistry());

describe('MCP per-server diagnostics', () => {
  test('mixed valid/invalid servers: valid preserved, invalid diagnosed', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/mixed-valid-invalid'),
    );

    // The two valid servers load as typed servers.
    expect(plugin.mcpConfig?.mcpServers['valid-stdio']).not.toBeNull();
    expect(plugin.mcpConfig?.mcpServers['valid-http']).not.toBeNull();
    expect(plugin.mcpConfig?.mcpServers['valid-http']?.type).toBe(
      'streamable-http',
    );

    // The invalid entry is preserved as null — not silently dropped.
    expect(plugin.mcpConfig?.mcpServers['invalid-transport']).toBeNull();

    // The parser records a DOC-3008 diagnostic naming the invalid server.
    expect(
      parseDiagnostics.some((d) => d.message.includes('invalid-transport')),
    ).toBe(true);
    const parserDiag = parseDiagnostics.find((d) =>
      d.message.includes('invalid-transport'),
    );
    expect(parserDiag?.code).toBe('DOC-3008');
    expect(parserDiag?.severity).toBe('error');
    expect(parserDiag?.ruleId).toBe('parser');
    expect(parserDiag?.category).toBe('mcp');
    expect(parserDiag?.file).toBe('mcp.json');

    // The rules engine also reports the invalid entry (DOC-3008), so
    // validatePlugin(plugin) — without parse diagnostics — still flags it.
    const result = await validatePlugin(plugin);
    expect(result.diagnostics.some((d) => d.code === 'DOC-3008')).toBe(true);
    expect(
      result.diagnostics.some((d) => d.message.includes('invalid-transport')),
    ).toBe(true);
    expect(result.compatible).toBe(false);
    expect(engine.computeExitCode(result.diagnostics)).toBe(1);
  });

  test('reserved env key produces diagnostic', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/reserved-env'),
    );
    expect(plugin.mcpConfig?.mcpServers['bad-env']).toBeNull();
    expect(
      parseDiagnostics.some(
        (d) => d.message.includes('PLUGIN_ROOT') && d.code === 'DOC-3008',
      ),
    ).toBe(true);
    expect(engine.computeExitCode(parseDiagnostics)).toBe(1);
  });

  test('cwd traversal produces diagnostic', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/cwd-traversal'),
    );
    expect(plugin.mcpConfig?.mcpServers['bad-cwd']).toBeNull();
    expect(
      parseDiagnostics.some(
        (d) => d.message.includes('cwd') && d.code === 'DOC-3008',
      ),
    ).toBe(true);
    // Traversal is security-critical: exit 2, not a plain validation error.
    expect(engine.computeExitCode(parseDiagnostics)).toBe(2);
  });

  test('command traversal produces diagnostic', async () => {
    const { plugin, parseDiagnostics } = await loadPlugin(
      fixturePath('mcp-per-server/command-traversal'),
    );
    expect(plugin.mcpConfig?.mcpServers['bad-command']).toBeNull();
    expect(
      parseDiagnostics.some(
        (d) => d.message.includes('command') && d.code === 'DOC-3008',
      ),
    ).toBe(true);
    // Traversal is security-critical: exit 2, not a plain validation error.
    expect(engine.computeExitCode(parseDiagnostics)).toBe(2);
  });

  test('scan -> validate pipeline (CLI path) exits 1 for the mixed fixture', async () => {
    const scan = await scanPlugin(
      fixturePath('mcp-per-server/mixed-valid-invalid'),
    );
    expect(scan.loaded.mcpConfig).toBe(true);
    // Valid siblings are still represented in the partial model.
    expect(Object.keys(scan.plugin?.mcpConfig?.mcpServers ?? {})).toEqual([
      'valid-stdio',
      'invalid-transport',
      'valid-http',
    ]);
    expect(scan.plugin?.mcpConfig?.mcpServers['valid-http']).not.toBeNull();
    expect(scan.plugin?.mcpConfig?.mcpServers['invalid-transport']).toBeNull();

    const result = await validatePlugin(scan);
    // Parser DOC-3008 (merged) and rule DOC-3008 both surface the entry.
    expect(
      result.diagnostics.filter((d) => d.code === 'DOC-3008').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      result.diagnostics.some((d) => d.message.includes('invalid-transport')),
    ).toBe(true);
    expect(result.compatible).toBe(false);
    expect(engine.computeExitCode(result.diagnostics)).toBe(1);
  });
});
