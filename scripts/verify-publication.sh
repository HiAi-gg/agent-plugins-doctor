#!/bin/bash
set -e

# OBSOLETE — historical record (v0.0.3, 2026-08-08). This script verified the
# one-time v0.0.3 publication and is kept only for history. It is superseded
# by the version-integrity gate (bun run check:versions), the external-consumer
# E2E test (tests/integration/external-consumer.test.ts), and the smoke
# commands in PUBLISHING.md. Do not run this script for current releases — the
# version assertions below expect 0.0.3.

# Post-publication verification for Agent Plugins Doctor v0.0.3.
#
# Usage: ./scripts/verify-publication.sh
#
# Confirms the published CLI resolves via bunx/npx, reports the published
# version, and runs a real `check` against a minimal valid plugin.

echo "Verifying npm publication..."

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Test bunx
echo "Testing bunx..."
bunx @hiai-gg/agent-plugins-doctor --version
bunx @hiai-gg/agent-plugins-doctor --help

# Test npx
echo "Testing npx..."
npx @hiai-gg/agent-plugins-doctor --version
npx @hiai-gg/agent-plugins-doctor --help

# Verify the version is the one we just published
echo "Verifying version..."
if ! bunx @hiai-gg/agent-plugins-doctor --version | grep -q "0.0.3"; then
  echo "ERROR: published version is not 0.0.3"
  exit 1
fi
echo "✓ Version 0.0.3 confirmed"

# Create test plugin
echo "Creating test plugin..."
mkdir test-plugin
cat > test-plugin/plugin.json <<'EOF'
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "test-plugin"
}
EOF

# Test check command
echo "Testing check command..."
bunx @hiai-gg/agent-plugins-doctor check ./test-plugin

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo "✓ Publication verified!"
