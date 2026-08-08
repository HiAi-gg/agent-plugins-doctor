// Integration: P1 fixes for v0.0.3.
//
// 1. Non-object `extensions` produces an explicit DOC-1009 diagnostic
//    (P1 #6) instead of being silently ignored.
// 2. Security rules DOC-4001/DOC-4002 are CLI-reachable: symlink escapes are
//    detected during loader discovery and produce DOC-4002 (P1 #7).
// 3. `checkCompatibility(null)` no longer crashes (P1 #8).
// 4. Unsupported versions produce a clear DOC-1010 message naming the
//    detected and supported versions (P1 #10).

import { describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompatibility } from '@agent-plugins-doctor/compatibility';
import { loadPlugin, scanPlugin } from '@agent-plugins-doctor/parser';
import { canonicalJson, cleanup, fixturePath, makeTempDir } from './helpers.js';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

describe('P1 fixes for v0.0.3', () => {
  test('non-object extensions produces DOC-1009', async () => {
    const { parseDiagnostics } = await loadPlugin(
      fixturePath('non-object-extensions'),
    );
    expect(parseDiagnostics.some((d) => d.code === 'DOC-1009')).toBe(true);

    const diag = parseDiagnostics.find((d) => d.code === 'DOC-1009');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('extensions');
    expect(diag?.file).toBe('plugin.json');
  });

  test('non-object extensions is still non-fatal (plugin loads)', async () => {
    const { plugin } = await loadPlugin(fixturePath('non-object-extensions'));
    expect(plugin).not.toBeNull();
    expect(plugin?.manifest.extensions).toBeUndefined();
  });

  test('symlink escape during discovery produces DOC-4002', async () => {
    const root = makeTempDir();
    const outside = makeTempDir('doctor-outside-');
    try {
      writeFileSync(
        join(root, 'plugin.json'),
        canonicalJson({ $schema: PLUGIN_SCHEMA, name: 'symlink-escape' }),
      );
      mkdirSync(join(root, 'skills'), { recursive: true });
      // skills/evil resolves outside the plugin root via a symlink.
      symlinkSync(outside, join(root, 'skills', 'evil'));

      const { plugin, parseDiagnostics } = await loadPlugin(root);
      const diag = parseDiagnostics.find((d) => d.code === 'DOC-4002');
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('critical');
      expect(diag?.category).toBe('security');
      expect(diag?.message).toContain('skills/evil');
      // The escaping component never loads; the rest of the plugin survives.
      expect(plugin?.skills).toEqual([]);
    } finally {
      cleanup(root);
      cleanup(outside);
    }
  });

  test('extension namespace symlink escape produces DOC-4002', async () => {
    const root = makeTempDir();
    const outside = makeTempDir('doctor-outside-');
    try {
      writeFileSync(
        join(root, 'plugin.json'),
        canonicalJson({ $schema: PLUGIN_SCHEMA, name: 'symlink-ext' }),
      );
      // com.example.evil resolves outside the plugin root via a symlink.
      symlinkSync(outside, join(root, 'com.example.evil'));

      const { plugin, parseDiagnostics } = await loadPlugin(root);
      const diag = parseDiagnostics.find((d) => d.code === 'DOC-4002');
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('critical');
      expect(diag?.message).toContain('com.example.evil');
      expect(plugin?.extensions).toEqual([]);
    } finally {
      cleanup(root);
      cleanup(outside);
    }
  });

  test('checkCompatibility(null) returns an empty result', () => {
    const result = checkCompatibility(null);
    expect(result.plugin).toBeNull();
    expect(result.checks).toEqual([]);
    expect(result.summary).toEqual({
      total: 0,
      compatible: 0,
      incompatible: 0,
    });
  });

  test('checkCompatibility(undefined) returns an empty result', () => {
    const result = checkCompatibility(undefined);
    expect(result.plugin).toBeNull();
    expect(result.checks).toEqual([]);
  });

  test('unsupported version produces a clear message', async () => {
    // scanPlugin never throws; it mirrors the CLI check path.
    const { plugin, diagnostics } = await scanPlugin(
      fixturePath('unsupported-version'),
    );
    expect(plugin).toBeNull();
    const diag = diagnostics.find((d) => d.code === 'DOC-1010');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('2.0.0');
    expect(diag?.message).toContain('1.0.0');
  });
});
