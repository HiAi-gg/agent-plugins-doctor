// Performance budget assertions for the load + validate pipeline.
//
// The budgets are the Phase 16 release contract:
//   1 skill   < 100ms
//   10 skills < 200ms
//   50 skills < 1500ms (interpolated guard between the documented 10 and 100)
//   100 skills < 2000ms
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
  { size: 1, maxMs: 100 },
  { size: 10, maxMs: 200 },
  { size: 50, maxMs: 1500 },
  { size: 100, maxMs: 2000 },
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
