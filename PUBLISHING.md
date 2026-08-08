# Publishing Agent Plugin Doctor to npm

This document describes how to build and publish Agent Plugin Doctor to the
npm registry. The full release procedure (version bumps, changelog, quality
gates, git tagging) lives in [docs/RELEASING.md](docs/RELEASING.md); this
document covers the publish step itself.

## Primary distribution: `@hiai-gg/agent-plugins-doctor` (CLI)

The CLI ships as a single self-contained npm package,
[`@hiai-gg/agent-plugins-doctor`](https://www.npmjs.com/package/@hiai-gg/agent-plugins-doctor),
built from `packages/npm/` — the same pattern as
[Agent Plugin Builder](https://github.com/HiAi-gg/agent-plugin-builder). It
bundles the CLI and all five library packages into one `dist/index.js`
(`bun build --target node`), so the only runtime requirement is Node ≥ 18
(the bin entry, `bin/cli.js`, is a plain `#!/usr/bin/env node` wrapper).

### How to publish

```bash
# Dry run first (always) — builds, packs, and prints the tarball contents
# without touching the registry
bun run publish:npm:dry-run

# Real publish (requires `npm login` first; `prepack` rebuilds the bundle and
# copies README.md/LICENSE into the package before npm packs it)
bun run publish:npm
```

The `prepack` script in `packages/npm/package.json` runs the bundle build,
emits `.d.ts` declarations, vendors the five SDK packages' declaration trees
into `dist/vendor/` (see `scripts/vendor-dts.ts`), and copies the repository
`README.md` and `LICENSE` into `packages/npm/` (both git-ignored, and npm
always includes them in the tarball). The published tarball contains
`bin/cli.js`, `dist/index.js`, `dist/index.d.ts`, `README.md`, and `LICENSE`.

The vendoring step makes the tarball **type-self-contained**: the public
`.d.ts` graph references types from the unpublished `@agent-plugins-doctor/*`
packages (e.g. `Diagnostic` via `computeExitCode`), and every
`@agent-plugins-doctor/*` import is rewritten to a relative path into
`dist/vendor/`. An external TypeScript consumer only needs the declared
`commander` peer dependency to type-check the package (verified by
`tests/integration/external-consumer.test.ts`). When the SDK packages are
eventually published, the vendoring can be dropped in favor of real
dependencies.

### How to verify

```bash
npm view @hiai-gg/agent-plugins-doctor version
npx @hiai-gg/agent-plugins-doctor --version
npx @hiai-gg/agent-plugins-doctor check /path/to/a/plugin
```

Install into a scratch project and smoke-test the CLI:

```bash
mkdir -p /tmp/doctor-smoke && cd /tmp/doctor-smoke
npm init -y
npm install @hiai-gg/agent-plugins-doctor
npx agent-plugins-doctor check /path/to/a/plugin
```

### The six SDK packages (`@agent-plugins-doctor/*`)

The six `@agent-plugins-doctor/*` library packages (core, parser,
compatibility, report, rules, cli) are **not yet published to npm** — SDK
publication is deferred until the library API stabilizes. The section below
documents that publish path for when it is enabled. The CLI package
(`@hiai-gg/agent-plugins-doctor`) bundles all six, so nothing is blocked on
them being published separately.

## Package layout and dependency order (SDK packages)

The monorepo publishes six packages. They must be published in dependency
order — a package's published tarball is installed by dependents, and npm
resolves the `^x.y.z` version range against the registry at install time:

1. `@agent-plugins-doctor/core` — no internal dependencies
2. `@agent-plugins-doctor/parser` — depends on `core`
3. `@agent-plugins-doctor/compatibility` — depends on `core`
4. `@agent-plugins-doctor/report` — depends on `core`
5. `@agent-plugins-doctor/rules` — depends on `core`, `parser`, `compatibility`
6. `@agent-plugins-doctor/cli` — depends on all five

`scripts/publish.ts` hard-codes this order; `bun run build` at the root builds
all packages in the same topological order (bun's `--filter '*'` respects
workspace dependencies).

## Prerequisites

- **npm login** — you must be authenticated against the npm registry:

  ```bash
  npm login
  npm whoami   # verify
  ```

- **Version bump** — all six packages plus the root workspace share one
  version. If you have not bumped it yet, follow
  [docs/RELEASING.md](docs/RELEASING.md) §1–§3 (bump, changelog, quality
  gates) before publishing. `scripts/publish.ts` aborts if the packages do
  not all carry the same version.

- **Clean git state** (recommended) — publish from the exact commit you
  intend to release.

## How to publish

### 1. Dry run first (always)

```bash
bun run publish:dry-run
```

This builds all packages and runs `npm publish --dry-run` for each one in
dependency order. It prints the tarball contents and size for every package
without touching the registry. Verify:

- All six packages appear in order: core → parser → compatibility → report →
  rules → cli
- Every `npm publish --dry-run` exits 0
- The tarball contents include `dist/` (bundled JS + `.d.ts` declarations),
  `LICENSE`, and `README.md`

### 2. Real publish

```bash
bun run publish:all
```

Same flow as the dry run, but actually publishes each package. The script
checks `npm whoami` up front, so a missing login fails fast with a clear
message instead of a mid-publish registry error.

The `prepublishOnly` script in every package runs `bun run build` again as a
safety net, so the tarball always matches the source on disk even if files
change between the script's build step and the publish step.

### 3. Rollout order

Publish the CLI last — it depends on all five packages. If a mid-publish
failure leaves the monorepo half-published (e.g. `rules` published but `cli`
not), simply re-run `bun run publish:all` after fixing the problem; npm
skips nothing but re-publishing an already-published version is an error, so
bump the version and re-run, or publish the remaining packages individually
(`cd packages/cli && npm publish`).

## How to verify

After publishing, verify each package resolves from the registry:

```bash
# Latest published version per package
npm view @agent-plugins-doctor/core version
npm view @agent-plugins-doctor/parser version
npm view @agent-plugins-doctor/compatibility version
npm view @agent-plugins-doctor/report version
npm view @agent-plugins-doctor/rules version
npm view @agent-plugins-doctor/cli version
```

Install into a scratch project and smoke-test the CLI:

```bash
mkdir -p /tmp/doctor-smoke && cd /tmp/doctor-smoke
npm init -y
npm install @agent-plugins-doctor/cli
npx agent-plugins-doctor check /path/to/a/plugin
```

TypeScript consumers should be able to `import { ... } from
'@agent-plugins-doctor/core'` with the shipped `.d.ts` declarations resolving
via each package's `exports` map.

## Troubleshooting

| Symptom                                                                      | Cause / fix                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Not logged in to the npm registry`                                          | Run `npm login`, then `npm whoami` to confirm. In CI, use an `NPM_TOKEN` auth token instead of interactive login.                                                                              |
| `npm ERR! 403 ... You cannot publish over the previously published versions` | The version was already published. Bump the version in all `package.json` files (see RELEASING.md §1) and re-run.                                                                              |
| `Version mismatch — all packages must share one version`                     | The six packages drifted out of sync during the bump. Run the `sed` loop from RELEASING.md §1 and verify with `grep '"version"' package.json packages/*/package.json`.                         |
| `npm ERR! 404 ... package does not exist` on a dependent package             | A dependency was published to a different registry (e.g. a local registry for `lerna`-style setups) or was unpublished. Check `npm config get registry` — it must point at registry.npmjs.org. |
| `npm ERR! E403 ... requires two-factor authentication`                       | `npm publish` needs a one-time password. Add `--otp=<code>` (or set `NPM_CONFIG_OTP`) for each package, or configure a token with `publish` scope.                                             |
| `prepublishOnly` re-build fails mid-publish                                  | The build is not reproducible from a clean checkout. Run `bun run build` locally; if it passes, a file is stale or ignored by git (see `.gitignore`).                                          |
| Dry run passes but the tarball lacks `LICENSE` / `README.md`                 | The `cp ../../LICENSE ./dist/LICENSE` step in the package build failed. `dist/` is not committed, so the files must come from the build.                                                       |

## Design notes

- **Why not publish from the root?** Each package is published from its own
  directory (`packages/<name>`) so npm packs the package-local `package.json`
  (`files`, `exports`, `bin`) rather than the root workspace manifest.
- **Why build in the script at all?** `prepublishOnly` already builds, but the
  script builds first so a broken build fails fast before any publish
  attempt, and the per-package rebuild guarantees tarball freshness.
- **No `scripts/build.ts`** — the per-package `build` scripts already do
  everything a shared build script would: bundle with `bun build`, emit
  `.d.ts` declarations with `tsc`, and copy `LICENSE`/`README.md` into
  `dist/`. `bun run build` runs them in dependency order, so no customization
  is needed.
