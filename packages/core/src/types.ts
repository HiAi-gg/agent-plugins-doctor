// Canonical domain types for Agent Plugin Doctor

export interface Plugin {
  rootDir: string;
  specVersion: string;
  manifest: PluginManifest;
  mcpConfig?: McpConfig;
  skills: Skill[];
  extensions: Extension[];
}

export interface PluginManifest {
  $schema: string;
  name: string;
  version?: string;
  description?: string;
  author?: Author;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  extensions?: Record<string, unknown>;
}

export interface Author {
  name?: string;
  email?: string;
  url?: string;
}

export interface Skill {
  name: string;
  description: string;
  body: string;
  directory: string; // relative path from plugin root, e.g., "skills/summarize"
  frontmatter: SkillFrontmatter;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
}

/**
 * The YAML value of the `allowed-tools` frontmatter field.
 *
 * The Agent Skills specification defines `allowed-tools` as a
 * space-separated string (YAML scalar). The parser preserves the raw value
 * verbatim — including non-string forms (YAML lists, numbers, booleans,
 * mappings) — so the DOC-2005 rule, not the parser, is the gatekeeper for
 * the field: strings are validated token-by-token, YAML lists warn as a
 * Doctor-specific extension, and any other type is an error.
 */
export type AllowedToolsValue =
  string | number | boolean | unknown[] | Record<string, unknown>;

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  // Agent Skills specification: space-separated string (YAML scalar).
  // Non-string values are preserved so DOC-2005 can diagnose them.
  'allowed-tools'?: AllowedToolsValue;
}

export interface McpConfig {
  $schema: string;
  mcpServers: Record<string, McpServer>;
}

export type McpServer = StdioServer | StreamableHttpServer | SseServer;

export interface StdioServer {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface StreamableHttpServer {
  type: 'streamable-http';
  url: string;
  headers?: Record<string, string>;
}

export interface SseServer {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface Extension {
  namespace: string; // reverse-domain, e.g., "com.example.client"
  data: unknown;
  path: string; // relative path from plugin root
}
