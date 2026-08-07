import { describe, expect, test } from 'bun:test';
import { secretDetectionRule } from '../../../src/rules/security/secret-detection.js';
import {
  byCode,
  checkRule,
  makeMcp,
  makePlugin,
} from '../../../tests/helpers.js';

describe('security/secret-detection (DOC-4003)', () => {
  test('no diagnostic for ordinary values', () => {
    const plugin = makePlugin({
      manifest: {
        description: 'A safe description',
        homepage: 'https://example.com',
      },
      mcpConfig: makeMcp({
        local: {
          type: 'stdio',
          command: 'node',
          env: { PATH: '/usr/bin', HOME: '/home/user' },
        },
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: { 'User-Agent': 'doctor/1.0' },
        },
      }),
    });
    expect(checkRule(secretDetectionRule, plugin)).toEqual([]);
  });

  test('placeholder values are not flagged (conservative)', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: {
          type: 'stdio',
          command: 'node',
          env: {
            API_KEY: '<your-key-here>',
            TOKEN: 'your-secret-token-1234567890',
            PASSWORD: 'changeme1234567890',
          },
        },
      }),
    });
    expect(checkRule(secretDetectionRule, plugin)).toEqual([]);
  });

  test('a generic API key in env is critical', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: {
          type: 'stdio',
          command: 'node',
          env: { API_KEY: 'sk-abcdef1234567890ghijklmnop' },
        },
      }),
    });
    const diagnostics = checkRule(secretDetectionRule, plugin);
    expect(byCode(diagnostics, 'DOC-4003')).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('critical');
    expect(diagnostics[0].file).toBe('./mcp.json');
  });

  test('an AWS access key id is critical', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: {
          type: 'stdio',
          command: 'node',
          env: { AWS_KEY: 'AKIAIOSFODNN7EXAMPLE' },
        },
      }),
    });
    expect(
      byCode(checkRule(secretDetectionRule, plugin), 'DOC-4003'),
    ).toHaveLength(1);
  });

  test('a GitHub token in headers is critical', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer ghp_1234567890abcdefghijklmn' },
        },
      }),
    });
    const diagnostics = checkRule(secretDetectionRule, plugin);
    expect(byCode(diagnostics, 'DOC-4003')).toHaveLength(1);
  });

  test('a PEM private key in the manifest is critical', () => {
    const plugin = makePlugin({
      manifest: {
        description:
          'Key: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
      },
    });
    const diagnostics = checkRule(secretDetectionRule, plugin);
    expect(byCode(diagnostics, 'DOC-4003')).toHaveLength(1);
    expect(diagnostics[0].file).toBe('./plugin.json');
  });

  test('a credential-bearing database URL is critical', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: {
          type: 'stdio',
          command: 'node',
          env: {
            DATABASE_URL:
              'postgres://admin:hunter2secret@db.example.com:5432/app',
          },
        },
      }),
    });
    expect(
      byCode(checkRule(secretDetectionRule, plugin), 'DOC-4003'),
    ).toHaveLength(1);
  });

  test('messages never include the secret value', () => {
    const secret = 'sk-super-secret-value-1234567890abcdef';
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', env: { API_KEY: secret } },
      }),
    });
    const diagnostics = checkRule(secretDetectionRule, plugin);
    expect(diagnostics[0].message).not.toContain(secret);
    expect(diagnostics[0].message).toContain('redacted');
  });

  test('short values are not flagged', () => {
    const plugin = makePlugin({
      mcpConfig: makeMcp({
        local: { type: 'stdio', command: 'node', env: { API_KEY: 'abc' } },
      }),
    });
    expect(checkRule(secretDetectionRule, plugin)).toEqual([]);
  });
});
