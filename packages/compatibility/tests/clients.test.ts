import { describe, expect, test } from 'bun:test';
import { createDefaultClientRegistry } from '../src/clients.js';
import type { ClientProfile } from '../src/types.js';

describe('ClientProfileRegistry', () => {
  test('all 5 verified clients are registered', () => {
    const registry = createDefaultClientRegistry();
    const ids = registry
      .getAll()
      .map((client) => client.id)
      .sort();
    expect(ids).toEqual(['codex', 'copilot', 'cursor', 'kiro', 'vscode']);
    expect(registry.getAll()).toHaveLength(5);
  });

  test('every client has a name, spec versions, evidence, and source', () => {
    for (const client of createDefaultClientRegistry().getAll()) {
      expect(client.name.length).toBeGreaterThan(0);
      expect(client.supportedSpecVersions).toContain('1.0.0');
      expect(['docs', 'runtime', 'expected', 'none']).toContain(
        client.evidence,
      );
      expect(client.source).toMatch(/^https:\/\//);
    }
  });

  test('client profiles have correct capabilities', () => {
    const registry = createDefaultClientRegistry();
    const vscode = registry.get('vscode')!;
    expect(vscode.capabilities).toEqual({
      skills: true,
      mcpStdio: true,
      mcpStreamableHttp: true,
      mcpLegacySse: true,
      extensions: true,
    });
    // Codex is the only verified client without legacy SSE support.
    const codex = registry.get('codex')!;
    expect(codex.capabilities.mcpLegacySse).toBe(false);
    expect(codex.capabilities.skills).toBe(true);
    expect(codex.capabilities.mcpStreamableHttp).toBe(true);
  });

  test('get returns undefined for an unknown client', () => {
    expect(createDefaultClientRegistry().get('missing')).toBeUndefined();
  });

  test('registry can be extended with custom clients', () => {
    const registry = createDefaultClientRegistry();
    const custom: ClientProfile = {
      id: 'my-client',
      name: 'My Client',
      supportedSpecVersions: ['1.0.0'],
      capabilities: {
        skills: true,
        mcpStdio: false,
        mcpStreamableHttp: false,
        mcpLegacySse: false,
        extensions: false,
      },
      evidence: 'runtime',
      source: 'https://example.com/docs',
    };
    registry.register(custom);
    expect(registry.get('my-client')).toBe(custom);
    expect(registry.getAll()).toHaveLength(6);
  });

  test('registering a duplicate id throws', () => {
    const registry = createDefaultClientRegistry();
    expect(() => registry.register(registry.get('vscode')!)).toThrow(
      'already registered',
    );
  });

  test('clear removes every profile', () => {
    const registry = createDefaultClientRegistry();
    registry.clear();
    expect(registry.getAll()).toEqual([]);
    expect(registry.get('vscode')).toBeUndefined();
  });
});
