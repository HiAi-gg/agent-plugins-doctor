import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanup,
  makeTempDir,
  runCli,
  ssePlugin,
  validPlugin,
} from './helpers.js';

interface JsonCheck {
  clientId: string;
  clientName: string;
  compatible: boolean;
  issues: { severity: string; message: string }[];
  evidence: string;
}

interface JsonResult {
  plugin: { name: string; specVersion: string };
  summary: { total: number; compatible: number; incompatible: number };
  clients: JsonCheck[];
}

describe('compatibility command', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    cleanup(dir);
  });

  test('all clients shown by default', async () => {
    validPlugin(dir);
    const result = await runCli(['compatibility', dir]);
    expect(result.stdout).toContain('VS Code');
    expect(result.stdout).toContain('Cursor');
    expect(result.stdout).toContain('GitHub Copilot');
    expect(result.stdout).toContain('ChatGPT & Codex');
    expect(result.stdout).toContain('Kiro');
    expect(result.stdout).toContain('Summary: 5 compatible, 0 incompatible');
    expect(result.exitCode).toBe(0);
  });

  test('--client filters to specific client', async () => {
    validPlugin(dir);
    const result = await runCli(['compatibility', dir, '--client', 'cursor']);
    expect(result.stdout).toContain('Cursor');
    expect(result.stdout).not.toContain('VS Code');
    expect(result.stdout).not.toContain('Kiro');
    expect(result.exitCode).toBe(0);
  });

  test('unknown --client exits 3', async () => {
    validPlugin(dir);
    const result = await runCli(['compatibility', dir, '--client', 'nope']);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('Unknown client');
  });

  test('JSON output includes all compatibility data', async () => {
    validPlugin(dir);
    const result = await runCli(['compatibility', dir, '--json']);
    const data = JSON.parse(result.stdout) as JsonResult;
    expect(data.plugin.name).toBe('valid-plugin');
    expect(data.plugin.specVersion).toBe('1.0.0');
    expect(data.summary.total).toBe(5);
    expect(data.summary.compatible).toBe(5);
    expect(data.summary.incompatible).toBe(0);
    expect(data.clients).toHaveLength(5);
    expect(data.clients.map((client) => client.clientId)).toEqual([
      'vscode',
      'cursor',
      'copilot',
      'codex',
      'kiro',
    ]);
    for (const client of data.clients) {
      expect(client.compatible).toBe(true);
      expect(client.issues).toEqual([]);
      expect(client.evidence).toMatch(/^(docs|runtime|expected|none)$/);
    }
    expect(result.exitCode).toBe(0);
  });

  test('incompatible client shows issues', async () => {
    // The SSE transport is unsupported by codex, so it is incompatible.
    ssePlugin(dir);
    const result = await runCli(['compatibility', dir, '--json']);
    const data = JSON.parse(result.stdout) as JsonResult;

    const codex = data.clients.find((client) => client.clientId === 'codex');
    expect(codex).toBeDefined();
    expect(codex?.compatible).toBe(false);
    expect(codex?.issues.length).toBeGreaterThan(0);
    expect(codex?.issues[0].message).toContain('does not support sse');

    // Everyone else stays compatible.
    expect(data.summary.total).toBe(5);
    expect(data.summary.compatible).toBe(4);
    expect(data.summary.incompatible).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  test('incompatible client shown in human output', async () => {
    ssePlugin(dir);
    const result = await runCli(['compatibility', dir, '--no-color']);
    expect(result.stdout).toContain('ChatGPT & Codex');
    expect(result.stdout).toContain('does not support sse MCP servers');
    expect(result.stdout).toContain('Summary: 4 compatible, 1 incompatible');
    expect(result.exitCode).toBe(1);
  });
});
