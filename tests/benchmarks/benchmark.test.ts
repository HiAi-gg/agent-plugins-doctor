// Performance budget assertions for the load + validate pipeline.
//
// The budgets are the Phase 16 release contract, widened to accommodate the
// CI matrix: cold starts on Windows runners are ~1.5-2x slower than Linux/macOS
// (bun startup + AJV compile + fs). Measured baselines: Linux 1-skill ~80ms,
// 10-skill ~2ms, 100-skill ~14ms; Windows 1-skill ~136ms.
//   1 skill   < 250ms
//   10 skills < 500ms
//   50 skills < 2000ms
//   100 skills < 3000ms
//
// The whole benchmark file must stay well under 10 seconds. Each test uses
// its own temporary plugin directory and cleans up after itself.

import { describe, expect, test } from 'bun:test';
import { loadPlugin, ParsedFileCache } from '@agent-plugins-doctor/parser';
import {
  benchmarkLoadAndValidate,
  generateBenchmarkPlugin,
} from './benchmark.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUDGETS: { size: number; maxMs: number }[] = [
  { size: 1, maxMs: 250 },
  { size: 10, maxMs: 500 },
  { size: 50, maxMs: 2000 },
  { size: 100, maxMs: 3000 },
];

function tempPluginDir(): string {
  return mkdtempSync(join(tmpdir(), 'doctor-bench-test-'));
}

describe('performance benchmarks', () => {
  for (const { size, maxMs } of BUDGETS) {
    test(
      `${size}-skill plugin loads and validates in < ${maxMs}ms`,
      async () => {
        const dir = tempPluginDir();
        try {
          generateBenchmarkPlugin(dir, size);
          const { elapsedMs, diagnostics, plugin } =
            await benchmarkLoadAndValidate(dir);
          expect(plugin.skills).toHaveLength(size);
          expect(diagnostics).toBe(0); // benchmark fixtures are valid plugins
          expect(elapsedMs).toBeLessThan(maxMs);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      },
      { timeout: 10_000 },
    );
  }

  test('cached reload skips re-parsing unchanged files', async () => {
    const dir = tempPluginDir();
    try {
      generateBenchmarkPlugin(dir, 50);
      const cache = new ParsedFileCache();
      // Warm the cache: plugin.json, mcp.json, and every SKILL.md are parsed
      // exactly once and stored.
      await loadPlugin(dir, { cache });
      const missesBefore = cache.misses;
      const hitsBefore = cache.hits;

      // Reload the same directory. Every file is unchanged, so no parse
      // happens: the reload is served entirely from the cache. This is
      // asserted deterministically via the cache hit/miss counters — a
      // wall-clock comparison is flaky on contended CI runners because the
      // cold 50-skill pipeline (~6ms) leaves only a few milliseconds of
      // margin over a cached reload (~2ms).
      const { plugin } = await loadPlugin(dir, { cache });
      expect(plugin.skills).toHaveLength(50);
      expect(cache.misses).toBe(missesBefore); // nothing was re-parsed
      expect(cache.hits).toBeGreaterThan(hitsBefore); // served from cache
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
