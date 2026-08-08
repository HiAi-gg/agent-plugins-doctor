import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ParseError,
  SchemaValidationError,
  parseMcpConfig,
} from '../src/index.js';

const SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

function makeTempFile(content: string): { dir: string; filePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'doctor-mcp-'));
  const filePath = join(dir, 'mcp.json');
  writeFileSync(filePath, content);
  return { dir, filePath };
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe('parseMcpConfig', () => {
  test('valid mcp.json with all server types parses correctly', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        mcpServers: {
          local: {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
            env: { FOO: 'bar' },
            cwd: './',
          },
          remote: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'x' },
          },
          legacy: { type: 'sse', url: 'https://example.com/sse' },
        },
      }),
    );
    try {
      const config = parseMcpConfig(filePath);
      expect(config).toBeDefined();
      expect(config?.$schema).toBe(SCHEMA_URL);
      expect(Object.keys(config?.mcpServers ?? {})).toEqual([
        'local',
        'remote',
        'legacy',
      ]);
      const local = config?.mcpServers.local;
      expect(local?.type).toBe('stdio');
      if (local?.type === 'stdio') {
        expect(local.command).toBe('node');
      }
      expect(config?.mcpServers.remote?.type).toBe('streamable-http');
      expect(config?.mcpServers.legacy?.type).toBe('sse');
    } finally {
      cleanup(dir);
    }
  });

  test('empty mcpServers object is valid', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({ $schema: SCHEMA_URL, mcpServers: {} }),
    );
    try {
      const config = parseMcpConfig(filePath);
      expect(config).toBeDefined();
      expect(config?.mcpServers).toEqual({});
    } finally {
      cleanup(dir);
    }
  });

  test('missing file returns undefined (mcp.json is optional)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doctor-mcp-'));
    try {
      expect(parseMcpConfig(join(dir, 'mcp.json'))).toBeUndefined();
    } finally {
      cleanup(dir);
    }
  });

  test('invalid JSON throws ParseError', () => {
    const { dir, filePath } = makeTempFile('{"mcpServers": ');
    try {
      expect(() => parseMcpConfig(filePath)).toThrow(ParseError);
      expect(() => parseMcpConfig(filePath)).toThrow(/Invalid JSON/);
    } finally {
      cleanup(dir);
    }
  });

  test('invalid server type throws SchemaValidationError', () => {
    // A server entry whose value is not an object violates the top-level
    // requirement that mcpServers values are server configuration objects.
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        mcpServers: { bad: 'not-an-object' },
      }),
    );
    try {
      expect(() => parseMcpConfig(filePath)).toThrow(SchemaValidationError);
    } finally {
      cleanup(dir);
    }
  });

  test('missing required top-level fields throws SchemaValidationError', () => {
    const cases = [
      { $schema: SCHEMA_URL }, // missing mcpServers
      { mcpServers: { a: { type: 'stdio', command: 'x' } } }, // missing $schema
      { $schema: 'https://wrong', mcpServers: {} }, // wrong $schema
    ];
    for (const content of cases) {
      const { dir, filePath } = makeTempFile(JSON.stringify(content));
      try {
        expect(() => parseMcpConfig(filePath)).toThrow(SchemaValidationError);
      } finally {
        cleanup(dir);
      }
    }
  });

  test('unknown top-level fields throw SchemaValidationError', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({ $schema: SCHEMA_URL, mcpServers: {}, extra: 1 }),
    );
    try {
      expect(() => parseMcpConfig(filePath)).toThrow(SchemaValidationError);
    } finally {
      cleanup(dir);
    }
  });

  test('per-server validation: one bad server does not invalidate others', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        mcpServers: {
          good: { type: 'streamable-http', url: 'https://example.com/mcp' },
          bad: { type: 'stdio' }, // missing required 'command'
          worse: { type: 'udp', command: 'x' }, // unknown transport
          extra: { type: 'sse', url: 'https://example.com/sse', bogus: 1 }, // extra field
        },
      }),
    );
    try {
      const config = parseMcpConfig(filePath);
      expect(config).toBeDefined();
      // Every raw entry is preserved: the valid server stays typed, the
      // invalid ones become null — nothing silently disappears.
      expect(Object.keys(config?.mcpServers ?? {})).toEqual([
        'good',
        'bad',
        'worse',
        'extra',
      ]);
      expect(config?.mcpServers.good?.type).toBe('streamable-http');
      expect(config?.mcpServers.bad).toBeNull();
      expect(config?.mcpServers.worse).toBeNull();
      expect(config?.mcpServers.extra).toBeNull();
      // Each invalid entry produces a DOC-3008 parser diagnostic.
      const serverDiagnostics = config?.serverDiagnostics ?? [];
      expect(serverDiagnostics).toHaveLength(3);
      for (const diagnostic of serverDiagnostics) {
        expect(diagnostic.code).toBe('DOC-3008');
        expect(diagnostic.severity).toBe('error');
        expect(diagnostic.file).toBe('mcp.json');
      }
      expect(serverDiagnostics[0]?.message).toContain('missing required');
      expect(serverDiagnostics[1]?.message).toContain('"udp"');
      // The branch matching the declared type wins: sse is a valid type, so
      // the real problem (the extra field) is reported, not a type error.
      expect(serverDiagnostics[2]?.message).toContain("'bogus'");
    } finally {
      cleanup(dir);
    }
  });

  test('valid mcp.json carries no server diagnostics', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        mcpServers: {
          good: { type: 'stdio', command: './server.js' },
        },
      }),
    );
    try {
      const config = parseMcpConfig(filePath);
      expect(config?.serverDiagnostics).toBeUndefined();
      expect(config?.mcpServers.good).not.toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  test('stdio command escaping the plugin root is an invalid server entry', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        mcpServers: {
          good: { type: 'stdio', command: './server.js' },
          evil: { type: 'stdio', command: '../bin/server' },
        },
      }),
    );
    try {
      const config = parseMcpConfig(filePath);
      expect(config?.mcpServers.good?.type).toBe('stdio');
      expect(config?.mcpServers.evil).toBeNull();
      const diagnostics = config?.serverDiagnostics ?? [];
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain('evil');
      expect(diagnostics[0]?.message).toContain('../bin/server');
    } finally {
      cleanup(dir);
    }
  });
});
