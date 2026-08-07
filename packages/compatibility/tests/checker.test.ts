import { describe, expect, test } from 'bun:test';
import { v1 } from '@agent-plugin-doctor/core';
import type { McpConfig, Plugin } from '@agent-plugin-doctor/core';
import { checkCompatibility, CompatibilityChecker } from '../src/checker.js';
import {
  ClientProfileRegistry,
  createDefaultClientRegistry,
} from '../src/clients.js';
import { CompatibilityLevel, type CompatibilityResult } from '../src/types.js';

function makePlugin(
  overrides: {
    specVersion?: string;
    skills?: Plugin['skills'];
    mcpConfig?: McpConfig;
    extensions?: Plugin['extensions'];
  } = {},
): Plugin {
  return {
    rootDir: '/tmp/doctor-plugin',
    specVersion: overrides.specVersion ?? '1.0.0',
    manifest: { $schema: v1.PLUGIN_SCHEMA_URL, name: 'test-plugin' },
    mcpConfig: overrides.mcpConfig,
    skills: overrides.skills ?? [],
    extensions: overrides.extensions ?? [],
  };
}

function makeSkill(): Plugin['skills'][number] {
  return {
    name: 'summarize',
    description: 'Summarize text',
    body: '# Summarize\n\nDo the thing.',
    directory: 'skills/summarize',
    frontmatter: { name: 'summarize', description: 'Summarize text' },
  };
}

function makeMcp(servers: Record<string, unknown>): McpConfig {
  return {
    $schema: v1.MCP_SCHEMA_URL,
    mcpServers: servers as McpConfig['mcpServers'],
  };
}

