import { describe, expect, test } from 'bun:test';
import {
  COMPATIBILITY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  getCurrentSpecVersion,
  getSpecVersion,
  MCP_SCHEMA_URL,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  PLUGIN_SCHEMA_URL,
  resolveSpecVersion,
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_PATTERN,
  SPEC_VERSION,
  SUPPORTED_COMPONENT_TYPES,
} from '../src/index.js';
import * as current from '../src/spec/current.js';
import { v1 } from '../src/spec/index.js';

describe('spec constants', () => {
  test('version and schema URLs are correct', () => {
    expect(SPEC_VERSION).toBe('1.0.0');
    expect(PLUGIN_SCHEMA_URL).toBe(
      'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    );
    expect(MCP_SCHEMA_URL).toBe(
      'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    );
  });

  test('length limits are correct', () => {
    expect(NAME_MAX_LENGTH).toBe(64);
    expect(SKILL_NAME_MAX_LENGTH).toBe(64);
    expect(DESCRIPTION_MAX_LENGTH).toBe(1024);
    expect(COMPATIBILITY_MAX_LENGTH).toBe(500);
  });

  test('supported component types', () => {
    expect(SUPPORTED_COMPONENT_TYPES).toEqual(['skills', 'mcp']);
  });

  test('current.ts aliases v1', () => {
    expect(current.SPEC_VERSION).toBe('1.0.0');
    expect(current.PLUGIN_SCHEMA_URL).toBe(PLUGIN_SCHEMA_URL);
    expect(current.MCP_SCHEMA_URL).toBe(MCP_SCHEMA_URL);
  });
});

describe('NAME_PATTERN', () => {
  const validNames = [
    'a',
    '1',
    'plugin',
    'my-plugin',
    'my.plugin',
    'a1',
    'my-plugin.v2',
    'x.y-z',
    'a'.repeat(64),
  ];

  test.each(validNames)('matches valid plugin name: %s', (name) => {
    expect({ name, valid: NAME_PATTERN.test(name) }).toEqual({
      name,
      valid: true,
    });
  });

  const invalidNames = [
    '',
    'MyPlugin',
    'my--plugin',
    'my..plugin',
    '-my',
    'my-',
    '.my',
    'my.',
    'my_plugin',
    'my plugin',
    'plugin!',
    '--',
    '..',
    'my-plugin--v2',
  ];

  test.each(invalidNames)('rejects invalid plugin name: %s', (name) => {
    expect({ name, valid: NAME_PATTERN.test(name) }).toEqual({
      name,
      valid: false,
    });
  });

  test('length is enforced separately from the pattern', () => {
    // A 65-char name passes the regex but violates NAME_MAX_LENGTH, so
    // validation must check both.
    expect(NAME_PATTERN.test('a'.repeat(65))).toBe(true);
    expect('a'.repeat(65).length).toBeGreaterThan(NAME_MAX_LENGTH);
  });
});

describe('SKILL_NAME_PATTERN', () => {
  const validNames = [
    'a',
    '1',
    'skill',
    'my-skill',
    'summarize',
    'a1',
    'x-y-z',
    'a'.repeat(64),
  ];

  test.each(validNames)('matches valid skill name: %s', (name) => {
    expect({ name, valid: SKILL_NAME_PATTERN.test(name) }).toEqual({
      name,
      valid: true,
    });
  });

  const invalidNames = [
    '',
    'MySkill',
    'my--skill',
    '-skill',
    'skill-',
    'skill_name',
    'skill.name',
    'skill name',
  ];

  test.each(invalidNames)('rejects invalid skill name: %s', (name) => {
    expect({ name, valid: SKILL_NAME_PATTERN.test(name) }).toEqual({
      name,
      valid: false,
    });
  });
});

describe('spec version registry', () => {
  test('resolveSpecVersion maps both schema URLs to 1.0.0', () => {
    expect(resolveSpecVersion(PLUGIN_SCHEMA_URL)?.version).toBe('1.0.0');
    expect(resolveSpecVersion(MCP_SCHEMA_URL)?.version).toBe('1.0.0');
  });

  test('resolveSpecVersion returns null for unknown schema URLs', () => {
    expect(
      resolveSpecVersion(
        'https://agent-plugins.org/schemas/9.9.9/plugin.schema.json',
      ),
    ).toBeNull();
    expect(resolveSpecVersion('')).toBeNull();
    expect(resolveSpecVersion('not-a-url')).toBeNull();
  });

  test('getSpecVersion returns the registered version or null', () => {
    const spec = getSpecVersion('1.0.0');
    expect(spec?.version).toBe('1.0.0');
    expect(spec?.pluginSchemaUrl).toBe(PLUGIN_SCHEMA_URL);
    expect(spec?.nameMaxLength).toBe(64);
    expect(spec?.skillNameMaxLength).toBe(64);
    expect(spec?.descriptionMaxLength).toBe(1024);
    expect(spec?.compatibilityMaxLength).toBe(500);
    expect(spec?.supportedComponentTypes).toEqual(['skills', 'mcp']);
    expect(getSpecVersion('0.9.0')).toBeNull();
    expect(getSpecVersion('1.1.0')).toBeNull();
  });

  test('registry values are wired to the v1 constants', () => {
    const spec = getSpecVersion('1.0.0');
    expect(spec?.namePattern).toBe(NAME_PATTERN);
    expect(spec?.skillNamePattern).toBe(SKILL_NAME_PATTERN);
    expect(spec?.mcpSchemaUrl).toBe(MCP_SCHEMA_URL);
  });

  test('getCurrentSpecVersion resolves to the current spec', () => {
    const spec = getCurrentSpecVersion();
    expect(spec.version).toBe(SPEC_VERSION);
    expect(spec.pluginSchemaUrl).toBe(PLUGIN_SCHEMA_URL);
    expect(spec.mcpSchemaUrl).toBe(MCP_SCHEMA_URL);
  });

  test('v1 namespace is exported from the registry', () => {
    expect(v1.SPEC_VERSION).toBe('1.0.0');
    expect(v1.SUPPORTED_COMPONENT_TYPES).toEqual(['skills', 'mcp']);
  });
});
