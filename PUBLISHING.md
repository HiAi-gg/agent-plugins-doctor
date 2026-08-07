# Publishing Agent Plugin Doctor to npm

This document describes how to build and publish the six
`@agent-plugins-doctor/*` packages to the npm registry. The full release
procedure (version bumps, changelog, quality gates, git tagging) lives in
[docs/RELEASING.md](docs/RELEASING.md); this document covers the publish step
itself.

## Package layout and dependency order

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
