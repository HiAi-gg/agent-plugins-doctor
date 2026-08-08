#!/usr/bin/env bun
/**
 * Builds every @agent-plugins-doctor/* workspace package from the repository
 * root before the npm umbrella package is packed.
 *
 * npm runs `prepack` with cwd = packages/npm, and the umbrella's prepack must
 * first rebuild all five SDK packages plus the CLI. Running the workspace
 * filtered build (`bun run --filter '@agent-plugins-doctor/*' build`) from the
 * nested package directory does not resolve on Windows: Bun cannot locate the
 * monorepo workspace root there, so `--filter` fails with an error about no
 * matching workspace. This script pins the working directory to the repository
 * root (resolved absolutely from import.meta.dir, never from cwd) and runs the
 * identical filtered build, so prepack behaves the same on every platform.
 *
 * The remaining prepack steps (bundling ../cli/src/index.ts, declaration emit,
 * scripts/vendor-dts.ts, README/LICENSE copy) still run with cwd = packages/npm
 * and are intentionally not moved here.
 *
 * Run as part of the `prepack` script in packages/npm/package.json, in place
 * of the previous inline `bun run --filter '@agent-plugins-doctor/*' build`.
 */

import { $ } from 'bun';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dir, '..');

await $`bun run --filter '@agent-plugins-doctor/*' build`.cwd(rootDir);

console.log('✓ built all @agent-plugins-doctor/* packages from the repo root');
