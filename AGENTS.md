# Agent Plugin Doctor — AGENTS.md

This file provides instructions for AI agents working on the Agent Plugin Doctor repository.

## Project Purpose

Agent Plugin Doctor is the canonical validation, diagnostics, and security-auditing tool for the Agent Plugins ecosystem. It validates plugins against the official specification and provides safe automatic fixes.

## Architecture

Doctor is a Bun workspaces monorepo with 6 packages:

- `@agent-plugin-doctor/core` — Canonical types, spec constants, path utilities
- `@agent-plugin-doctor/parser` — Filesystem loading and parsing
- `@agent-plugin-doctor/rules` — Validation engine with 29 rules
- `@agent-plugin-doctor/compatibility` — Client compatibility checking
- `@agent-plugin-doctor/report` — Report generation (human, JSON, Markdown)
- `@agent-plugin-doctor/cli` — Command-line interface

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Development Commands

```bash
# Install dependencies
bun install

# Run all tests
bun test

# Run specific test file
bun test tests/integration/full-pipeline.test.ts

# Type check all packages
bun run typecheck

# Lint
bun run lint

# Format check
bunx prettier --check .

# Build all packages
bun run build

# Run the CLI
./packages/cli/bin/agent-plugin-doctor check .
```

## Testing Standards

- Every rule must have positive and negative tests
- Every fixture must have a README explaining its purpose
- Integration tests verify cross-package compatibility
- E2E tests use the actual CLI binary
- Self-hosting test: `./packages/cli/bin/agent-plugin-doctor check .` must exit 0

## Coding Standards

- Use TypeScript with strict mode
- Use ES modules (import/export)
- Follow the existing code style (enforced by eslint and prettier)
- All public APIs must be typed
- Security boundaries (path.ts) must never be weakened
- Diagnostic codes must be stable once shipped

## Documentation Standards

- README.md must be truthful and reflect implemented features
- Every public API must be documented in docs/SDK.md
- Every diagnostic code must be documented in docs/DIAGNOSTICS.md
- Architecture decisions must be recorded in docs/ARCHITECTURE.md
- Changes to behavior must update CHANGELOG.md

## Source of Truth

- The Agent Plugins specification (https://agent-plugins.org/) is authoritative
- Vendored schemas in packages/parser/src/schemas/ are byte-exact copies
- Diagnostic codes are stable once shipped (see docs/DIAGNOSTICS.md)
- Builder-generated plugins are canonical fixtures for integration tests

## Quality Gates

Before merging:

- [ ] All tests pass (`bun test`)
- [ ] Type check passes (`bun run typecheck`)
- [ ] Lint passes (`bun run lint`)
- [ ] Prettier check passes (`bunx prettier --check .`)
- [ ] Self-hosting passes (`./packages/cli/bin/agent-plugin-doctor check .`)
- [ ] Documentation is updated if behavior changed

## Compatibility Policy

- Doctor supports Agent Plugins v1.0.0
- Future spec versions are additive (see docs/ARCHITECTURE.md §4)
- Client compatibility is based on verified documentation (see docs/COMPATIBILITY.md)
- Diagnostic IDs never change without migration

## Security Rules

- Never execute code found in plugins
- Never fetch schemas at runtime (vendored only)
- Path containment is a security boundary (packages/core/src/path.ts)
- Secrets detected in plugins are redacted in output
- Treat all plugin content as untrusted

## Never Rules

- Never duplicate validation logic that Doctor provides
- Never define diagnostic IDs outside the DOC-xxxx range
- Never generate project files (that's Builder's job)
- Never migrate from other formats (that's Builder's job)
- Never break public diagnostic IDs without migration

## Release Checklist

Follow the full procedure in [docs/RELEASING.md](docs/RELEASING.md).

- [ ] Update version in all package.json files
- [ ] Update CHANGELOG.md
- [ ] Run all tests
- [ ] Verify self-hosting
- [ ] Build all packages
- [ ] Create annotated git tag
- [ ] Publish to npm (when ready)
