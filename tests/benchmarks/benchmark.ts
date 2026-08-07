// Performance benchmarks for Agent Plugin Doctor.
//
// Measures the load + validate pipeline against plugins of increasing size
// (1, 10, 50, 100 skills). The budgets are the release contract:
//
//   1 skill   < 100ms
//   10 skills < 200ms
//   100 skills < 2000ms
//
// Run standalone to print a timing table:
//
//   bun run tests/benchmarks/benchmark.ts
//
// The budget assertions live in benchmark.test.ts (`bun test tests/benchmarks/`).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from '@agent-plugin-doctor/core';
import { loadPlugin, ParsedFileCache } from '@agent-plugin-doctor/parser';
import { validatePlugin } from '@agent-plugin-doctor/rules';

const PLUGIN_SCHEMA =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

export interface BenchmarkResult {
  size: number; // number of skills
  loadValidateMs: number; // cold load + validate
  cachedReloadMs: number; // second load with a shared ParsedFileCache
  diagnostics: number;
}

function tempPluginDir(prefix = 'doctor-bench-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Generate a valid plugin with `size` skills into `dir`.
 *
 * Each skill has a SKILL.md plus a small helper script so the tree is
 * representative of a real plugin (skills are not just empty directories).
 */
export function generateBenchmarkPlugin(dir: string, size: number): void {
  mkdirSync(join(dir, 'skills'), { recursive: true });
  writeFileSync(
    join(dir, 'plugin.json'),
    JSON.stringify(
      { $schema: PLUGIN_SCHEMA, name: 'benchmark-plugin', version: '1.0.0' },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(dir, 'mcp.json'),
    JSON.stringify(
      {
        $schema: MCP_SCHEMA,
        mcpServers: {
          local: { type: 'stdio', command: './bin/server' },
        },
      },
      null,
      2,
    ) + '\n',
  );
  for (let i = 0; i < size; i++) {
    const name = `skill-${String(i).padStart(3, '0')}`;
    const skillDir = join(dir, 'skills', name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Benchmark skill number ${i}\n---\n# ${name}\n\nPerforms benchmark task number ${i} for the performance suite.\n`,
    );
    writeFileSync(join(skillDir, 'run.sh'), '#!/bin/sh\necho benchmark\n');
  }
}

/** Load and validate a plugin, returning the elapsed time in milliseconds. */
export async function benchmarkLoadAndValidate(dir: string): Promise<{
  elapsedMs: number;
  diagnostics: number;
  plugin: Plugin;
}> {
  const start = performance.now();
  const { plugin } = await loadPlugin(dir);
  const result = await validatePlugin(plugin);
  return {
    elapsedMs: performance.now() - start,
    diagnostics: result.diagnostics.length,
    plugin,
  };
}

/** Reload with a shared parsed-file cache, returning elapsed milliseconds. */
export async function benchmarkCachedReload(
  dir: string,
): Promise<{ elapsedMs: number; skills: number }> {
  const cache = new ParsedFileCache();
  await loadPlugin(dir, { cache }); // warm the cache
  const start = performance.now();
  const { plugin } = await loadPlugin(dir, { cache });
  return { elapsedMs: performance.now() - start, skills: plugin.skills.length };
}

/**
 * Run the benchmark for every size and return the results. Each size uses its
 * own temporary plugin directory, which is cleaned up afterwards.
 */
export async function runBenchmarks(
  sizes: number[] = [1, 10, 50, 100],
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (const size of sizes) {
    const dir = tempPluginDir();
    try {
      generateBenchmarkPlugin(dir, size);
      const { elapsedMs, diagnostics, plugin } =
        await benchmarkLoadAndValidate(dir);
      const cached = await benchmarkCachedReload(dir);
      results.push({
        size,
        loadValidateMs: elapsedMs,
        cachedReloadMs: cached.elapsedMs,
        diagnostics,
      });
      console.log(
        `${String(size).padStart(3)} skills: load+validate ${elapsedMs.toFixed(2)}ms, cached reload ${cached.elapsedMs.toFixed(2)}ms, ${diagnostics} diagnostics (${plugin.skills.length} skills)`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return results;
}

if (import.meta.main) {
  console.log('Agent Plugin Doctor — performance benchmarks');
  console.log('---------------------------------------------');
  await runBenchmarks();
  console.log('---------------------------------------------');
}
