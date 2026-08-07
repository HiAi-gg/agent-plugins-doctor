---
name: doctor
description: Diagnose and fix Agent Plugins. Use when users ask to check, validate, fix, or audit an Agent Plugin, or when they need compatibility information.
license: MIT
compatibility: Works with all Agent Plugins clients
---

# Agent Plugin Doctor Skill

This skill provides diagnostic and validation capabilities for Agent Plugins.

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
agent-plugin-doctor check <plugin-directory>

# Apply safe fixes
agent-plugin-doctor fix <plugin-directory>

# Generate a report
agent-plugin-doctor report <plugin-directory> --format markdown

# Check compatibility
agent-plugin-doctor compatibility <plugin-directory>
```

## What It Checks

Doctor validates:

- Plugin manifest (plugin.json) against the official schema
- Skill definitions (SKILL.md files) for correctness
- MCP server configurations (mcp.json) for validity
- Security issues (secrets, path traversal, symlink escapes)
- Compatibility with verified clients (VS Code, Cursor, Codex, etc.)

## Output

Doctor provides:

- Clear error messages with diagnostic codes
- File locations and line numbers
- Explanations of what's wrong and why
- Safe automatic fixes where possible
- Compatibility reports for all major clients

## Examples

```bash
# Validate the current directory
agent-plugin-doctor check .

# Fix issues in a plugin
agent-plugin-doctor fix ./my-plugin

# Generate a markdown report
agent-plugin-doctor report ./my-plugin --format markdown > report.md

# Check compatibility with a specific client
agent-plugin-doctor compatibility ./my-plugin --client cursor
```
