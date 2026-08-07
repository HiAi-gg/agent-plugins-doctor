import { describe, expect, test } from 'bun:test';
import { expectTypeOf } from 'bun:test';
import type {
  Author,
  CompatibilityResult,
  Diagnostic,
  DiagnosticRange,
  Extension,
  Fix,
  FixKind,
  McpConfig,
  McpServer,
  Plugin,
  PluginManifest,
  RuleCategory,
  Severity,
  Skill,
  SkillFrontmatter,
  SseServer,
  StdioServer,
  StreamableHttpServer,
  ValidationOptions,
  ValidationResult,
  ValidationSummary,
} from '../src/index.js';
import type { ComponentType } from '../src/index.js';

describe('domain types', () => {
  test('all types are importable from the package entry point', () => {
    // The type-only imports above only compile if every canonical type is
    // exported from the package entry point. Reference them all at type level
    // so an accidental export removal fails this test at compile time.
    type AllImported = [
      Author,
      CompatibilityResult,
      Diagnostic,
      DiagnosticRange,
      Extension,
      Fix,
      FixKind,
      McpConfig,
      McpServer,
      Plugin,
      PluginManifest,
      RuleCategory,
      Severity,
      Skill,
      SkillFrontmatter,
      SseServer,
      StdioServer,
      StreamableHttpServer,
      ValidationOptions,
      ValidationResult,
      ValidationSummary,
      ComponentType,
    ];
    expectTypeOf<AllImported>().toExtend<unknown[]>();
  });

  test('a Plugin can be constructed with the canonical shape', () => {
    const plugin: Plugin = {
      rootDir: '/tmp/plugin',
      specVersion: '1.0.0',
      manifest: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'my-plugin',
        version: '0.1.0',
        description: 'Test plugin',
        author: { name: 'Example', email: 'a@b.c' },
        keywords: ['agent'],
      },
      skills: [
        {
          name: 'summarize',
          description: 'Summarize text',
          body: '# Summarize\n\nDo the thing.',
          directory: 'skills/summarize',
          frontmatter: { name: 'summarize', description: 'Summarize text' },
          allowedTools: ['read_file'],
        },
      ],
      extensions: [
        { namespace: 'com.example.client', data: {}, path: 'ext/client.json' },
      ],
    };

    expect(plugin.specVersion).toBe('1.0.0');
    expect(plugin.skills).toHaveLength(1);
    expect(plugin.skills[0].name).toBe('summarize');
    expect(plugin.extensions).toHaveLength(1);
  });

  test('all McpServer variants are assignable to the McpServer union', () => {
    const servers: McpServer[] = [
      {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { FOO: 'bar' },
        cwd: './',
      },
      {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'x' },
      },
      { type: 'sse', url: 'https://example.com/sse' },
    ];

    expect(servers).toHaveLength(3);
    expect(servers.map((s) => s.type)).toEqual([
      'stdio',
      'streamable-http',
      'sse',
    ]);

    const config: McpConfig = {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { main: servers[0] },
    };
    expect(Object.keys(config.mcpServers)).toEqual(['main']);
  });
});

