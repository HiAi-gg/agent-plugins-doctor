# Agent Plugin Doctor

> Your Agent Plugin doesn't work? Doctor tells you why and fixes what it safely can.

[![CI](https://github.com/HiAi-gg/agent-plugins-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/HiAi-gg/agent-plugins-doctor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@hiai-gg/agent-plugins-doctor)](https://www.npmjs.com/package/@hiai-gg/agent-plugins-doctor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Install globally (npm or bun)
npm install -g @hiai-gg/agent-plugins-doctor
bun install -g @hiai-gg/agent-plugins-doctor

# Check a plugin
agent-plugins-doctor check ./my-plugin

# Fix issues
agent-plugins-doctor fix ./my-plugin

# Generate a report
agent-plugins-doctor report ./my-plugin --format markdown
```

Or run without installing:

```bash
bunx @hiai-gg/agent-plugins-doctor check ./my-plugin
npx @hiai-gg/agent-plugins-doctor check ./my-plugin
```

The CLI is published to npm as a single self-contained package,
[`@hiai-gg/agent-plugins-doctor`](https://www.npmjs.com/package/@hiai-gg/agent-plugins-doctor)
(runs on Node ≥ 18 — no Bun required); inside this repository it resolves to
the local workspace binary (see [Development](#development)).

## What is Agent Plugin Doctor?

Agent Plugin Doctor is the canonical validation, diagnostics, and security-auditing tool for the [Agent Plugins](https://agent-plugins.org/) ecosystem. It validates plugins against the official specification, checks compatibility with verified clients, and provides safe automatic fixes.

## Features

- **Specification Validation** — Validates plugin.json, mcp.json, and SKILL.md files against the official Agent Plugins v1.0.0 specification
- **Security Auditing** — Detects embedded secrets, path traversal, and symlink escapes
- **Compatibility Checking** — Checks compatibility with VS Code, Cursor, GitHub Copilot, ChatGPT & Codex, and Kiro
- **Safe Auto-Fixes** — 12 automatic fixes for common issues like formatting, missing fields, and naming mismatches
- **Multiple Output Formats** — Human-readable terminal output, JSON for CI, and Markdown for documentation
- **Self-Hosting** — Doctor validates itself as an Agent Plugin (`check .` exits 0 with zero diagnostics)
- **Cross-Platform** — CI runs the full suite on Linux, macOS, and Windows (Bun 1.3.14)
- **Comprehensive Test Suite** — 635 tests across 79 files: unit, integration, E2E (spawns the real binary), fixture-based, and benchmark budgets

## CLI Commands

### check

Validate a plugin and report issues.

```bash
agent-plugins-doctor check [dir] [options]

Options:
  --json          Output as JSON
  --markdown      Output as Markdown
  --strict        Treat warnings as errors
  --rule <id>     Run only specific rules
  --exclude-rule  Exclude specific rules
  --verbose       Show detailed output
  --no-color      Disable colors
```

### fix

Apply safe fixes to a plugin.

```bash
agent-plugins-doctor fix [dir] [options]

Options:
  --dry-run       Show what would be fixed
  --yes           Apply fixes without confirmation
  --json          Output as JSON
  --no-color      Disable colors
```

### report

Generate a detailed report.

```bash
agent-plugins-doctor report [dir] [options]

Options:
  --format <fmt>  human|json|markdown (default: human)
  --output <file> Write to file
```

### compatibility

Check client compatibility.

```bash
agent-plugins-doctor compatibility [dir] [options]

Options:
  --client <id>   Check specific client (vscode|cursor|copilot|codex|kiro)
  --json          Output as JSON
```

## SDK (Library API)

The CLI is published as `@hiai-gg/agent-plugins-doctor`, a single bundled
package that includes everything — no separate library dependencies are
needed to use it.

The six `@agent-plugins-doctor/*` packages (core, parser, rules,
compatibility, report, cli) are **not yet published to npm** — SDK
publication is deferred. Until they are published, import them from the
monorepo. See [docs/SDK.md](docs/SDK.md) for the complete API reference and
[PUBLISHING.md](PUBLISHING.md) for the npm publish procedure.

## Supported Specifications

- Agent Plugins v1.0.0
- Agent Skills (via agentskills.io)
- MCP (Model Context Protocol)

## Supported Clients

| Client          | Skills | MCP stdio | MCP Streamable HTTP | MCP SSE |
| --------------- | ------ | --------- | ------------------- | ------- |
| VS Code         | ✅     | ✅        | ✅                  | ✅      |
| Cursor          | ✅     | ✅        | ✅                  | ✅      |
| GitHub Copilot  | ✅     | ✅        | ✅                  | ✅      |
| ChatGPT & Codex | ✅     | ✅        | ✅                  | ❌      |
| Kiro            | ✅     | ✅        | ✅                  | ✅      |

## Relationship with Builder

Agent Plugin Doctor is the validation counterpart to [Agent Plugin Builder](https://github.com/HiAi-gg/agent-plugin-builder). Builder creates plugins; Doctor validates them. Builder will consume Doctor as a dependency to ensure generated plugins are valid.

See [docs/BUILDER_INTEGRATION.md](docs/BUILDER_INTEGRATION.md) for integration details.

## Diagnostic Codes

Doctor uses 35 stable diagnostic codes:

- `DOC-1xxx` — Manifest & spec conformance
- `DOC-2xxx` — Skills
- `DOC-3xxx` — MCP
- `DOC-4xxx` — Security
- `DOC-5xxx` — Structure & packaging
- `DOC-6xxx` — Compatibility
- `DOC-7xxx` — Format & quality

Of the 35 codes, 24 are reachable from the public CLI (7 of them emitted by
the parser during load), 10 fire only through the SDK, and 1 (`DOC-6002`) is
intentionally dormant under v1.0.0.

See [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md) for the complete catalog,
per-code reachability, and the autofix list.

## Exit Codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | Valid (warnings/info allowed, unless `--strict`)               |
| `1`  | Validation errors (malformed input, spec violations)           |
| `2`  | Security-critical findings                                     |
| `3`  | Tool failure (inaccessible plugin root, internal rule failure) |

## Development

```bash
# Install dependencies
bun install

# Run tests (635 tests across 79 files)
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build
```

CI (`.github/workflows/ci.yml`) runs install, build, typecheck, lint, and the
full test suite on Linux, macOS, and Windows.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — package architecture, design decisions (ADRs), data flow, and performance model
- [docs/SDK.md](docs/SDK.md) — complete API reference for all 6 packages
- [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md) — catalog of all diagnostic codes and their exit-code mapping
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — verified-client compatibility matrix and evidence
- [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md) — how to add rules, spec versions, report formats, client profiles, and fixes
- [docs/RELEASING.md](docs/RELEASING.md) — release and git-tag procedure
- [PUBLISHING.md](PUBLISHING.md) — npm publish procedure for the six packages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT © HiAI

## Links

- [Agent Plugins Specification](https://agent-plugins.org/)
- [Agent Plugin Builder](https://github.com/HiAi-gg/agent-plugin-builder)
- [Report Issues](https://github.com/HiAi-gg/agent-plugins-doctor/issues)
