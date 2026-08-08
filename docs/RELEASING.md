# Releasing Agent Plugin Doctor

How to cut a release of Agent Plugin Doctor. The checklist in
[AGENTS.md](../AGENTS.md) is the condensed version; this document is the full
procedure. It covers the v0.1.0 release and every future release.

## 1. Version Bump

All six packages plus the root workspace share the same version. Update every
`package.json`:

- `package.json` (root)
- `packages/{core,parser,rules,compatibility,report,cli}/package.json`

Bump to the next version per [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The API-stability contract in `tests/integration/api-stability.test.ts` means
any breaking change to a public export requires a **major** version bump,
coordinated with [Agent Plugin Builder](https://github.com/HiAi-gg/agent-plugin-builder).

```bash
# Set the new version everywhere (example: 0.1.0)
for f in package.json packages/*/package.json; do
  sed -i "s/\"version\": \".*\"/\"version\": \"0.1.0\"/" "$f"
done
```

Verify no package was missed:

```bash
grep '"version"' package.json packages/*/package.json
```

## 2. Update the Changelog

Add a `[X.Y.Z] - <date>` entry to [CHANGELOG.md](../CHANGELOG.md) following
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Group changes under
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, and
`Performance` as applicable. Reference diagnostic codes and docs that changed.

## 3. Run the Quality Gates

Everything must pass before a tag is created:

```bash
bun install            # resolve workspace links (if dependencies changed)
bun test               # full suite: unit + integration + E2E + benchmarks
bun run typecheck      # strict-mode TS, all packages
bun run lint           # oxlint (eslint config)
bunx prettier --check . # formatting
./packages/cli/bin/agent-plugins-doctor check .  # self-hosting: exit 0
```

## 4. Build All Packages

```bash
bun run build
```

Each package emits `dist/` via `bun build ./src/index.ts --outdir ./dist`.
Verify all six builds exit 0 and that the built entry points resolve.

## 5. Update Documentation (if behavior changed)

Per the documentation standards in [AGENTS.md](../AGENTS.md):

- New/changed public APIs → `docs/SDK.md`
- New/changed diagnostic codes → `docs/DIAGNOSTICS.md` (codes are stable once
  shipped; never renumber)
- Architecture changes → `docs/ARCHITECTURE.md`
- Compatibility changes → `docs/COMPATIBILITY.md`
- Behavior changes → `CHANGELOG.md`

## 6. Tag the Release

Create an **annotated** git tag with the version and the release notes:

```bash
git add -A
git commit -m "chore: release v0.1.0"

# Annotated tag (recommended: carries the release message)
git tag -a v0.1.0 -m "Agent Plugin Doctor v0.1.0

- 6-package monorepo (core, parser, rules, compatibility, report, cli)
- 30 validation rules across 7 categories
- ... (summary from CHANGELOG)"
```

Tags are named `v<version>` (e.g. `v0.1.0`) and created from a clean
checkout of the exact commit being released. Lightweight tags work too
(`git tag v0.1.0`), but annotated tags record the release message.

Push the tag:

```bash
git push origin main
git push origin v0.1.0
```

## 7. Publish to npm (when ready)

The packages are published from the `packages/*` workspaces. Doctor is not yet
published; when it is, use the publish automation
([PUBLISHING.md](../PUBLISHING.md)):

```bash
# Build all packages and show exactly what would be published (safe)
bun run publish:dry-run

# Build all packages and publish in dependency order
# core → parser → compatibility → report → rules → cli
bun run publish:all
```

`scripts/publish.ts` builds first, verifies that all six packages share one
version, checks `npm whoami` (real publish only), and publishes each package
from its own directory via `npm publish` (or `npm publish --dry-run` in dry
run mode). Each package's `prepublishOnly` runs `bun run build` again as a
safety net, so the tarball always matches the source on disk.

The CLI package's `bin` field (`agent-plugins-doctor`) makes it available via
`bunx agent-plugins-doctor` once published.

## Verification Checklist

- [ ] Version bumped in all 7 `package.json` files
- [ ] `CHANGELOG.md` updated with the release entry
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bunx prettier --check .` passes
- [ ] `./packages/cli/bin/agent-plugins-doctor check .` exits 0
- [ ] `bun run build` exits 0 for all packages
- [ ] Documentation updated (SDK/DIAGNOSTICS/ARCHITECTURE/COMPATIBILITY as
      needed)
- [ ] Annotated tag `v<version>` created and pushed
