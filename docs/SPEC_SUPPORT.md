# Specification Support

What Agent Plugin Doctor validates against the [Agent Plugins
specification](https://agent-plugins.org/), what it does not validate, and
why.

## Supported spec versions

| Version                      | Status                  | Notes                                                                                                                        |
| ---------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Agent Plugins v1.0.0         | **Supported (current)** | `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` and `…/mcp.schema.json`                               |
| Future versions (e.g. 2.0.0) | Not supported           | Plugins declaring them surface a `DOC-1008` parser diagnostic (exit 1) per the spec's "must not silently ignore" requirement |

Related standards validated alongside the core spec:

- **Agent Skills** (via agentskills.io) — SKILL.md frontmatter (`name`,
  `description`, `license`, `compatibility`, `metadata`, `allowed-tools`)
  and body parsing.
- **MCP (Model Context Protocol)** — MCP server configuration: `stdio`,
  `streamable-http`, and `sse` transports, env, args, cwd, headers, URLs.

Version support is registry-based (`resolveSpecVersion` / `getSpecVersion`
in `@agent-plugin-doctor/core`) and additive: adding a spec version never
changes how existing versions are validated. See §5 for the mechanism.

## Validated features

### plugin.json (manifest)

| Feature                  | Mechanism                                                  | Examples                                                                  |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `$schema` conformance    | Vendored `plugin.schema.json` (byte-exact copy) + DOC-1007 | expected URL check                                                        |
| Required fields          | Schema `required` + DOC-1001                               | `$schema`, `name`                                                         |
| Name pattern/length      | Schema `pattern`/`maxLength` + DOC-1002/DOC-1003           | lowercase alphanumerics, hyphens, periods; ≤ 64                           |
| Author shape             | Schema + DOC-1006                                          | only `name`/`email`/`url`                                                 |
| Unknown top-level fields | Parser strips non-fatally (§5.2) + DOC-1004                | reported and ignored                                                      |
| Extensions field         | Schema + DOC-1005                                          | reverse-domain keys with object values (§8.1, §8.2)                       |
| Field types/values       | Vendored schema                                            | `version`, `description`, `homepage`, `repository`, `license`, `keywords` |
| Deprecated fields        | DOC-6002                                                   | none deprecated in v1.0.0 (mechanism ready)                               |

### skills/ (Agent Skills)

| Feature                | Mechanism                             | Examples                                                                                                         |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Frontmatter parsing    | `parseSkillFrontmatter` (gray-matter) | quoted strings, multiline descriptions, YAML lists, BOM                                                          |
| Required fields        | Parser + DOC-2002                     | `name`, `description`                                                                                            |
| Name/directory match   | DOC-2001, DOC-5002                    | frontmatter `name` == directory name                                                                             |
| Name pattern/length    | Schema-adjacent + DOC-5002            | `SKILL_NAME_PATTERN`, ≤ 64                                                                                       |
| Description length     | DOC-2003                              | ≤ 1024 chars                                                                                                     |
| Compatibility length   | DOC-2004                              | ≤ 500 chars                                                                                                      |
| `allowed-tools`        | DOC-2005 (type + tokens)              | canonical space-separated string (e.g. `Bash(git:*) Bash(jq:*) Read`); YAML list = Doctor extension, not in spec |
| Body size              | DOC-2006                              | < 5000 tokens (recommendation)                                                                                   |
| Body/frontmatter style | DOC-7002                              | LF endings, no BOM/trailing whitespace, delimiters                                                               |
| Skill discovery        | Loader                                | fixed depth: `skills/*/SKILL.md` only                                                                            |

The space-separated string form of `allowed-tools` is canonical per the
Agent Skills spec. The YAML list form is a Doctor extension, not
spec-compliant: the parser preserves the raw value and DOC-2005 warns on the
list form and errors on other non-string types (from disk and from the SDK).

### mcp.json (MCP)

| Feature              | Mechanism                                              | Examples                                                                      |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Document conformance | Vendored `mcp.schema.json` (byte-exact copy)           | `$schema`, `mcpServers` object                                                |
| Server type          | Schema + DOC-3001                                      | `stdio` \| `streamable-http` \| `sse`                                         |
| stdio command        | DOC-3002                                               | single executable token                                                       |
| stdio args           | Schema                                                 | string array                                                                  |
| stdio env            | Schema + DOC-3003 (reserved keys) + DOC-4003 (secrets) | `PLUGIN_ROOT`/`PLUGIN_DATA` reserved                                          |
| stdio cwd            | Schema + DOC-3004 + DOC-4001                           | `./`, `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`                                      |
| Remote URLs          | DOC-3005                                               | absolute http/https, no userinfo, no fragment                                 |
| Headers              | DOC-3006                                               | string values, unique case-insensitive names                                  |
| Failure isolation    | Loader (§7.2.2)                                        | invalid servers skipped; valid ones survive; top-level violations disable MCP |

### extensions

| Feature          | Mechanism                                | Examples                                                                                                  |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Namespace format | Loader (reverse-domain regex) + DOC-1005 | `com.example.client`                                                                                      |
| Path containment | `resolvePluginPath`                      | symlink/traversal escapes denied                                                                          |
| Extension data   | Loader (best-effort)                     | `extension.json` read when present; no schema                                                             |
| Client impact    | Compatibility checker                    | `extensions: true` → none (unknown namespaces safely ignored, §8.2); `false` → warning; unverified → info |

### Security (whole plugin)

| Feature         | Mechanism         | Examples                                                        |
| --------------- | ----------------- | --------------------------------------------------------------- |
| Path traversal  | Loader + DOC-4001 | `..`, absolute paths in references                              |
| Symlink escapes | Loader + DOC-4002 | component symlinks resolving outside the root                   |
| Secrets         | DOC-4003          | API keys, tokens, private keys, DB credentials; redacted output |
| Code execution  | Never performed   | plugin content is data, never executed                          |

### Client compatibility

The compatibility checker validates against 5 verified client profiles
(docs-verified: `evidence: "docs"`): VS Code, Cursor, GitHub Copilot,
ChatGPT & Codex (the only client without MCP legacy SSE), and Kiro. Checks
are conservative — an unsupported spec version, skills, or MCP transport is
an error (incompatible); extensions are optional per §8 and all five verified
clients have `extensions: true` (mechanism supported, unknown namespaces
safely ignored per §8.2), so a plugin with extensions never raises a
compatibility issue against them. See
[README.md](../README.md#supported-clients) for the capability matrix and
[docs/COMPATIBILITY.md](COMPATIBILITY.md) for extension semantics.

## Not validated (and why)

| Item                                      | Why not                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `extension.json` content semantics        | The spec defines no portable semantics for extension data (§8) — the loader reads it best-effort but validation is impossible without a schema |
| SKILL.md body content                     | The body is arbitrary Markdown; only size (DOC-2006) and frontmatter style (DOC-7002) are checked                                              |
| Execution behavior of stdio servers       | Doctor never executes plugin code (security rule) — it validates the _configuration_ only                                                      |
| Line numbers / source ranges              | No rule currently emits `range`; diagnostics carry plugin-relative `file` paths only                                                           |
| Plugin licensing/legal review             | Out of scope; `license` is validated only as a schema-typed field                                                                              |
| Live endpoint health (remote MCP servers) | Doctor performs no network I/O; URLs are validated structurally only                                                                           |
| Schema drift detection                    | Schemas are vendored byte-exact copies; Doctor never fetches at runtime (spec §4.1)                                                            |

## Known limitations

1. **Schema-enforced rules are unreachable from disk.** The vendored schemas
   already enforce required fields, name patterns, `$schema` constness,
   author strictness, reserved env keys, cwd patterns, and server types, so
   DOC-1001, DOC-1002, DOC-1003, DOC-1006, DOC-1007, DOC-2002, DOC-3001,
   DOC-3003, DOC-3004, DOC-4002, and DOC-6001 fire only for
   programmatically-built plugins, not from `check` on disk (parts of
   DOC-1005 and DOC-3006 are likewise shadowed). This is by design — the
   rules exist so SDK consumers get diagnostics regardless of how the plugin
   was constructed. See
   [DIAGNOSTICS.md](DIAGNOSTICS.md#diagnostic-reachability) for the
   authoritative per-code table.
2. **No diagnostic ranges.** Diagnostics report plugin-relative `file` paths
   but never line/column `range`s. Human output shows the file path; it
   cannot yet point at a specific line.
3. **Secret detection is intentionally conservative.** Short values (< 16
   chars), placeholder-shaped values, and weak patterns are ignored to avoid
   false positives — real secrets that happen to look like placeholders are
   missed by design.
4. **Duplicate JSON keys are invisible after parsing.** `JSON.parse` keeps
   the last occurrence of a duplicated key, so DOC-3006 catches duplicates
   only by re-reading the raw file text (the header rule does this).
5. **Skill discovery is fixed-depth.** Only `skills/*/SKILL.md` (immediate
   children) is loaded; nested skill directories are ignored per spec §7.1.
6. **mcp.json failure modes.** A top-level violation (bad `$schema`,
   non-object `mcpServers`, non-object server entry) disables MCP for the
   plugin instead of failing the whole load (§7.2.2).
7. **`allowed-tools` whitespace fix only.** DOC-2005 auto-fixes whitespace
   in the space-separated string form; it never converts a string into a
   YAML list, and invalid types must be corrected by hand.

## Future spec version support

Adding a new spec version (e.g. 2.0.0) is **additive** and requires:

1. **Constants** — a new `packages/core/src/spec/vX/` module (schema URLs,
   name patterns, limits) exported from `spec/index.ts`.
2. **Registry entry** — register the version in the `specVersions` map used
   by `resolveSpecVersion` / `getSpecVersion`.
3. **Vendored schemas** — byte-exact copies of the new `plugin.schema.json`
   and `mcp.schema.json` in `packages/parser/src/schemas/` (never fetched at
   runtime).
4. **Rule support** — rules declare `supportedSpecVersions`; existing rules
   with `['1.0.0']` are simply skipped for the new version unless extended.
   The `'*'` rules (DOC-6001, DOC-6002) apply to every version.
5. **Deprecations** — populate `DEPRECATIONS` (compatibility package) and/or
   register a map with `deprecatedFieldsRule()` (rules package) once the new
   version deprecates fields.

Unsupported `$schema` URLs are rejected at load time — never silently
ignored, so plugins for future versions fail loudly until Doctor adds
support. In the CLI they surface as `DOC-1008` parser diagnostics (exit 1);
the strict `loadPlugin` API throws instead.

See [SDK.md](SDK.md) for the API behind these mechanisms,
[DIAGNOSTICS.md](DIAGNOSTICS.md) for the code catalog, and
[RULES.md](RULES.md) for rule details.
