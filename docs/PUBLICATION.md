# Publishing v0.0.3 to npm

> **OBSOLETE — historical record (v0.0.3, 2026-08-08).** This runbook
> describes the one-time v0.0.3 publication and is kept only for history. It
> has been superseded: the CLI now ships as the self-contained npm package
> `@hiai-gg/agent-plugins-doctor` (see [PUBLISHING.md](../PUBLISHING.md) and
> [RELEASING.md](RELEASING.md)), and the scripts it references
> (`publish-v003.sh`, `verify-publication.sh`) are obsolete — use
> `bun run publish:npm:dry-run` / `bun run publish:npm` instead. Do not follow
> this document for current releases.

This document is the concrete runbook for the v0.0.3 npm publication. The
generic release procedure lives in [RELEASING.md](RELEASING.md) and the
publish mechanics (dependency order, package layout, troubleshooting) in
[PUBLISHING.md](../PUBLISHING.md); this page is the version-specific
checklist and the scripts that implement it.

## Pre-Publication Checklist

- [ ] All tests pass: `bun test`
- [ ] Typecheck passes: `bun run typecheck`
- [ ] Lint passes: `bun run lint`
- [ ] Build succeeds: `bun run build`
- [ ] Self-hosting passes: `./packages/cli/bin/agent-plugins-doctor check .`
- [ ] Version is 0.0.3 in all package.json files
- [ ] CHANGELOG.md has v0.0.3 entry
- [ ] Git tag v0.0.3 created
- [ ] GitHub release created

## Publication Steps

1. **Dry-run first:**

   ```bash
   for pkg in core parser compatibility report rules cli; do
     cd packages/$pkg
     npm publish --dry-run
     cd ../..
   done
   ```

2. **Publish:**

   ```bash
   ./scripts/publish-v003.sh
   ```

3. **Verify:**
   ```bash
   ./scripts/verify-publication.sh
   ```

## Post-Publication

- Update README.md to remove "once published" qualifiers
- Update docs/SDK.md to remove "not yet published" note
- Announce release

## Troubleshooting

### npm authentication

```bash
npm login
npm whoami
```

### Version mismatch

```bash
# Ensure all packages have version 0.0.3
grep -r '"version"' packages/*/package.json
```

### Build failures

```bash
bun run clean
bun install
bun run build
```

## Rollback

If publication fails:

```bash
npm unpublish @agent-plugins-doctor/cli@0.0.3
# Fix issue, bump to 0.0.4, republish
```
