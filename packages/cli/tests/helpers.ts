// Shared test helpers for @agent-plugins-doctor/cli

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { v1 } from '@agent-plugins-doctor/core';
import { createProgram } from '../src/index.js';
import { setColorEnabled } from '../src/utils/output.js';

export const PLUGIN_SCHEMA = v1.PLUGIN_SCHEMA_URL;
export const MCP_SCHEMA = v1.MCP_SCHEMA_URL;

export function makeTempDir(prefix = 'doctor-cli-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function writeTree(root: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

/** Canonical JSON text: 2-space indentation and a trailing newline. */
export function canonicalJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

export function readFile(root: string, relPath: string): string | null {
  const full = join(root, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

export function readJson<T = unknown>(root: string, relPath: string): T | null {
  const text = readFile(root, relPath);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// --- fixtures ---------------------------------------------------------------

/** A clean, fully valid plugin: no diagnostics, compatible with every client. */
export function validPlugin(root: string): void {
  writeTree(root, {
    'plugin.json': canonicalJson({
      $schema: PLUGIN_SCHEMA,
      name: 'valid-plugin',
    }),
  });
}

/** A plugin with one warning-level finding (unknown field, DOC-1004). */
export function warningPlugin(root: string): void {
  writeTree(root, {
    'plugin.json': canonicalJson({
      $schema: PLUGIN_SCHEMA,
      name: 'warning-plugin',
      'x-extra': 1,
    }),
  });
}

/**
 * A plugin with one error-level finding (duplicate header, DOC-3006) that has
 * a safe fix. Loading the mcp.json with duplicate keys is schema-valid because
 * JSON parsing keeps the last duplicate; the rule detects the duplicate in the
 * raw file.
 */
export function errorPlugin(root: string): void {
  writeTree(root, {
    'plugin.json': canonicalJson({
      $schema: PLUGIN_SCHEMA,
      name: 'error-plugin',
    }),
    'mcp.json': canonicalJson({
      $schema: MCP_SCHEMA,
      mcpServers: {
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer abc',
            authorization: 'Bearer xyz',
          },
        },
      },
    }),
  });
}

/** A plugin with a security-critical finding (secret in env, DOC-4003). */
export function securityPlugin(root: string): void {
  writeTree(root, {
    'plugin.json': canonicalJson({
      $schema: PLUGIN_SCHEMA,
      name: 'security-plugin',
    }),
    'mcp.json': canonicalJson({
      $schema: MCP_SCHEMA,
      mcpServers: {
        local: {
          type: 'stdio',
          command: 'node',
          env: {
            API_KEY: 'sk-1234567890abcdefghijklmn',
          },
        },
      },
    }),
  });
}

/** A plugin with an error plus a warning, used for rule filtering tests. */
export function mixedPlugin(root: string): void {
  writeTree(root, {
    'plugin.json': canonicalJson({
      $schema: PLUGIN_SCHEMA,
      name: 'mixed-plugin',
      'x-extra': 1,
    }),
    'mcp.json': canonicalJson({
      $schema: MCP_SCHEMA,
      mcpServers: {
        remote: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer abc',
            authorization: 'Bearer xyz',
          },
        },
      },
    }),
  });
}

/** A plugin using the legacy SSE transport, unsupported by one client. */
export function ssePlugin(root: string): void {
  writeTree(root, {
    'plugin.json': canonicalJson({
      $schema: PLUGIN_SCHEMA,
      name: 'sse-plugin',
    }),
    'mcp.json': canonicalJson({
      $schema: MCP_SCHEMA,
      mcpServers: {
        remote: { type: 'sse', url: 'https://example.com/mcp' },
      },
    }),
  });
}

// --- CLI runner -------------------------------------------------------------

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the CLI as a fresh program with output captured, returning the exit
 * code the process would exit with. Never calls process.exit: commander's
 * exitOverride turns help/version/error exits into thrown errors that are
 * mapped to their exit codes.
 */
export async function runCli(args: string[]): Promise<CliResult> {
  const program = createProgram();
  program.exitOverride();

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;

  process.exitCode = undefined;
  setColorEnabled(true);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  const output = (): CliResult => ({
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
    exitCode: Number(process.exitCode ?? 0),
  });

  try {
    await program.parseAsync(['node', 'cli', ...args]);
    return output();
  } catch (cause) {
    if (cause instanceof CommanderError) {
      return { ...output(), exitCode: cause.exitCode };
    }
    throw cause;
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
}
