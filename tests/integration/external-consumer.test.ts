// Integration: the published @hiai-gg/agent-plugins-doctor tarball must be
// consumable from a clean external TypeScript project.
//
// The umbrella package bundles the CLI and all five SDK packages into one
// dist/index.js, and (via the prepack's scripts/vendor-dts.ts step) ships a
// self-contained declaration graph. This test packs the tarball, installs it
// into a scratch project outside the monorepo, and proves:
//   1. the documented exports resolve and type-check under `tsc --noEmit`,
//   2. the shipped .d.ts graph type-checks even with skipLibCheck disabled —
//      i.e. there are no missing workspace aliases (@agent-plugins-doctor/*),
//   3. the shipped declarations carry no monorepo-only imports outside the
//      vendored SDK type trees (dist/vendor/),
//   4. the installed CLI binary reports the package version.
//
// This is the release-integrity counterpart of ECO-010 (public SDK types):
// it fails if a future change makes the published package un-importable or
// type-unresolvable from outside the monorepo.

import { $ } from 'bun';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/** Repository root (three levels up from tests/integration). */
const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const NPM_PKG_DIR = join(REPO_ROOT, 'packages', 'npm');
const NPM_PACKAGE_NAME = '@hiai-gg/agent-plugins-doctor';

/** Every .d.ts file under a directory, recursively. */
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

const CONSUMER_SOURCE = `// External consumer: imports every documented API of the umbrella package.
import {
  createProgram,
  program,
  main,
  computeExitCode,
  EXIT_CODES,
  isPluginLoadError,
  type ExitCode,
  type ExitCodeOptions,
} from '${NPM_PACKAGE_NAME}';

const p = createProgram();
const exitCode: ExitCode = computeExitCode([], { strict: false });
const opts: ExitCodeOptions = { strict: true };
const isLoad = isPluginLoadError(new Error('x'));
console.log(typeof p, exitCode, opts.strict, isLoad, EXIT_CODES.TOOL_FAILURE, typeof main, typeof program);
`;

const STRICT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      types: ['node'],
      strict: true,
      esModuleInterop: true,
      // The whole point: the shipped .d.ts graph must resolve on its own, so
      // declaration files are fully checked (no hiding missing modules).
      skipLibCheck: false,
      noEmit: true,
    },
    include: ['consumer.ts'],
  },
  null,
  2,
);

describe('external TypeScript consumer', () => {
  let tempDir: string;
  let tarballPath: string;
  let installedDist: string;

  beforeAll(async () => {
    // 1. Pack the umbrella package. prepack rebuilds every SDK package,
    //    bundles the CLI, emits declarations, and vendors the SDK type graph.
    await $`npm pack --silent`.cwd(NPM_PKG_DIR).quiet();
    const packed = readdirSync(NPM_PKG_DIR).filter((file) =>
      file.endsWith('.tgz'),
    );
    expect(packed).toHaveLength(1);
    tarballPath = join(NPM_PKG_DIR, packed[0]!);

    // 2. Scratch project outside the monorepo. npm installs the tarball and
    //    auto-installs its commander peerDependency.
    tempDir = mkdtempSync(join(tmpdir(), 'doctor-consumer-'));
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'doctor-consumer', private: true }, null, 2),
    );
    await $`npm install --no-audit --no-fund --loglevel=error ${tarballPath} typescript @types/node`
      .cwd(tempDir)
      .quiet();

    installedDist = join(
      tempDir,
      'node_modules',
      '@hiai-gg',
      'agent-plugins-doctor',
      'dist',
    );
    expect(existsSync(join(installedDist, 'index.d.ts'))).toBe(true);
  }, 300_000);

  afterAll(() => {
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (NPM_PKG_DIR !== undefined) {
      for (const file of readdirSync(NPM_PKG_DIR)) {
        if (file.endsWith('.tgz')) {
          rmSync(join(NPM_PKG_DIR, file));
        }
      }
    }
  });

  test('documented exports type-check under tsc --noEmit', async () => {
    writeFileSync(join(tempDir, 'consumer.ts'), CONSUMER_SOURCE);
    const result =
      await $`node node_modules/typescript/bin/tsc --noEmit consumer.ts`
        .cwd(tempDir)
        .nothrow()
        .quiet();
    expect(result.exitCode).toBe(0);
  });

  test('.d.ts graph resolves with skipLibCheck disabled (no workspace aliases)', async () => {
    writeFileSync(join(tempDir, 'tsconfig.strict.json'), STRICT_TSCONFIG);
    const result =
      await $`node node_modules/typescript/bin/tsc -p tsconfig.strict.json`
        .cwd(tempDir)
        .nothrow()
        .quiet();
    expect(result.exitCode).toBe(0);
  });

  test('shipped declarations carry no monorepo-only imports', () => {
    // The vendored SDK type trees (dist/vendor/) are the ONLY place that may
    // exist; every @agent-plugins-doctor/* import must have been rewritten to
    // a relative path into them.
    const vendorDir = join(installedDist, 'vendor');
    expect(existsSync(join(vendorDir, 'core', 'index.d.ts'))).toBe(true);
    expect(existsSync(join(vendorDir, 'compatibility', 'index.d.ts'))).toBe(
      true,
    );

    const leaks: string[] = [];
    for (const file of collectDts(installedDist)) {
      if (file.includes(`${sep}vendor${sep}`)) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /from\s*['"]@agent-plugins-doctor\/[a-z]+['"]/g,
      )) {
        leaks.push(`${file}: ${match[0]}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  test('installed CLI binary reports the package version', async () => {
    const manifest = JSON.parse(
      readFileSync(join(NPM_PKG_DIR, 'package.json'), 'utf8'),
    ) as { version: string };
    const result =
      await $`node node_modules/@hiai-gg/agent-plugins-doctor/bin/cli.js --version`
        .cwd(tempDir)
        .nothrow()
        .quiet();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe(manifest.version);
  });
});
