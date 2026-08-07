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

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  'allowed-tools'?: string | string[];
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
