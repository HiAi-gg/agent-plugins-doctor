// Integration: the canonical `allowed-tools` string form end-to-end.
//
// Phase 1.1a made the parser preserve `allowed-tools` as a raw YAML value;
// Phase 1.2 rewrote DOC-2005 so the space-separated string is canonical.
// These tests load real on-disk fixtures through the parser and run the rules
// engine over them, verifying the whole pipeline: the canonical string form
// validates cleanly, and an invalid type is flagged by DOC-2005.

import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '@agent-plugins-doctor/parser';
import { validatePlugin } from '@agent-plugins-doctor/rules';
import { fixturePath } from './helpers.js';

describe('allowed-tools end-to-end', () => {
  test('canonical string form produces zero diagnostics', async () => {
    const { plugin } = await loadPlugin(fixturePath('allowed-tools-canonical'));
    const result = await validatePlugin(plugin);

    // No DOC-2005 diagnostics
    const doc2005 = result.diagnostics.filter((d) => d.code === 'DOC-2005');
    expect(doc2005).toHaveLength(0);

    // Overall valid
    expect(
      result.diagnostics.filter((d) => d.severity === 'error'),
    ).toHaveLength(0);
  });

  test('invalid type produces DOC-2005 error', async () => {
    const { plugin } = await loadPlugin(fixturePath('allowed-tools-invalid'));
    const result = await validatePlugin(plugin);

    // Should have DOC-2005 diagnostic
    const doc2005 = result.diagnostics.filter((d) => d.code === 'DOC-2005');
    expect(doc2005.length).toBeGreaterThan(0);
    expect(doc2005[0].severity).toBe('error');
  });

  test('spec example is accepted', async () => {
    // The spec example "Bash(git:*) Bash(jq:*) Read" is the exact
    // `allowed-tools` value of the canonical fixture, so loading and
    // validating it exercises the documented canonical form.
    const { plugin } = await loadPlugin(fixturePath('allowed-tools-canonical'));
    const result = await validatePlugin(plugin);

    expect(
      result.diagnostics.filter((d) => d.severity === 'error'),
    ).toHaveLength(0);
  });
});