describe('CompatibilityChecker', () => {
  test('plugin with only skills is compatible with all clients', () => {
    const result = checkCompatibility(makePlugin({ skills: [makeSkill()] }));
    expect(result.checks).toHaveLength(5);
    for (const check of result.checks) {
      expect(check.compatible).toBe(true);
      expect(check.level).toBe(CompatibilityLevel.FULL);
      expect(check.working).toEqual(['skills']);
      expect(check.unsupported).toEqual([]);
      expect(check.issues).toEqual([]);
    }
    expect(result.summary).toEqual({
      total: 5,
      compatible: 5,
      incompatible: 0,
    });
  });

  test('plugin with stdio MCP is compatible with all clients', () => {
    const result = checkCompatibility(
      makePlugin({
        mcpConfig: makeMcp({
          main: { type: 'stdio', command: 'node', args: ['server.js'] },
        }),
      }),
    );
    expect(result.summary).toEqual({
      total: 5,
      compatible: 5,
      incompatible: 0,
    });
    for (const check of result.checks) {
      expect(check.level).toBe(CompatibilityLevel.FULL);
      expect(check.working).toEqual(['mcp-stdio']);
    }
  });

  test('plugin with streamable-http MCP is compatible with all clients', () => {
    const result = checkCompatibility(
      makePlugin({
        mcpConfig: makeMcp({
          main: { type: 'streamable-http', url: 'https://example.com/mcp' },
        }),
      }),
    );
    for (const check of result.checks) {
      expect(check.compatible).toBe(true);
      expect(check.level).toBe(CompatibilityLevel.FULL);
      expect(check.working).toEqual(['mcp-streamable-http']);
      expect(check.issues).toEqual([]);
    }
  });

  test('plugin with SSE MCP is incompatible with Codex but compatible with others', () => {
    const result = checkCompatibility(
      makePlugin({
        mcpConfig: makeMcp({
          main: { type: 'sse', url: 'https://example.com/sse' },
        }),
      }),
    );
    const codex = result.checks.find((check) => check.clientId === 'codex')!;
    expect(codex.compatible).toBe(false);
    expect(codex.level).toBe(CompatibilityLevel.UNSUPPORTED);
    expect(codex.working).toEqual([]);
    expect(codex.unsupported).toEqual(['mcp-sse']);
    expect(codex.issues).toHaveLength(1);
    expect(codex.issues[0]).toMatchObject({
      severity: 'error',
      component: 'mcp',
    });
    expect(codex.issues[0].message).toContain('sse');
    for (const check of result.checks.filter(
      (check) => check.clientId !== 'codex',
    )) {
      expect(check.compatible).toBe(true);
      expect(check.level).toBe(CompatibilityLevel.FULL);
      expect(check.issues).toEqual([]);
    }
    expect(result.summary).toEqual({
      total: 5,
      compatible: 4,
      incompatible: 1,
    });
  });

  test('mixed capabilities produce PARTIAL for a client missing one of them', () => {
    // Skills + stdio + SSE: Codex lacks only the legacy SSE transport.
    const result = checkCompatibility(
      makePlugin({
        skills: [makeSkill()],
        mcpConfig: makeMcp({
          main: { type: 'stdio', command: 'node', args: ['server.js'] },
          remote: { type: 'sse', url: 'https://example.com/sse' },
        }),
      }),
    );
    const codex = result.checks.find((check) => check.clientId === 'codex')!;
    expect(codex.level).toBe(CompatibilityLevel.PARTIAL);
    expect(codex.compatible).toBe(false);
    expect(codex.working).toEqual(['skills', 'mcp-stdio']);
    expect(codex.unsupported).toEqual(['mcp-sse']);
    expect(codex.issues).toHaveLength(1);
    // Clients that support every used capability stay FULL.
    const vscode = result.checks.find((check) => check.clientId === 'vscode')!;
    expect(vscode.level).toBe(CompatibilityLevel.FULL);
    expect(vscode.compatible).toBe(true);
    expect(vscode.working).toEqual(['skills', 'mcp-stdio', 'mcp-sse']);
  });

  test('a client profile with evidence "none" reports UNKNOWN', () => {
    const registry = new ClientProfileRegistry();
    registry.register({
      id: 'unverified',
      name: 'Unverified',
      supportedSpecVersions: ['1.0.0'],
      capabilities: {
        skills: true,
        mcpStdio: true,
        mcpStreamableHttp: true,
        mcpLegacySse: true,
        extensions: true,
      },
      evidence: 'none',
      source: 'https://example.com/unverified',
      verificationNote: 'Verified in test fixture',
    });
    const result = new CompatibilityChecker(registry).check(
      makePlugin({ skills: [makeSkill()] }),
    );
    const check = result.checks[0];
    expect(check.level).toBe(CompatibilityLevel.UNKNOWN);
    expect(check.compatible).toBe(false);
    expect(check.issues).toEqual([]);
  });

  test('plugin with extensions is fine for clients that support the mechanism', () => {
    // Every default client has extensions: true, meaning it supports the
    // extension mechanism and safely ignores unknown namespaces per §8.2 —
    // so a plugin with extensions raises no issue and stays FULL.
    const result = checkCompatibility(
      makePlugin({
        extensions: [
          {
            namespace: 'com.example.client',
            data: {},
            path: 'ext/client.json',
          },
        ],
      }),
    );
    for (const check of result.checks) {
      expect(check.compatible).toBe(true);
      expect(check.level).toBe(CompatibilityLevel.FULL);
      // Extensions never contribute to working/unsupported.
      expect(check.working).toEqual([]);
      expect(check.unsupported).toEqual([]);
      expect(check.issues).toEqual([]);
      expect(check.extensionsHandling).toBe('ignored');
    }
    expect(result.summary.compatible).toBe(5);
  });

  test('a client with extensions: true does not claim to understand the namespace', () => {
    // The simple model cannot verify namespace understanding: extensions:
    // true means the mechanism is supported and unknown namespaces are
    // safely ignored (§8.2) — never that the namespace is "understood".
    const result = checkCompatibility(
      makePlugin({
        extensions: [
          {
            namespace: 'com.example.foo',
            data: {},
            path: 'ext/foo.json',
          },
        ],
      }),
    );
    for (const check of result.checks) {
      expect(check.extensionsHandling).toBe('ignored');
      expect(check.issues).toEqual([]);
      expect(
        check.issues.map((issue) => issue.message).join(' '),
      ).not.toContain('understands');
    }
  });

  test('plugin with extensions warns for clients that do not support them', () => {
    const registry = createDefaultClientRegistry();
    registry.register({
      id: 'minimal',
      name: 'Minimal',
      supportedSpecVersions: ['1.0.0'],
      capabilities: {
        skills: true,
        mcpStdio: true,
        mcpStreamableHttp: false,
        mcpLegacySse: false,
        extensions: false,
      },
      evidence: 'expected',
      source: 'https://example.com/docs',
      verificationNote: 'Verified in test fixture',
    });
    const result = new CompatibilityChecker(registry).check(
      makePlugin({
        extensions: [
          {
            namespace: 'com.example.client',
            data: {},
            path: 'ext/client.json',
          },
        ],
      }),
    );
    const minimal = result.checks.find(
      (check) => check.clientId === 'minimal',
    )!;
    // Warnings are not blocking: the plugin still works without extensions.
    expect(minimal.compatible).toBe(true);
    expect(minimal.level).toBe(CompatibilityLevel.FULL);
    expect(minimal.working).toEqual([]);
    expect(minimal.unsupported).toEqual([]);
    expect(minimal.extensionsHandling).toBe('unsupported');
    expect(minimal.issues).toHaveLength(1);
    expect(minimal.issues[0]).toMatchObject({
      severity: 'warning',
      component: 'extensions',
    });
    expect(minimal.issues[0].message).toContain('does not support extensions');
    // Every default client (extensions: true) stays issue-free.
    for (const check of result.checks.filter(
      (check) => check.clientId !== 'minimal',
    )) {
      expect(check.issues).toEqual([]);
      expect(check.extensionsHandling).toBe('ignored');
    }
  });

  test('plugin with extensions reports info for clients with unverified behavior', () => {
    const registry = createDefaultClientRegistry();
    registry.register({
      id: 'unverified-extensions',
      name: 'Unverified Extensions',
      supportedSpecVersions: ['1.0.0'],
      capabilities: {
        skills: true,
        mcpStdio: true,
        mcpStreamableHttp: true,
        mcpLegacySse: true,
        extensions: true,
      },
      evidence: 'none',
      source: 'https://example.com/unverified',
      verificationNote: 'Verified in test fixture',
    });
    const result = new CompatibilityChecker(registry).check(
      makePlugin({
        extensions: [
          {
            namespace: 'com.example.client',
            data: {},
            path: 'ext/client.json',
          },
        ],
      }),
    );
    const check = result.checks.find(
      (client) => client.clientId === 'unverified-extensions',
    )!;
    expect(check.extensionsHandling).toBe('unknown');
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'info',
      component: 'extensions',
    });
    expect(check.issues[0].message).toContain('unverified');
  });

  test('plugin without extensions has no extensionsHandling field', () => {
    const result = checkCompatibility(makePlugin({ skills: [makeSkill()] }));
    for (const check of result.checks) {
      expect(check.extensionsHandling).toBeUndefined();
    }
  });

  test('plugin with an unsupported spec version reports an error for every client', () => {
    const result = checkCompatibility(
      makePlugin({ specVersion: '2.0.0', skills: [makeSkill()] }),
    );
    for (const check of result.checks) {
      expect(check.compatible).toBe(false);
      expect(check.level).toBe(CompatibilityLevel.UNSUPPORTED);
      expect(check.issues).toHaveLength(1);
      expect(check.issues[0].severity).toBe('error');
      expect(check.issues[0].message).toContain('2.0.0');
    }
    expect(result.summary.incompatible).toBe(5);
  });

  test('empty plugin (no components) is compatible with all clients', () => {
    const result = checkCompatibility(makePlugin());
    for (const check of result.checks) {
      expect(check.compatible).toBe(true);
      expect(check.level).toBe(CompatibilityLevel.FULL);
      expect(check.working).toEqual([]);
      expect(check.unsupported).toEqual([]);
      expect(check.issues).toEqual([]);
      expect(check.evidence).toBe('docs');
    }
    expect(result.summary).toEqual({
      total: 5,
      compatible: 5,
      incompatible: 0,
    });
  });

  test('evidence is recorded from the client profile', () => {
    const result = checkCompatibility(
      makePlugin({ skills: [makeSkill()], extensions: [] }),
    );
    for (const check of result.checks) {
      expect(['docs', 'runtime', 'expected', 'none']).toContain(check.evidence);
    }
  });

  test('checkCompatibility accepts a custom registry', () => {
    const registry = new ClientProfileRegistry();
    registry.register({
      id: 'minimal',
      name: 'Minimal',
      supportedSpecVersions: ['1.0.0'],
      capabilities: {
        skills: true,
        mcpStdio: true,
        mcpStreamableHttp: true,
        mcpLegacySse: true,
        extensions: true,
      },
      evidence: 'runtime',
      source: 'https://example.com/docs',
      verificationNote: 'Verified in test fixture',
    });
    const result = checkCompatibility(makePlugin(), registry);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].clientId).toBe('minimal');
  });

  test('a registry without clients produces no checks', () => {
    const result = new CompatibilityChecker(new ClientProfileRegistry()).check(
      makePlugin(),
    );
    expect(result.checks).toEqual([]);
    expect(result.summary).toEqual({
      total: 0,
      compatible: 0,
      incompatible: 0,
    });
  });
});

describe('CompatibilityResult shape', () => {
  test('result carries the plugin and per-client checks', () => {
    const plugin = makePlugin({ skills: [makeSkill()] });
    const result: CompatibilityResult = checkCompatibility(plugin);
    expect(result.plugin).toBe(plugin);
    expect(result.checks.length).toBe(result.summary.total);
  });
});
