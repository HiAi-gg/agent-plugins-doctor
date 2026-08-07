# Contributing to Agent Plugin Doctor

Thank you for your interest in contributing to Agent Plugin Doctor! This document provides guidelines and information for contributors.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

1. Check if the bug is already reported in [Issues](https://github.com/HiAi-gg/agent-plugin-doctor/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment (OS, Bun version, Doctor version)
   - Example plugin (if applicable)

### Suggesting Features

1. Check if the feature is already requested in [Issues](https://github.com/HiAi-gg/agent-plugin-doctor/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Use case and benefits
   - Example usage (if applicable)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `bun test`
5. Run type check: `bun run typecheck`
6. Run lint: `bun run lint`
7. Commit with a clear message following [Conventional Commits](https://www.conventionalcommits.org/)
8. Push to your fork: `git push origin feature/my-feature`
9. Create a Pull Request

### Pull Request Guidelines

- **One feature per PR** — Keep PRs focused and reviewable
- **Write tests** — Every new feature or bug fix should have tests
- **Update documentation** — Update README, AGENTS.md, or docs/ as needed
- **Follow coding standards** — Use TypeScript strict mode, ES modules, existing code style
- **No breaking changes** — Unless discussed and approved
- **Self-hosting must pass** — `./packages/cli/bin/agent-plugin-doctor check .` must exit 0

## Development Setup

```bash
# Clone the repository
git clone https://github.com/HiAi-gg/agent-plugin-doctor.git
cd agent-plugin-doctor

# Install dependencies
bun install

# Run tests
bun test

# Run the CLI
./packages/cli/bin/agent-plugin-doctor --help
```

## Project Structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

Quick overview:

- `packages/core` — Types, constants, utilities
- `packages/parser` — Filesystem loading and parsing
- `packages/rules` — Validation engine and rules
- `packages/compatibility` — Client compatibility checking
- `packages/report` — Report generation
- `packages/cli` — Command-line interface
- `tests/fixtures` — Test fixtures
- `docs` — Documentation

## Adding a New Rule

1. Create the rule file in `packages/rules/src/rules/<category>/`
2. Implement the `Rule` interface
3. Add tests in `packages/rules/tests/rules/<category>/`
4. Register the rule in `packages/rules/src/rules/<category>/index.ts`
5. Document the diagnostic code in `docs/DIAGNOSTICS.md`
6. Update this CONTRIBUTING.md if needed

## Adding a New Client Profile

1. Verify the client supports Agent Plugins (with evidence)
2. Add the client to `packages/compatibility/src/data/clients.json`
3. Add tests in `packages/compatibility/tests/`
4. Update `docs/COMPATIBILITY.md`
5. Update README.md compatibility table

## Code Style

- **TypeScript** — Strict mode, explicit types
- **ES Modules** — Use import/export
- **Formatting** — Prettier (configured in repo)
- **Linting** — ESLint (configured in repo)
- **Naming** — camelCase for variables/functions, PascalCase for types/classes

## Testing

- **Unit tests** — Every module should have unit tests
- **Integration tests** — Cross-package compatibility
- **E2E tests** — CLI behavior with real fixtures
- **Fixture tests** — Every fixture must have a README

Run all tests:

```bash
bun test
```

## Documentation

- **README.md** — User-facing documentation
- **AGENTS.md** — AI agent instructions
- **docs/SDK.md** — Public API reference
- **docs/DIAGNOSTICS.md** — Diagnostic code catalog
- **docs/ARCHITECTURE.md** — Architecture decisions

Update documentation when you change behavior.

## Questions?

- Check [docs/](docs/) for detailed documentation
- Ask in [Discussions](https://github.com/HiAi-gg/agent-plugin-doctor/discussions)
- Open an [Issue](https://github.com/HiAi-gg/agent-plugin-doctor/issues)

Thank you for contributing!
