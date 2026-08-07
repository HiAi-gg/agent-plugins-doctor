#!/usr/bin/env bun
/**
 * Builds all @agent-plugins-doctor packages and publishes them to npm.
 *
 * Usage:
 *   bun run publish:all        # build + publish for real
 *   bun run publish:dry-run    # build + npm publish --dry-run (nothing published)
 *
 * The publish order is dependency order: core first, then the packages that
 * depend on it, and the CLI (which depends on all) last.
 */

import { $ } from 'bun';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Publish order: a package always comes after the packages it depends on.
const PACKAGES = ['core', 'parser', 'compatibility', 'report', 'rules', 'cli'];

const dryRun = process.argv.slice(2).includes('--dry-run');
const rootDir = resolve(import.meta.dir, '..');

function readVersion(pkg: string): string {
  const manifest = JSON.parse(
    readFileSync(join(rootDir, 'packages', pkg, 'package.json'), 'utf8'),
  );
  return manifest.version;
}

/** All six packages must share one version before anything is published. */
function assertVersionsMatch(): void {
  const versions = PACKAGES.map((pkg) => ({ pkg, version: readVersion(pkg) }));
  const unique = new Set(versions.map(({ version }) => version));
  if (unique.size > 1) {
    console.error('Version mismatch — all packages must share one version:');
    for (const { pkg, version } of versions) {
      console.error(`  @agent-plugins-doctor/${pkg}: ${version}`);
    }
    process.exit(1);
  }
}

/** Real publishes fail with a confusing error when unauthenticated; check early. */
async function assertLoggedIn(): Promise<void> {
  try {
    await $`npm whoami`.quiet();
  } catch {
    console.error('Not logged in to the npm registry. Run `npm login` first.');
    process.exit(1);
  }
}

/** Bun's ShellError carries stdout/stderr buffers; surface the real npm output. */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { stdout?: Uint8Array; stderr?: Uint8Array };
    const decode = (v?: Uint8Array): string =>
      v ? new TextDecoder().decode(v).trim() : '';
    return [e.message, decode(e.stdout), decode(e.stderr)]
      .filter(Boolean)
      .join('\n');
  }
  return String(err);
}

async function publishPackage(pkg: string): Promise<void> {
  const pkgDir = join(rootDir, 'packages', pkg);
  const name = `@agent-plugins-doctor/${pkg}`;
  console.log(`\nPublishing ${name}...`);

  try {
    if (dryRun) {
      await $`npm publish --dry-run`.cwd(pkgDir);
    } else {
      await $`npm publish`.cwd(pkgDir);
    }
  } catch (err) {
    console.error(`Failed to publish ${name}:`);
    console.error(describeError(err));
    process.exit(1);
  }

  console.log(`✓ ${name} published`);
}

async function main(): Promise<void> {
  if (dryRun) {
    console.log('DRY-RUN — nothing will be published to the registry\n');
  }

  assertVersionsMatch();

  console.log('Building all packages...');
  await $`bun run build`.cwd(rootDir);

  if (!dryRun) {
    await assertLoggedIn();
  }

  for (const pkg of PACKAGES) {
    await publishPackage(pkg);
  }

  console.log('\n✓ All packages published successfully');
}

main().catch((err) => {
  console.error('Publish failed:', err);
  process.exit(1);
});
