#!/bin/bash
set -e

# OBSOLETE — historical record (v0.0.3, 2026-08-08). This script was used for
# the one-time v0.0.3 publication of the six @agent-plugins-doctor/* SDK
# packages and is kept only for history. It is superseded by scripts/publish.ts
# (bun run publish:dry-run / bun run publish:all) and by the CLI umbrella
# package flow (bun run publish:npm:dry-run / bun run publish:npm); see
# PUBLISHING.md and docs/RELEASING.md. Do not run this script for current
# releases — the version guard below will fail on any version other than
# 0.0.3.

# Publish Agent Plugins Doctor v0.0.3 to npm.
#
# Usage: ./scripts/publish-v003.sh
#
# Publish order is dependency order: core first, then the packages that
# depend on it, and the CLI (which depends on all) last.

# Resolve the repo root from the script location so this works from any cwd.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Publishing Agent Plugins Doctor v0.0.3 to npm..."

# Verify we're on the right commit
echo "Verifying version..."
for f in package.json packages/*/package.json; do
  grep '"version": "0.0.3"' "$f" >/dev/null || {
    echo "Version mismatch in $f! Expected 0.0.3."
    exit 1
  }
done
echo "✓ All package.json files carry version 0.0.3"

# Build all packages
echo "Building..."
bun run build

# Publish in dependency order
echo "Publishing packages..."
for pkg in core parser compatibility report rules cli; do
  echo "Publishing @agent-plugins-doctor/$pkg..."
  cd packages/$pkg
  npm publish --access public
  cd ../..
done

echo "✓ All packages published!"
echo ""
echo "Verify with:"
echo "  npm view @hiai-gg/agent-plugins-doctor"
echo "  bunx @hiai-gg/agent-plugins-doctor --version"
