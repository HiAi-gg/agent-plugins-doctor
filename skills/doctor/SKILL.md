---
name: doctor
description: Diagnose and fix Agent Plugins. Use when users ask to check, validate, fix, or audit an Agent Plugin, or when they need compatibility information.
license: MIT
compatibility: Requires a client that supports Agent Skills and terminal command execution. Doctor CLI is invoked through Bun (bunx agent-plugin-doctor) or npm (npx agent-plugin-doctor).
---

# Agent Plugin Doctor Skill

This skill provides diagnostic and validation capabilities for Agent Plugins.

## Runtime Requirements

Installing this skill does **not** install the Doctor CLI. Doctor is a
separate package (`@agent-plugin-doctor/cli`) that this skill invokes through
the terminal:

- **Bun** — `bunx agent-plugin-doctor check <plugin-directory>`
- **npm** — `npx agent-plugin-doctor check <plugin-directory>`

At least one of Bun or npm must be installed and available on the PATH. The
Doctor CLI must also be installed (for example, by installing this repository
or, once published, `npm install -g @agent-plugin-doctor/cli`). If the CLI is
not available, the commands below fail with a "command not found" error.

## When to Use

Use this skill when users ask:

- "Why doesn't my Agent Plugin work?"
- "Check this Agent Plugin"
- "Fix this plugin"
- "Is this plugin compatible with Cursor/Codex/VS Code?"
- "Audit this Agent Plugin"
- "Validate this plugin"

## How to Use

Run the Doctor CLI to validate plugins:

```bash
# Check a plugin
bunx agent-plugin-doctor check <plugin-directory>

# Apply safe fixes
bunx agent-plugin-doctor fix <plugin-directory>

# Generate a report
bunx agent-plugin-doctor report <plugin-directory> --format markdown

# Check compatibility
bunx agent-plugin-doctor compatibility <plugin-directory>
```

(`npx agent-plugin-doctor ...` works identically under npm.)

## What It Checks

Doctor validates:

- Plugin manifest (plugin.json) against the official schema
- Skill definitions (SKILL.md files) for correctness
- MCP server configurations (mcp.json) for validity
- Security issues (secrets, path traversal, symlink escapes)
- Compatibility with verified clients (VS Code, Cursor, GitHub Copilot,
  ChatGPT & Codex, Kiro)

## Output

Doctor provides:

- Clear error messages with diagnostic codes
- File locations
- Explanations of what's wrong and why
- Safe automatic fixes where possible
- Compatibility reports for all verified clients

## Examples

```bash
# Validate the current directory
bunx agent-plugin-doctor check .

# Fix issues in a plugin
bunx agent-plugin-doctor fix ./my-plugin

# Generate a markdown report
bunx agent-plugin-doctor report ./my-plugin --format markdown > report.md

# Check compatibility with a specific client
bunx agent-plugin-doctor compatibility ./my-plugin --client cursor
```