describe('diagnostic types', () => {
  test('a Diagnostic carries the canonical fields', () => {
    const fix: Fix = {
      kind: 'rename',
      file: 'skills/old.md',
      description: 'Rename skill',
      oldPath: 'skills/old.md',
      newPath: 'skills/new.md',
    };
    const related: Diagnostic[] = [
      {
        code: 'DOC-1002',
        severity: 'info',
        message: 'See DOC-1001',
        ruleId: 'skill-name',
        category: 'spec',
      },
    ];
    const diagnostic: Diagnostic = {
      code: 'DOC-1001',
      severity: 'error',
      message: 'Skill name is invalid',
      ruleId: 'skill-name',
      category: 'spec',
      file: 'skills/bad.md',
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
      fix,
      related,
    };

    expect(diagnostic.code).toBe('DOC-1001');
    expect(diagnostic.fix?.kind).toBe('rename');
    expect(diagnostic.range?.start).toEqual({ line: 1, column: 0 });
    expect(diagnostic.related?.[0].code).toBe('DOC-1002');
  });

  test('validation result types compose', () => {
    const summary: ValidationSummary = {
      counts: { info: 1, warning: 2, error: 3, critical: 0 },
      byCategory: {
        spec: 1,
        skills: 2,
        mcp: 0,
        security: 1,
        structure: 0,
        compatibility: 2,
        format: 0,
      },
    };
    const result: ValidationResult = {
      plugin: {} as Plugin,
      specVersion: '1.0.0',
      diagnostics: [],
      summary,
      compatible: false,
      compatibility: [
        {
          clientId: 'client-a',
          clientName: 'Client A',
          compatible: false,
          issues: ['x'],
          evidence: 'docs',
        },
      ],
      elapsedMs: 12,
    };

    expect(result.summary.counts.error).toBe(3);
    expect(result.compatible).toBe(false);
    expect(result.compatibility[0].evidence).toBe('docs');

    const options: ValidationOptions = {
      fix: true,
      strict: true,
      rules: ['DOC-1001'],
      excludeRules: ['DOC-2001'],
    };
    expect(options.rules).toEqual(['DOC-1001']);
  });
});

describe('type relationships', () => {
  test('ComponentType equals the supported component tuple elements', () => {
    expectTypeOf<ComponentType>().toEqualTypeOf<'skills' | 'mcp'>();
  });

  test('Severity is the canonical union', () => {
    expectTypeOf<Severity>().toEqualTypeOf<
      'info' | 'warning' | 'error' | 'critical'
    >();
  });

  test('RuleCategory is the canonical union', () => {
    expectTypeOf<RuleCategory>().toEqualTypeOf<
      | 'spec'
      | 'skills'
      | 'mcp'
      | 'security'
      | 'structure'
      | 'compatibility'
      | 'format'
    >();
  });

  test('FixKind is the canonical union', () => {
    expectTypeOf<FixKind>().toEqualTypeOf<
      'replace' | 'insert' | 'delete' | 'rename'
    >();
  });

  test('each McpServer variant matches the McpServer union', () => {
    expectTypeOf<StdioServer>().toExtend<McpServer>();
    expectTypeOf<StreamableHttpServer>().toExtend<McpServer>();
    expectTypeOf<SseServer>().toExtend<McpServer>();
  });

  test('McpServer variants are discriminated by type', () => {
    expectTypeOf<StdioServer>().toExtend<{ type: 'stdio' }>();
    expectTypeOf<StreamableHttpServer>().toExtend<{
      type: 'streamable-http';
    }>();
    expectTypeOf<SseServer>().toExtend<{ type: 'sse' }>();
  });

  test('Plugin aggregates all canonical pieces', () => {
    expectTypeOf<Plugin>().toExtend<{ rootDir: string; specVersion: string }>();
    expectTypeOf<Plugin['manifest']>().toEqualTypeOf<PluginManifest>();
    expectTypeOf<Plugin['skills']>().toEqualTypeOf<Skill[]>();
    expectTypeOf<Plugin['extensions']>().toEqualTypeOf<Extension[]>();
  });

  test('optional fields are typed as optional', () => {
    expectTypeOf<Author>().toExtend<{
      name?: string;
      email?: string;
      url?: string;
    }>();
    expectTypeOf<SkillFrontmatter>().toExtend<{
      'allowed-tools'?: string | string[];
    }>();
    expectTypeOf<DiagnosticRange>().toExtend<{
      start: { line: number; column: number };
      end: { line: number; column: number };
    }>();
  });

  test('evidence is the canonical union', () => {
    expectTypeOf<CompatibilityResult['evidence']>().toEqualTypeOf<
      'docs' | 'runtime' | 'expected' | 'none'
    >();
  });
});
