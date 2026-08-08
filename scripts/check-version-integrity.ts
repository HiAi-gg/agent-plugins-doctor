#!/usr/bin/env bun
/**
 * Release-integrity gate: every version source in the repository must agree.
 *
 * Usage:
 *   bun run check:versions               # local sources only
 *   bun run check:versions -- --published # also compare the npm registry
 *
 * Verified sources:
 *   1. Every package.json — the root workspace plus all seven packages
 *      under packages/ (core, parser, rules, compatibility, report, cli, npm).
 *   2. plugin.json — the self-hosting manifest (Doctor validates itself).
 *   3. CHANGELOG.md — the top versioned entry (the [Unreleased] heading, when
 *      present, is skipped).
 *   4. packages/cli/src/index.ts — the CLI must read its version from
 *      ../package.json (`pkg.version`) and must not hardcode a version
 *      literal, so `--version` can never drift from the published artifact.
 *   5. Git tag — when HEAD is on a tagged commit, the tag (minus a leading
 *      "v") must match the package version.
 *   6. npm registry — only with --published: the latest published version of
 *      @hiai-gg/agent-plugins-doctor must match. A network failure is
 *      reported as a note, not a mismatch.
 *
 * Exit 0 when every source agrees; exit 1 with a mismatch report otherwise.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const rootDir = resolve(import.meta.dir, '..');
const checkPublished = process.argv.slice(2).includes('--published');

const SEMVER = /^\d+\.\d+\.\d+$/;
const REGISTRY_PACKAGE = '@hiai-gg/agent-plugins-doctor';

/** Every package manifest that must share one version (root + 7 workspaces). */
const MANIFESTS: { name: string; rel: string }[] = [
  { name: 'package.json (root)', rel: 'package.json' },
  { name: 'packages/core/package.json', rel: 'packages/core/package.json' },
  { name: 'packages/parser/package.json', rel: 'packages/parser/package.json' },
  { name: 'packages/rules/package.json', rel: 'packages/rules/package.json' },
  {
    name: 'packages/compatibility/package.json',
    rel: 'packages/compatibility/package.json',
  },
  { name: 'packages/report/package.json', rel: 'packages/report/package.json' },
  { name: 'packages/cli/package.json', rel: 'packages/cli/package.json' },
  { name: 'packages/npm/package.json', rel: 'packages/npm/package.json' },
];

const ok: string[] = [];
const notes: string[] = [];
const mismatches: string[] = [];

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(rootDir, rel), 'utf8')) as Record<
    string,
    unknown
  >;
}

function fail(message: string): void {
  mismatches.push(message);
}

/** The shared version every manifest must carry (root manifest wins the tie). */
function expectedVersion(): string | null {
  const root = readJson('package.json').version;
  return typeof root === 'string' && SEMVER.test(root) ? root : null;
}

// 1. All package.json manifests must carry one identical version.
function checkManifests(expected: string | null): void {
  for (const { name, rel } of MANIFESTS) {
    const version = readJson(rel).version;
    if (typeof version !== 'string' || !SEMVER.test(version)) {
      fail(
        `${name}: missing or invalid "version" (got ${JSON.stringify(version)})`,
      );
      continue;
    }
    if (expected !== null && version !== expected) {
      fail(`${name}: expected ${expected}, got ${version}`);
    } else {
      ok.push(`${name}: ${version}`);
    }
  }
}

// 2. plugin.json (self-hosting manifest).
function checkPluginManifest(expected: string | null): void {
  const version = readJson('plugin.json').version;
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    fail(
      `plugin.json: missing or invalid "version" (got ${JSON.stringify(version)})`,
    );
  } else if (expected !== null && version !== expected) {
    fail(`plugin.json: expected ${expected}, got ${version}`);
  } else {
    ok.push(`plugin.json: ${version}`);
  }
}

// 3. CHANGELOG.md — the top *versioned* entry (the [Unreleased] heading, when
// present, is skipped; it carries no version to compare).
function checkChangelog(expected: string | null): void {
  const changelog = readFileSync(join(rootDir, 'CHANGELOG.md'), 'utf8');
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (match === null) {
    fail('CHANGELOG.md: no versioned entry (## [X.Y.Z]) found');
    return;
  }
  const entry = match[1]!;
  if (expected !== null && entry !== expected) {
    fail(`CHANGELOG.md: top entry is [${entry}], expected [${expected}]`);
  } else {
    ok.push(`CHANGELOG.md (top entry [${entry}]): ${entry}`);
  }
}

