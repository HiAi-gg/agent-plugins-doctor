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

| Client          | Skills | MCP stdio | MCP Streamable HTTP | MCP SSE | Extensions | Evidence                                                                     |
| --------------- | ------ | --------- | ------------------- | ------- | ---------- | ---------------------------------------------------------------------------- |
| VS Code         | ✅     | ✅        | ✅                  | ✅      | ✅         | [Docs](https://code.visualstudio.com/docs/agent-customization/agent-plugins) |
| Cursor          | ✅     | ✅        | ✅                  | ✅      | ✅         | [Docs](https://cursor.com/docs/plugins)                                      |
| GitHub Copilot  | ✅     | ✅        | ✅                  | ✅      | ✅         | [Docs](https://docs.github.com/en/copilot/concepts/agents/about-plugins)     |
| ChatGPT & Codex | ✅     | ✅        | ✅                  | ❌      | ✅         | [Docs](https://developers.openai.com/plugins)                                |
| Kiro            | ✅     | ✅        | ✅                  | ✅      | ✅         | [Docs](https://kiro.dev/docs/powers/)                                        |

`✅`/`❌` reflect the boolean `capabilities` fields of each client profile
(`skills`, `mcpStdio`, `mcpStreamableHttp`, `mcpLegacySse`, `extensions`).
The `Extensions` column means the client **supports the extension mechanism**
— see [Extension Semantics](#extension-semantics) below for what that does
and does not claim.

## Evidence Levels

Each client profile carries an `evidence` level copied into every
compatibility check Doctor produces:

- **docs** — Verified from official client documentation
- **runtime** — Verified through actual runtime testing
- **expected** — Inferred from spec compliance, not directly verified
- **none** — No evidence available

All five currently verified clients are at **docs** level, sourced from the
official documentation linked above. Each profile also carries a dated
`verificationNote` recording when and against which documentation pages the
capabilities were last verified.

## Extension Semantics

Extensions are vendor/client-specific (§8): a plugin's extension namespaces
are only meaningful to the client that defined them, and clients safely ignore
namespaces they do not know (spec §8.2). Doctor therefore never claims a
client "understands" every extension namespace.

In a client profile, `capabilities.extensions` is a boolean that means the
client **supports the extension mechanism**: it can parse an `extensions`
field and safely ignores unknown namespaces per spec §8.2. It does **not**
mean the client understands every possible namespace — understanding a
namespace (e.g. `com.cursor.features`) must be verified per namespace, not
implied by the mechanism flag. Each profile may carry an `extensionsNote`
clarifying what was verified about extensions (e.g. which namespaces a client
documents).

When a plugin declares extensions, each compatibility check reports how they
are handled via `extensionsHandling`:

| Value         | Meaning                                                                                  | Plugin has extensions →                  |
| ------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| `supported`   | Client verifiably understands the namespace(s); only possible when a profile lists them. | no issue (extensions are processed)      |
| `ignored`     | Client supports the mechanism; unknown namespaces are safely ignored (§8.2).             | no issue (extensions are safely ignored) |
| `unsupported` | Client does not support extensions.                                                      | `warning`                                |
| `unknown`     | Insufficient evidence (e.g. profile with `evidence: 'none'`).                            | `info`                                   |

With the current simple capability model (no per-namespace lists), Doctor
reports `ignored` for every client with `extensions: true`: the mechanism is
supported and unknown namespaces are safely ignored. `supported` is reserved
for profiles that explicitly list verified namespaces.

Because extensions are optional and safely ignored, they **never** contribute
to the `working`/`unsupported` capability lists and never downgrade a check
from `FULL` — the `CapabilityId` set contains no `extensions` id.

## Compatibility Checking

For each client profile, Doctor checks:

1. **Spec version support** — the plugin's spec version must be in the
   client's `supportedSpecVersions`.
2. **Skills support** — whether the client supports Agent Skills.
3. **MCP transport support** — whether the client supports the transports a
   plugin's servers use: `stdio`, `streamable-http`, and legacy `sse`.
4. **Extension behavior** — how the client handles extensions, per the
   [Extension Semantics](#extension-semantics) above.

The checker is **conservative**: an unsupported spec version, skills, or MCP
transport is an `error` (the plugin is incompatible with that client).
Extensions are optional per §8, so extension findings are never blocking: a
client that does not support extensions produces a `warning`, and a client
with insufficient evidence produces an `info`.

## Compatibility Levels

Each client check carries a `CompatibilityLevel` instead of a bare boolean, so
a plugin that works _partially_ is distinguishable from one that works not at
all:

| Level         | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `FULL`        | Every plugin capability the client honors is supported.                     |
| `PARTIAL`     | At least one capability works with the client and at least one does not.    |
| `UNSUPPORTED` | No capabilities work (e.g. the spec version is unsupported).                |
| `UNKNOWN`     | Insufficient evidence to determine (client profile has `evidence: 'none'`). |

The level is derived per check as follows:

1. Unsupported spec version → `UNSUPPORTED` (nothing can work).
2. Profile evidence `none` → `UNKNOWN` (unverified profile).
3. No unsupported capabilities → `FULL`.
4. Every used capability unsupported → `UNSUPPORTED`.
5. Otherwise → `PARTIAL`.

The check also lists which plugin capabilities work (`working`, e.g.
`['skills', 'mcp-stdio']`) and which do not (`unsupported`, e.g.
`['mcp-sse']`). Extensions are optional and ignored safely, so they never
appear in `working`/`unsupported` and never downgrade a check from `FULL`.

The `compatible` boolean is derived from the level (`true` only for `FULL`)
and kept for backward compatibility.

For example, a plugin using Skills + stdio MCP + SSE MCP checked against
ChatGPT & Codex (which lacks the legacy SSE transport) reports:

- `level: 'partial'` — Skills and stdio MCP work, SSE does not.
- `working: ['skills', 'mcp-stdio']`, `unsupported: ['mcp-sse']`.

Under the old binary model this was reported as plain `compatible: false`,
which conflated "partially works" with "does not work at all".

## Known Limitations

### ChatGPT & Codex

- Does not support the legacy SSE transport (`mcpLegacySse: false`) — SSE is
  deprecated in favor of streamable HTTP.
- A plugin that declares an SSE server is valid but **not fully supported**
  by Codex: `partial` when the plugin also uses capabilities Codex supports,
  `unsupported` when SSE is the only capability it uses.

### All Clients

- `extensions: true` means the client supports the extension mechanism and
  safely ignores unknown namespaces (spec §8.2) — it does **not** mean the
  client understands every extension namespace.
- Unknown extension namespaces produce no issue: portable components (skills,
  MCP) remain usable and the extensions are safely ignored.
- A client that does not support extensions produces a warning; a client with
  insufficient evidence (`evidence: 'none'`) produces an info — never an
  error, because extensions are optional and safely ignored per §8.
- Compatibility is based on documented capabilities; behavior not covered by
  official documentation is conservatively treated as unsupported.

## Adding a New Client

To add a new client profile:

1. Verify the client supports Agent Plugins (with evidence — official docs
   preferred).
2. Add the profile to `packages/compatibility/src/data/clients.json`
   (`id`, `name`, `supportedSpecVersions`, `capabilities`, `evidence`,
   `source`, and a dated `verificationNote` recording when and against what
   the profile was verified).
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

A plugin can be **valid but only partially supported** (e.g., Skills + SSE
with Codex → `partial`). A plugin **cannot be compatible but invalid** —
compatibility assumes validity, so a spec-invalid plugin is never reported as
compatible.

## Client-Specific Behavior

- **ChatGPT & Codex** — no legacy SSE transport; prefers streamable HTTP
  (`mcpLegacySse: false`).
- **VS Code, Cursor, GitHub Copilot, Kiro** — support all four boolean
  capabilities (`skills`, `mcpStdio`, `mcpStreamableHttp`, `mcpLegacySse`).
- All five currently verified clients support the extension mechanism
  (`extensions: true`); each profile carries an `extensionsNote` clarifying
  that unknown namespaces are safely ignored per spec §8.2. Doctor never
  claims a client "understands" an extension namespace unless it is
  explicitly listed in the profile.

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
