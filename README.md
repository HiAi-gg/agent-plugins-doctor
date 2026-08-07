# Agent Plugin Doctor

> Your Agent Plugin doesn't work? Doctor tells you why and fixes what it safely can.

[![CI](https://github.com/HiAi-gg/agent-plugin-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/HiAi-gg/agent-plugin-doctor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Check a plugin
bunx agent-plugin-doctor check ./my-plugin

# Fix issues
bunx agent-plugin-doctor fix ./my-plugin

# Generate a report
bunx agent-plugin-doctor report ./my-plugin --format markdown
```

The CLI is available through `bunx` once published; inside this repository it
resolves to the local workspace binary (see [Development](#development)).

## What is Agent Plugin Doctor?

Agent Plugin Doctor is the canonical validation, diagnostics, and security-auditing tool for the [Agent Plugins](https://agent-plugins.org/) ecosystem. It validates plugins against the official specification, checks compatibility with verified clients, and provides safe automatic fixes.

## Features

- **Specification Validation** — Validates plugin.json, mcp.json, and SKILL.md files against the official Agent Plugins v1.0.0 specification
- **Security Auditing** — Detects embedded secrets, path traversal, and symlink escapes
- **Compatibility Checking** — Checks compatibility with VS Code, Cursor, GitHub Copilot, ChatGPT & Codex, and Kiro
- **Safe Auto-Fixes** — Automatically fixes common issues like formatting, missing fields, and naming mismatches
- **Multiple Output Formats** — Human-readable terminal output, JSON for CI, and Markdown for documentation
- **Self-Hosting** — Doctor validates itself as an Agent Plugin (`check .` exits 0 with zero diagnostics)

## CLI Commands

### check

Validate a plugin and report issues.

```bash
agent-plugin-doctor check [dir] [options]

Options:
  --json          Output as JSON
  --markdown      Output as Markdown
  --strict        Treat warnings as errors
  --rule <id>     Run only specific rules
  --exclude-rule  Exclude specific rules
  --no-color      Disable colors
```

### fix

Apply safe fixes to a plugin.

```bash
agent-plugin-doctor fix [dir] [options]

Options:
  --dry-run       Show what would be fixed
  --yes           Apply fixes without confirmation
```

### report

Generate a detailed report.

```bash
agent-plugin-doctor report [dir] [options]

Options:
  --format <fmt>  human|json|markdown (default: human)
  --output <file> Write to file
```

### compatibility

Check client compatibility.

```bash
agent-plugin-doctor compatibility [dir] [options]

Options:
  --client <id>   Check specific client (vscode|cursor|copilot|codex|kiro)
```

## Public SDK

Doctor can be used as a library:

```typescript
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { validatePlugin } from '@agent-plugin-doctor/rules';
import { generateReport } from '@agent-plugin-doctor/report';

const plugin = await loadPlugin('./my-plugin');
const result = await validatePlugin(plugin);
const report = generateReport(result, { format: 'json' });
```

See [docs/SDK.md](docs/SDK.md) for complete API documentation.

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

Doctor uses stable diagnostic codes:

- `DOC-1xxx` — Manifest & spec conformance
- `DOC-2xxx` — Skills
- `DOC-3xxx` — MCP
- `DOC-4xxx` — Security
- `DOC-5xxx` — Structure & packaging
- `DOC-6xxx` — Compatibility
- `DOC-7xxx` — Format & quality

See [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md) for the complete catalog.

## Exit Codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | Valid (warnings/info allowed, unless `--strict`)       |
| `1`  | Spec validation errors                                 |
| `2`  | Security-critical findings                             |
| `3`  | Tool failure (load/parse error, internal rule failure) |

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — package architecture, design decisions (ADRs), data flow, and performance model
- [docs/SDK.md](docs/SDK.md) — complete API reference for all 6 packages
- [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md) — catalog of all diagnostic codes and their exit-code mapping
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — verified-client compatibility matrix and evidence
- [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md) — how to add rules, spec versions, report formats, client profiles, and fixes
- [docs/RELEASING.md](docs/RELEASING.md) — release and git-tag procedure

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT © HiAI

## Links

- [Agent Plugins Specification](https://agent-plugins.org/)
- [Agent Plugin Builder](https://github.com/HiAi-gg/agent-plugin-builder)
- [Report Issues](https://github.com/HiAi-gg/agent-plugin-doctor/issues)