// 4. packages/cli/src/index.ts — the CLI version must come from its
// package.json, never a hardcoded literal.
function checkCliSource(): void {
  const source = readFileSync(
    join(rootDir, 'packages/cli/src/index.ts'),
    'utf8',
  );
  if (!/\bimport pkg\b[^;]*\bfrom\s+['"]\.\.\/package\.json['"]/.test(source)) {
    fail('packages/cli/src/index.ts: does not import pkg from ../package.json');
    return;
  }
  if (!/\.version\(\s*pkg\.version\s*\)/.test(source)) {
    fail('packages/cli/src/index.ts: createProgram() does not use pkg.version');
    return;
  }
  const hardcoded = source.match(/\.version\(\s*['"]\d+\.\d+\.\d+['"]\s*\)/);
  if (hardcoded !== null) {
    fail(
      `packages/cli/src/index.ts: hardcoded version literal ${hardcoded[0]}`,
    );
    return;
  }
  ok.push(
    'packages/cli/src/index.ts: version read from ../package.json (pkg.version)',
  );
}

// 5. Git tag — only when HEAD is exactly on a tagged commit.
function checkGitTag(expected: string | null): void {
  let tag: string | null = null;
  try {
    const out = execSync('git describe --tags --exact-match HEAD', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    tag = out.length > 0 ? out : null;
  } catch {
    // HEAD is not on a tagged commit (e.g. a development commit between
    // releases); the tag check is intentionally skipped then.
  }
  if (tag === null) {
    const head = execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    notes.push(`git tag: HEAD (${head}) is not on a tagged commit — skipped`);
    return;
  }
  const tagVersion = tag.replace(/^v/, '');
  if (expected !== null && tagVersion !== expected) {
    fail(
      `git tag: tag ${tag} (${tagVersion}) does not match expected version ${expected}`,
    );
  } else {
    ok.push(`git tag ${tag}: ${tagVersion}`);
  }
}

// 6. npm registry (optional) — the latest published umbrella package version.
async function checkRegistry(expected: string | null): Promise<void> {
  if (!checkPublished) {
    notes.push(
      `npm registry: skipped (pass --published to compare ${REGISTRY_PACKAGE})`,
    );
    return;
  }
  const url = `https://registry.npmjs.org/${encodeURIComponent(REGISTRY_PACKAGE)}/latest`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      notes.push(
        `npm registry ${REGISTRY_PACKAGE}: HTTP ${response.status} — could not verify`,
      );
      return;
    }
    const data = (await response.json()) as { version?: unknown };
    const published = data.version;
    if (typeof published !== 'string') {
      fail(`npm registry ${REGISTRY_PACKAGE}: response carries no "version"`);
    } else if (expected !== null && published !== expected) {
      fail(
        `npm registry ${REGISTRY_PACKAGE}: published ${published}, expected ${expected}`,
      );
    } else {
      ok.push(`npm registry ${REGISTRY_PACKAGE}: ${published}`);
    }
  } catch (err) {
    notes.push(
      `npm registry ${REGISTRY_PACKAGE}: ${err instanceof Error ? err.message : String(err)} — could not verify`,
    );
  }
}

async function main(): Promise<void> {
  const expected = expectedVersion();

  checkManifests(expected);
  checkPluginManifest(expected);
  checkChangelog(expected);
  checkCliSource();
  checkGitTag(expected);
  await checkRegistry(expected);

  console.log('Version integrity check');
  console.log('=======================');
  for (const line of ok) console.log(`✓ ${line}`);
  for (const line of notes) console.log(`ℹ ${line}`);
  for (const line of mismatches) console.log(`✗ ${line}`);
  console.log();

  if (mismatches.length > 0) {
    console.error(
      `Version integrity: FAIL (${mismatches.length} mismatch${mismatches.length === 1 ? '' : 'es'})`,
    );
    process.exit(1);
  }
  console.log(
    `Version integrity: OK (${ok.length} sources agree on ${expected})`,
  );
}

main().catch((err: unknown) => {
  console.error('Version integrity check failed:', err);
  process.exit(1);
});
