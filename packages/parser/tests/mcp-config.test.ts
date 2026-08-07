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
      expect(Object.keys(config?.mcpServers ?? {})).toEqual(['good']);
      expect(config?.mcpServers.good?.type).toBe('streamable-http');
    } finally {
      cleanup(dir);
    }
  });
});
