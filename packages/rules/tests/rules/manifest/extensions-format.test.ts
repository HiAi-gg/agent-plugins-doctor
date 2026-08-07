import { describe, expect, test } from 'bun:test';
import { extensionsFormatRule } from '../../../src/rules/manifest/extensions-format.js';
import { byCode, checkRule, makePlugin } from '../../../tests/helpers.js';

describe('manifest/extensions-format (DOC-1005)', () => {
  test('no diagnostic for valid reverse-domain extensions', () => {
    const plugin = makePlugin({
      manifest: {
        extensions: {
          'com.example.client': { enabled: true },
          'io.vendor.tool': {},
        },
      },
    });
    expect(checkRule(extensionsFormatRule, plugin)).toEqual([]);
  });

  test('no diagnostic when extensions is absent', () => {
    expect(checkRule(extensionsFormatRule, makePlugin())).toEqual([]);
  });

  test('a non-namespace key produces a warning', () => {
    const plugin = makePlugin({
      manifest: { extensions: { 'my-extension': { a: 1 } } },
    });
    const diagnostics = checkRule(extensionsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-1005')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toContain('"my-extension"');
  });

  test('a non-object value produces a warning', () => {
    const plugin = makePlugin({
      manifest: { extensions: { 'com.example.client': 'not-an-object' } },
    });
    const diagnostics = checkRule(extensionsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-1005')).toHaveLength(1);
  });

  test('a non-object extensions field produces a warning', () => {
    const plugin = makePlugin({ manifest: { extensions: 'nope' } });
    const diagnostics = checkRule(extensionsFormatRule, plugin);
    expect(byCode(diagnostics, 'DOC-1005')).toHaveLength(1);
    expect(diagnostics[0].message).toContain('extensions');
  });
});
