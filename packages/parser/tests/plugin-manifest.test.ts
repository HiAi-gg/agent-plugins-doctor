import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ParseError,
  SchemaValidationError,
  parsePluginManifest,
} from '../src/index.js';

const SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

function makeTempFile(content: string): { dir: string; filePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'doctor-manifest-'));
  const filePath = join(dir, 'plugin.json');
  writeFileSync(filePath, content);
  return { dir, filePath };
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe('parsePluginManifest', () => {
  test('valid plugin.json parses correctly', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        name: 'my-plugin',
        version: '1.2.0',
        description: 'A test plugin',
        author: {
          name: 'Example',
          email: 'author@example.com',
          url: 'https://example.com',
        },
        homepage: 'https://example.com/plugin',
        repository: 'https://github.com/example/plugin',
        license: 'MIT',
        keywords: ['agent', 'test'],
        extensions: { 'com.example.client': { setting: true } },
      }),
    );
    try {
      const manifest = parsePluginManifest(filePath);
      expect(manifest.name).toBe('my-plugin');
      expect(manifest.$schema).toBe(SCHEMA_URL);
      expect(manifest.version).toBe('1.2.0');
      expect(manifest.author?.email).toBe('author@example.com');
      expect(manifest.keywords).toEqual(['agent', 'test']);
      expect(manifest.extensions).toEqual({
        'com.example.client': { setting: true },
      });
    } finally {
      cleanup(dir);
    }
  });

  test('minimal plugin.json (only required fields) parses correctly', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({ $schema: SCHEMA_URL, name: 'minimal-plugin' }),
    );
    try {
      const manifest = parsePluginManifest(filePath);
      expect(manifest.name).toBe('minimal-plugin');
      expect(manifest.version).toBeUndefined();
    } finally {
      cleanup(dir);
    }
  });

  test('invalid JSON throws ParseError', () => {
    const { dir, filePath } = makeTempFile('{"name": "oops",');
    try {
      expect(() => parsePluginManifest(filePath)).toThrow(ParseError);
      expect(() => parsePluginManifest(filePath)).toThrow(/Invalid JSON/);
    } finally {
      cleanup(dir);
    }
  });

  test('missing file throws ParseError', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doctor-manifest-'));
    try {
      expect(() => parsePluginManifest(join(dir, 'plugin.json'))).toThrow(
        ParseError,
      );
      expect(() => parsePluginManifest(join(dir, 'plugin.json'))).toThrow(
        /not found/,
      );
    } finally {
      cleanup(dir);
    }
  });

  test('missing required fields throws SchemaValidationError', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({ $schema: SCHEMA_URL }),
    );
    try {
      expect(() => parsePluginManifest(filePath)).toThrow(
        SchemaValidationError,
      );
      try {
        parsePluginManifest(filePath);
      } catch (error) {
        const err = error as SchemaValidationError;
        expect(err.errors.length).toBeGreaterThan(0);
        expect(
          err.errors.some(
            (e) => e.keyword === 'required' && /name/.test(e.message),
          ),
        ).toBe(true);
      }
    } finally {
      cleanup(dir);
    }
  });

  test('invalid name pattern throws SchemaValidationError', () => {
    const invalidNames = [
      'My-Plugin',
      'has--double',
      '-leading',
      'trailing-',
      'has..dots',
      'snake_case',
    ];
    for (const name of invalidNames) {
      const { dir, filePath } = makeTempFile(
        JSON.stringify({ $schema: SCHEMA_URL, name }),
      );
      try {
        expect(() => parsePluginManifest(filePath)).toThrow(
          SchemaValidationError,
        );
      } finally {
        cleanup(dir);
      }
    }
  });

  test('unknown top-level fields are handled per spec (non-fatal)', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        name: 'my-plugin',
        unknownField: 'ignored',
      }),
    );
    try {
      const manifest = parsePluginManifest(filePath);
      expect(manifest.name).toBe('my-plugin');
      expect(
        (manifest as unknown as Record<string, unknown>).unknownField,
      ).toBeUndefined();
    } finally {
      cleanup(dir);
    }
  });

  test('non-object extensions is reported and ignored (non-fatal)', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        name: 'my-plugin',
        extensions: 'not-an-object',
      }),
    );
    try {
      const manifest = parsePluginManifest(filePath);
      expect(manifest.name).toBe('my-plugin');
      expect(manifest.extensions).toBeUndefined();
    } finally {
      cleanup(dir);
    }
  });

  test('unknown fields inside author are fatal (closed object)', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: SCHEMA_URL,
        name: 'my-plugin',
        author: { name: 'A', bogus: 1 },
      }),
    );
    try {
      expect(() => parsePluginManifest(filePath)).toThrow(
        SchemaValidationError,
      );
    } finally {
      cleanup(dir);
    }
  });

  test('wrong $schema value throws SchemaValidationError', () => {
    const { dir, filePath } = makeTempFile(
      JSON.stringify({
        $schema: 'https://agent-plugins.org/schemas/9.9.9/plugin.schema.json',
        name: 'x',
      }),
    );
    try {
      expect(() => parsePluginManifest(filePath)).toThrow(
        SchemaValidationError,
      );
    } finally {
      cleanup(dir);
    }
  });
});
