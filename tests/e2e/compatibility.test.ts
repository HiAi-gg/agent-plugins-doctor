// E2E: `compatibility` command with the real CLI binary.

import { describe, expect, test } from 'bun:test';
import { fixturePath, runCli } from './helpers.js';

const MINIMAL = fixturePath('minimal-plugin');

describe('e2e compatibility command', () => {
  test('without --client, all 5 verified clients are shown', async () => {
    const result = await runCli(['compatibility', MINIMAL, '--no-color']);
    expect(result.exitCode).toBe(0);
    for (const clientName of [
      'VS Code',
      'Cursor',
      'GitHub Copilot',
      'ChatGPT & Codex',
      'Kiro',
    ]) {
      expect(result.stdout).toContain(clientName);
    }
    expect(result.stdout).toContain('Summary: 5 compatible, 0 incompatible');
  });

  test('--client vscode filters to a single client', async () => {
    const result = await runCli([
      'compatibility',
      MINIMAL,
      '--client',
      'vscode',
      '--no-color',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('VS Code');
    expect(result.stdout).not.toContain('Cursor');
    expect(result.stdout).not.toContain('Kiro');
    expect(result.stdout).toContain('Summary: 1 compatible, 0 incompatible');
  });

  test('--json outputs valid JSON with a summary and 5 clients', async () => {
    const result = await runCli(['compatibility', MINIMAL, '--json']);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout) as {
      plugin: { name: string };
      summary: { total: number; compatible: number; incompatible: number };
      clients: {
        clientId: string;
        clientName: string;
        level: string;
        compatible: boolean;
      }[];
    };
    expect(data.plugin.name).toBe('minimal-plugin');
    expect(data.summary.total).toBe(5);
    expect(data.summary.compatible).toBe(5);
    expect(data.summary.incompatible).toBe(0);
    expect(data.clients).toHaveLength(5);
    const ids = data.clients.map((c) => c.clientId).sort();
    expect(ids).toEqual(['codex', 'copilot', 'cursor', 'kiro', 'vscode']);
    expect(data.clients.every((c) => c.compatible)).toBe(true);
    expect(data.clients.every((c) => c.level === 'full')).toBe(true);
  });

  test('--json --client codex returns a single client entry', async () => {
    const result = await runCli([
      'compatibility',
      MINIMAL,
      '--client',
      'codex',
      '--json',
    ]);
    const data = JSON.parse(result.stdout) as {
      summary: { total: number };
      clients: { clientId: string }[];
    };
    expect(data.summary.total).toBe(1);
    expect(data.clients[0].clientId).toBe('codex');
  });

  test('unknown client exits 3', async () => {
    const result = await runCli([
      'compatibility',
      MINIMAL,
      '--client',
      'bogus',
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('Unknown client');
  });
});
