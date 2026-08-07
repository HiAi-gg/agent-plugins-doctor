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
import {
  benchmarkCachedReload,
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
      const first = await benchmarkLoadAndValidate(dir);
      const cached = await benchmarkCachedReload(dir);
      expect(cached.skills).toBe(50);
      // The cached reload must not be slower than the cold pipeline; in
      // practice it is far faster because parsing is skipped.
      expect(cached.elapsedMs).toBeLessThanOrEqual(first.elapsedMs);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
