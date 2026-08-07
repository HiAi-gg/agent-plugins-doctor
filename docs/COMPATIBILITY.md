# Client Compatibility

## Overview

Agent Plugin Doctor checks plugin compatibility against verified Agent Plugins
clients. Compatibility is based on official documentation and verified
behavior. The data lives in
`packages/compatibility/src/data/clients.json` and is consumed by
`CompatibilityChecker` — see [docs/SDK.md](SDK.md) for the API.

Compatibility is a **secondary, informational** check. Doctor's primary role
is spec validation (see [Compatibility vs Validation](#compatibility-vs-validation)).

## Verified Clients

| Client          | Skills | MCP stdio | MCP Streamable HTTP | MCP SSE | Evidence                                                                     |
| --------------- | ------ | --------- | ------------------- | ------- | ---------------------------------------------------------------------------- |
| VS Code         | ✅     | ✅        | ✅                  | ✅      | [Docs](https://code.visualstudio.com/docs/agent-customization/agent-plugins) |
| Cursor          | ✅     | ✅        | ✅                  | ✅      | [Docs](https://cursor.com/docs/plugins)                                      |
| GitHub Copilot  | ✅     | ✅        | ✅                  | ✅      | [Docs](https://docs.github.com/en/copilot/concepts/agents/about-plugins)     |
| ChatGPT & Codex | ✅     | ✅        | ✅                  | ❌      | [Docs](https://developers.openai.com/plugins)                                |
| Kiro            | ✅     | ✅        | ✅                  | ✅      | [Docs](https://kiro.dev/docs/powers/)                                        |

`✅`/`❌` reflect the `capabilities` field of each client profile:
`skills`, `mcpStdio`, `mcpStreamableHttp`, `mcpLegacySse`, and `extensions`.

## Evidence Levels

Each client profile carries an `evidence` level copied into every
compatibility check Doctor produces:

- **docs** — Verified from official client documentation
- **runtime** — Verified through actual runtime testing
- **expected** — Inferred from spec compliance, not directly verified
- **none** — No evidence available

All five currently verified clients are at **docs** level, sourced from the
official documentation linked above.

## Compatibility Checking

For each client profile, Doctor checks:

1. **Spec version support** — the plugin's spec version must be in the
   client's `supportedSpecVersions`.
2. **Skills support** — whether the client supports Agent Skills.
3. **MCP transport support** — whether the client supports the transports a
   plugin's servers use: `stdio`, `streamable-http`, and legacy `sse`.
4. **Extension support** — whether the client supports extensions.

The checker is **conservative**: an unsupported spec version, skills, or MCP
transport is an `error` (the plugin is incompatible with that client), while
an unsupported extension is a `warning` (extensions are optional per §8, so
the plugin still works — the client just ignores it). A client is
`compatible` when it has no error-severity issues.

## Known Limitations

### ChatGPT & Codex

- Does not support the legacy SSE transport (`mcpLegacySse: false`) — SSE is
  deprecated in favor of streamable HTTP.
- A plugin that declares an SSE server is valid but **incompatible** with
  Codex.

### All Clients

- Extension support varies by client; unsupported extensions produce a
  warning, not an error.
- Some clients may ignore unknown extensions (per spec §8), which is why
  unsupported extensions never make a plugin incompatible.
- Compatibility is based on documented capabilities; behavior not covered by
  official documentation is conservatively treated as unsupported.

## Adding a New Client

To add a new client profile:

1. Verify the client supports Agent Plugins (with evidence — official docs
   preferred).
2. Add the profile to `packages/compatibility/src/data/clients.json`
   (`id`, `name`, `supportedSpecVersions`, `capabilities`, `evidence`,
   `source`).
3. Add tests in `packages/compatibility/tests/` covering the new client's
   capabilities.
4. Update this document (the table above).
5. Update the README.md compatibility table.

The registry rejects duplicate client ids (`ClientProfileRegistry.register`
throws), so a verified profile cannot be silently shadowed.

## Compatibility vs Validation

- **Validation** — Does the plugin conform to the spec? (Doctor's primary
  role)
- **Compatibility** — Will specific clients accept this plugin? (Secondary
  check)

A plugin can be **valid but incompatible** (e.g., uses SSE with Codex).
A plugin **cannot be compatible but invalid** — compatibility assumes
validity, so a spec-invalid plugin is never reported as compatible.

## Client-Specific Behavior

- **ChatGPT & Codex** — no legacy SSE transport; prefers streamable HTTP
  (`mcpLegacySse: false`).
- **VS Code, Cursor, GitHub Copilot, Kiro** — support all four capabilities
  (`skills`, `mcpStdio`, `mcpStreamableHttp`, `mcpLegacySse`).
- All five currently verified clients support extensions (`extensions:
true`).

As client-specific requirements beyond the spec are verified, they will be
documented here and reflected in the client profiles.

## Reporting Compatibility Issues

When Doctor finds compatibility issues:

- Exit code: **0** (compatibility is informational, not blocking — it does
  not change the validation exit code)
- Diagnostic category: `compatibility`
- Severity: `warning` or `info` (per check; incompatible transports/spec are
  reported as errors within the compatibility check itself, but never change
  the process exit code)
- Message explains which client and what issue

## Future Clients

As new clients adopt Agent Plugins, Doctor will add them to the compatibility
matrix. Clients must:

1. Publicly document Agent Plugins support
2. Provide evidence of conformance
3. Be verifiable by the Doctor maintainers

Until a client meets all three, it is not added to the verified set — an
unverified client would make the compatibility report misleading.
