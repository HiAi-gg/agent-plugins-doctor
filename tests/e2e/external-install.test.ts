// E2E: the published CLI works when installed from packed tarballs outside the
// monorepo.
//
// This simulates `bunx agent-plugins-doctor` (or `npx`) against the npm-published
// artifacts from Phase 4.1-4.2 without publishing anything:
//   1. every workspace package is packed with `npm pack` (which rebuilds dist/
//      via prepublishOnly),
//   2. all six tarballs are installed with `npm install` into a scratch
//      directory outside the repo — the @agent-plugins-doctor/* packages are
//      not on the registry yet, so every tarball must be installed in a single
//      npm install for their ^0.0.2 inter-package dependencies to resolve
//      locally,
//   3. the installed artifact (node_modules/@agent-plugins-doctor/cli/dist/bin.js,
//      the node-targeted file a user gets) is exercised end-to-end.

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { $ } from 'bun';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Repository root (two levels up from tests/e2e). */
const REPO_ROOT = resolve(import.meta.dir, '..', '..');

/** Workspace packages, in publish order (core first). */
const PACKAGE_NAMES = [
  'core',
  'parser',
  'compatibility',
  'report',
  'rules',
  'cli',
] as const;

function packageDir(name: string): string {
  return join(REPO_ROOT, 'packages', name);
}

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

describe('external installation', () => {
  let tempDir: string;
  let pluginDir: string;
  let cliJs: string;
  let cliVersion: string;

  beforeAll(async () => {
    // 1. Scratch directory outside the monorepo.
    tempDir = mkdtempSync(join(tmpdir(), 'doctor-external-'));
    pluginDir = join(tempDir, 'test-plugin');
    mkdirSync(pluginDir, { recursive: true });

    // A minimal valid plugin (mirrors tests/fixtures/minimal-plugin). The
    // trailing newline matters: DOC-7001 requires 2-space indentation and a
    // trailing newline, so the file must be byte-identical to a fixture that
    // validates cleanly.
    writeFileSync(
      join(pluginDir, 'plugin.json'),
      JSON.stringify(
        {
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test-plugin',
        },
        null,
        2,
      ) + '\n',
    );

    // npm needs a package.json in the install target.
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify(
        { name: 'doctor-external-install', private: true },
        null,
        2,
      ),
    );

    // Drop tarballs left behind by a previously crashed run.
    for (const name of PACKAGE_NAMES) {
      for (const file of readdirSync(packageDir(name))) {
        if (file.endsWith('.tgz')) {
          rmSync(join(packageDir(name), file));
        }
      }
    }

    // 2. Pack every package. `npm pack` runs prepublishOnly, so dist/ is
    //    rebuilt from source before it is packed.
    for (const name of PACKAGE_NAMES) {
      await $`npm pack --silent`.cwd(packageDir(name)).quiet();
    }

    // 3. Collect the packed tarballs (one per package directory).
    const tarballs: string[] = [];
    for (const name of PACKAGE_NAMES) {
      const packed = readdirSync(packageDir(name)).filter((file) =>
        file.endsWith('.tgz'),
      );
      expect(packed).toHaveLength(1);
      tarballs.push(join(packageDir(name), packed[0]!));
    }

    // 4. Install the CLI from the tarballs into the scratch directory.
    await $`npm install --no-audit --no-fund --loglevel=error ${tarballs}`
      .cwd(tempDir)
      .quiet();

    // The node-targeted artifact a user would run (bin: ./dist/bin.js).
    cliJs = join(
      tempDir,
      'node_modules',
      '@agent-plugins-doctor',
      'cli',
      'dist',
      'bin.js',
    );
    expect(existsSync(cliJs)).toBe(true);
    // npm wired the `bin` field into node_modules/.bin.
    expect(
      existsSync(join(tempDir, 'node_modules', '.bin', 'agent-plugins-doctor')),
    ).toBe(true);

    cliVersion = (
      JSON.parse(
        readFileSync(join(packageDir('cli'), 'package.json'), 'utf8'),
      ) as { version: string }
    ).version;
  }, 180_000);

  afterAll(() => {
    // Remove the scratch directory and the packed tarballs.
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    for (const name of PACKAGE_NAMES) {
      for (const file of readdirSync(packageDir(name))) {
        if (file.endsWith('.tgz')) {
          rmSync(join(packageDir(name), file));
        }
      }
    }
  });

  /** Run the installed CLI artifact under the node runtime. */
  async function runCli(args: string[], cwd: string): Promise<CliResult> {
    const proc = Bun.spawn({
      cmd: ['node', cliJs, ...args],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  }

  test('installed binary prints usage with --help', async () => {
    const result = await runCli(['--help'], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('check');
    expect(result.stdout).toContain('fix');
    expect(result.stdout).toContain('report');
  });

  test('installed binary reports its version with --version', async () => {
    const result = await runCli(['--version'], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.stdout.trim()).toBe(cliVersion);
  });

  test('check validates an externally installed plugin', async () => {
    const result = await runCli(['check', pluginDir], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Agent Plugin Doctor');
    expect(result.stdout).toContain('Plugin: test-plugin');
    expect(result.stdout).toContain('Result: No issues found');
  });

  test('report generates a report for the plugin', async () => {
    const result = await runCli(['report', pluginDir], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Agent Plugin Doctor');
    expect(result.stdout).toContain('Plugin: test-plugin');
  });

  test('fix --dry-run reports on available fixes', async () => {
    const result = await runCli(['fix', '--dry-run', pluginDir], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No fixes available.');
  });
});
