#!/usr/bin/env bun
/**
 * Vendors the SDK packages' declaration files into the npm umbrella package
 * (@hiai-gg/agent-plugins-doctor), making its published `.d.ts` type graph
 * self-contained.
 *
 * The umbrella's public surface references types from the
 * `@agent-plugins-doctor/*` packages (e.g. `Diagnostic` from core via
 * `computeExitCode`, `CompatibilityCheck` from compatibility via
 * `isPluginLoadError`). Those packages are **not published to npm**, so an
 * external TypeScript consumer cannot resolve the emitted
 * `import ... from '@agent-plugins-doctor/core'` statements and `tsc` fails
 * with TS2307. This script:
 *
 *   1. copies the freshly built `dist/` declaration trees of every SDK
 *      package into `packages/npm/dist/vendor/<pkg>/`, and
 *   2. rewrites every `from '@agent-plugins-doctor/<pkg>'` specifier in the
 *      emitted declaration files under dist (including the vendored trees)
 *      into a relative import into the vendored copy.
 *
 * The result is a tarball whose type graph resolves with only the declared
 * peer dependency (`commander`) installed. When the SDK packages are
 * eventually published, this vendoring can be dropped in favor of real
 * dependencies.
 *
 * Run as part of the `prepack` script in packages/npm/package.json, after the
 * SDK build and the declaration emit.
 */

import {
  cpSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const rootDir = resolve(import.meta.dir, '..');
const npmDist = join(rootDir, 'packages', 'npm', 'dist');
const vendorDir = join(npmDist, 'vendor');

/** Every SDK package whose types can appear in the umbrella's public surface. */
const SDK_PACKAGES = [
  'core',
  'parser',
  'rules',
  'compatibility',
  'report',
] as const;

/** All .d.ts files under a directory, recursively. */
function collectDts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectDts(full));
    } else if (entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Relative specifier from a .d.ts file to the vendored index of `pkg`. */
function vendorIndexSpecifier(fromFile: string, pkg: string): string {
  let rel = normalize(
    relative(dirname(fromFile), join(vendorDir, pkg, 'index.d.ts')),
  );
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.replace(/\.d\.ts$/, '.js');
}

// 1. Refresh the vendored declaration trees from the freshly built SDK dist.
rmSync(vendorDir, { recursive: true, force: true });
for (const pkg of SDK_PACKAGES) {
  cpSync(join(rootDir, 'packages', pkg, 'dist'), join(vendorDir, pkg), {
    recursive: true,
  });
}

// 2. Rewrite cross-package specifiers to relative vendored imports.
const specifier =
  /from\s*['"]@agent-plugins-doctor\/(core|parser|rules|compatibility|report)['"]/g;
let rewritten = 0;
for (const file of collectDts(npmDist)) {
  const source = readFileSync(file, 'utf8');
  let count = 0;
  const next = source.replace(specifier, (_match, pkg: string) => {
    count += 1;
    return `from '${vendorIndexSpecifier(file, pkg)}'`;
  });
  if (count > 0) {
    writeFileSync(file, next);
    rewritten += count;
  }
}

console.log(
  `✓ vendored SDK types: ${SDK_PACKAGES.length} packages, ${rewritten} imports rewritten`,
);
