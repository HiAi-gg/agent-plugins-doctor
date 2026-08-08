# Diagnostic Codes

Doctor uses stable diagnostic codes in the format `DOC-xxxx`. Codes never
change once shipped; new rules get the next free code in their range. Every
code in this catalog is emitted by one of the 30 shipped rules (see
[RULES.md](RULES.md) for the rule implementation behind each code) or, for
`DOC-1008`, `DOC-1009`, `DOC-1010`, `DOC-2099`, `DOC-3007`, `DOC-3008`, and
`DOC-4002`, by the parser itself when a component cannot be loaded or a
manifest is structurally invalid.

Each code is also classified by **reachability** — whether it can be produced
by the public CLI against an on-disk plugin, or only through the SDK with an
in-memory `Plugin`. See [Diagnostic Reachability](#diagnostic-reachability).

## Code Ranges

| Range         | Category                    |
| ------------- | --------------------------- |
| DOC-1000–1999 | Manifest & spec conformance |
| DOC-2000–2999 | Skills                      |
| DOC-3000–3999 | MCP                         |
| DOC-4000–4999 | Security                    |
| DOC-5000–5999 | Structure & packaging       |
| DOC-6000–6999 | Compatibility               |
| DOC-7000–7999 | Format & quality            |

`DOC-0000` is reserved for internal rule failures (a rule that throws while
running). It produces exit code `3`.

## Severities

| Severity   | Effect on exit code                                 |
| ---------- | --------------------------------------------------- |
| `info`     | None (exit 0 unless errors/critical exist)          |
| `warning`  | None, unless `--strict` promotes warnings to exit 1 |
| `error`    | Exit 1                                              |
| `critical` | Exit 2                                              |

Exit-code priority: `3 > 2 > 1 > 0`. When multiple conditions apply, the
highest code wins. See [README.md](../README.md#exit-codes).

## Rules with auto-fixes

12 of the 30 rules attach safe fixes. Fixes are text-based, idempotent, and
contained within the plugin root; security rules never produce fixes.

| Code     | Fix behavior                                                |
| -------- | ----------------------------------------------------------- |
| DOC-1002 | Rewrites the plugin name to a normalized valid form         |
| DOC-1004 | Removes the unknown top-level field                         |
| DOC-1006 | Removes the disallowed author field                         |
| DOC-1007 | Rewrites `$schema` to the expected URL                      |
| DOC-2001 | Renames the skill directory to match the frontmatter name   |
| DOC-2005 | Normalizes `allowed-tools` whitespace (string form only)    |
| DOC-3003 | Removes the reserved env key                                |
| DOC-3006 | Removes duplicate headers (keeps the first)                 |
| DOC-5002 | Renames the skill directory to a valid name                 |
| DOC-6002 | Renames or removes the deprecated field                     |
| DOC-7001 | Re-formats the JSON file (2-space indent, trailing newline) |
| DOC-7002 | Normalizes SKILL.md frontmatter style                       |

## Diagnostic Reachability

Every code is classified by whether it can be produced by the public CLI
(`agent-plugins-doctor check <dir>`, which loads a plugin from disk through
`scanPlugin`) or only by the SDK (`validatePlugin()` called with an in-memory
`Plugin` object).

The distinction exists because the parser validates `plugin.json` and
`mcp.json` against the vendored JSON Schemas _before_ the rule engine runs.
Any condition the schema already rejects never reaches its rule:

- A fatal `plugin.json` schema violation makes `scanPlugin` return
  `plugin: null` and emit `DOC-1008` (one diagnostic per violation). Only the
  three `requiresPlugin: false` rules (`DOC-5001`, `DOC-5003`, `DOC-7001`)
  still run, so the manifest rules that restate a schema constraint are never
  reached from disk. An unsupported `$schema` version is rejected before
  validation with `DOC-1010`, and a non-object `extensions` field is reported
  as `DOC-1009` while the manifest still loads.
- A `SKILL.md` that fails frontmatter parsing is dropped with `DOC-2099`, so
  rules that inspect a loaded-but-incomplete skill are never reached. A
  component symlink escape is reported by the loader as `DOC-4002` (critical)
  during discovery, so it is CLI-reachable rather than SDK-only.
- An MCP server object that violates `mcp.schema.json` is dropped per-server
  (§7.2.2 rule 3) and silently removed from `mcpConfig.mcpServers`, so the
  MCP rules that restate a schema constraint are never reached.

Legend:

- **disk (rule-level)** — reachable from the CLI, emitted by the rule engine
- **disk (parser-level)** — reachable from the CLI, emitted during parse/load
- **SDK-only** — only reachable via `validatePlugin()` with an in-memory
  construct; the disk path is shadowed by the parser diagnostic in parentheses
- **dead** — not emitted by the shipped default configuration

| Code     | Category      | Severity         | Autofix | Reachability                                | Description                      |
| -------- | ------------- | ---------------- | ------- | ------------------------------------------- | -------------------------------- |
| DOC-1001 | spec          | error            | no      | SDK-only (shadowed by DOC-1008)             | Missing required manifest fields |
| DOC-1002 | spec          | error            | yes     | SDK-only (shadowed by DOC-1008)             | Invalid plugin name              |
| DOC-1003 | spec          | error            | no      | SDK-only (shadowed by DOC-1008)             | Plugin name too long             |
| DOC-1004 | spec          | warning          | yes     | disk (rule-level)                           | Unknown top-level field          |
| DOC-1005 | spec          | warning          | no      | disk (rule-level, namespace branch)         | Invalid extensions format        |
| DOC-1006 | spec          | error            | yes     | SDK-only (shadowed by DOC-1008)             | Disallowed author field          |
| DOC-1007 | spec          | error            | yes     | SDK-only (shadowed by DOC-1008/DOC-1010)    | Wrong `$schema` URL              |
| DOC-1008 | structure     | error            | no      | disk (parser-level)                         | Manifest could not be loaded     |
| DOC-1009 | spec          | error            | no      | disk (parser-level)                         | Non-object `extensions` field    |
| DOC-1010 | spec          | error            | no      | disk (parser-level)                         | Unsupported spec version         |
| DOC-2001 | skills        | error            | yes     | disk (rule-level)                           | Skill name ≠ directory name      |
| DOC-2002 | skills        | error            | no      | SDK-only (shadowed by DOC-2099)             | Skill missing required fields    |
| DOC-2003 | skills        | error            | no      | disk (rule-level)                           | Skill description too long       |
| DOC-2004 | skills        | error            | no      | disk (rule-level)                           | Compatibility string too long    |
| DOC-2005 | skills        | error            | yes     | disk (rule-level)                           | Malformed `allowed-tools`        |
| DOC-2006 | skills        | warning          | no      | disk (rule-level)                           | Skill body too large             |
| DOC-2099 | skills        | error            | no      | disk (parser-level)                         | Skill failed to load             |
| DOC-3001 | mcp           | error            | no      | SDK-only (shadowed by DOC-3008)             | Unsupported MCP server type      |
| DOC-3002 | mcp           | error            | no      | disk (rule-level)                           | Invalid stdio command            |
| DOC-3003 | mcp           | error            | yes     | SDK-only (shadowed by DOC-3008)             | Reserved env key                 |
| DOC-3004 | mcp           | error            | no      | SDK-only (shadowed by DOC-3008)             | stdio cwd not plugin-relative    |
| DOC-3005 | mcp           | error            | no      | disk (rule-level)                           | Invalid remote server URL        |
| DOC-3006 | mcp           | error            | yes     | disk (rule-level, duplicate branch)         | Duplicate or non-string header   |
| DOC-3007 | mcp           | error            | no      | disk (parser-level)                         | `mcp.json` could not be loaded   |
| DOC-3008 | mcp           | error / critical | no      | disk (parser-level + rule-level)            | Invalid MCP server entry         |
| DOC-4001 | security      | critical         | no      | disk (rule-level)                           | Path traversal                   |
| DOC-4002 | security      | critical         | no      | disk (parser-level + rule-level)            | Symlink escape                   |
| DOC-4003 | security      | critical         | no      | disk (rule-level)                           | Secret detected                  |
| DOC-5001 | structure     | error            | no      | disk (rule-level)                           | `plugin.json` missing            |
| DOC-5002 | structure     | error            | yes     | disk (rule-level)                           | Invalid skill directory name     |
| DOC-5003 | structure     | info             | no      | disk (rule-level)                           | Unexpected file at plugin root   |
| DOC-6001 | compatibility | error            | no      | SDK-only (shadowed by DOC-1010)             | Unsupported spec version         |
| DOC-6002 | compatibility | warning          | yes     | dead in v1.0.0 (SDK-only with a custom map) | Deprecated field                 |
| DOC-7001 | format        | info             | yes     | disk (rule-level)                           | Non-canonical JSON formatting    |
| DOC-7002 | format        | info             | yes     | disk (rule-level)                           | Frontmatter style issues         |

### Disk-reachable (public CLI)

DOC-1004, DOC-1005, DOC-1008, DOC-1009, DOC-1010, DOC-2001, DOC-2003,
DOC-2004, DOC-2005, DOC-2006, DOC-2099, DOC-3002, DOC-3005, DOC-3006,
DOC-3007, DOC-3008, DOC-4001, DOC-4002, DOC-4003, DOC-5001, DOC-5002,
DOC-5003, DOC-7001, DOC-7002 — 24 codes.

### Parser-level (disk-reachable)

DOC-1008, DOC-1009, DOC-1010, DOC-2099, DOC-3007, DOC-3008, DOC-4002.
These are emitted by `scanPlugin` with `ruleId: "parser"` and are a subset of
the disk-reachable set.

### SDK-only

DOC-1001, DOC-1002, DOC-1003, DOC-1006, DOC-1007, DOC-2002, DOC-3001,
DOC-3003, DOC-3004, DOC-6001 — 10 codes.

These are not dead: they are the precise, actionable form of a condition that
the schema only reports generically, and they fire whenever a caller builds a
`Plugin` in memory (Builder, editor integrations, tests). Notes on the less
obvious ones:

- **DOC-6001** — an unsupported `$schema` cannot resolve a spec version, so
  `scanPlugin` reports `DOC-1010` and leaves `plugin` null. The rule fires
  when a `Plugin` is constructed with an unknown `specVersion` directly.
- **DOC-1005** — partially disk-reachable. The reverse-domain-namespace and
  non-object-value branches fire from disk; a non-object `extensions` value
  is reported by the parser as `DOC-1009` (the schema strips it first).
- **DOC-3006** — partially disk-reachable. The duplicate-header branch fires
  from disk; the non-string-header branch is dropped per-server by the schema.

### Dead (unreachable)

DOC-6002. Agent Plugins v1.0.0 deprecates no fields, so
`DEFAULT_DEPRECATED_FIELDS` is empty and the rule always returns `[]` under
the shipped default registry. This is intentional and documented in
`packages/rules/src/rules/compatibility/deprecated-fields.ts`: the rule is a
factory (`deprecatedFieldsRule(map)`) that keeps the deprecation mechanism
tested and ready for the first spec version that deprecates a field. It is
retained rather than removed so the diagnostic ID stays stable.

---

## Manifest Diagnostics (DOC-1xxx)

### DOC-1001: Missing required fields

**Rule:** `manifest-required-fields` · **Severity:** error · **Category:** spec · **Autofix:** No · **Reachability:** SDK-only (shadowed by DOC-1008)

**Description:** `plugin.json` must contain the required fields `$schema`
and `name` (§5.2).

**Example:**

```json
{
  "version": "1.0.0"
  // Missing $schema and name
}
```

**Fix:** Add `$schema` (the plugin schema URL) and `name` (1–64 chars,
lowercase alphanumerics, hyphens and periods).

---

### DOC-1002: Invalid plugin name

**Rule:** `manifest-name-pattern` · **Severity:** error · **Category:** spec · **Autofix:** Yes (normalize) · **Reachability:** SDK-only (shadowed by DOC-1008)

**Description:** Plugin names are 1–64 chars of lowercase alphanumerics,
hyphens and periods; no consecutive separators (`--`, `..`) and no
leading/trailing separator.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "My Plugin!"
}
```

**Fix:** Doctor rewrites the name to a normalized valid form
(e.g. `my-plugin`). The fix is skipped when the name cannot be normalized
into a valid form.

---

### DOC-1003: Plugin name too long

**Rule:** `manifest-name-length` · **Severity:** error · **Category:** spec · **Autofix:** No · **Reachability:** SDK-only (shadowed by DOC-1008)

**Description:** Plugin names must not exceed 64 characters.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "this-name-is-way-too-long-this-name-is-way-too-long-this-name-is-way-too-long-abcdef"
}
```

**Fix:** Shorten the name to 64 characters or fewer.

---

### DOC-1004: Unknown top-level field

**Rule:** `manifest-unknown-fields` · **Severity:** warning · **Category:** spec · **Autofix:** Yes (remove) · **Reachability:** disk (rule-level)

**Description:** Unknown top-level fields in `plugin.json` are reported and
ignored (§5.2). The parser strips them at load time; the rule re-reads the
raw file to report them.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "frobnicate": true
}
```

**Fix:** Remove the unknown field. Doctor's fix removes exactly the member
text (including its trailing comma), leaving every other byte untouched.

---

### DOC-1005: Invalid extensions format

**Rule:** `manifest-extensions-format` · **Severity:** warning · **Category:** spec · **Autofix:** No · **Reachability:** disk (rule-level, namespace branch)

**Description:** `extensions` must be an object keyed by reverse-domain
namespaces (e.g. `com.example.client`) with object values (§8.1, §8.2). A
non-object `extensions` field (a string, array, `null`, etc.) is reported by
the parser as `DOC-1009` before this rule runs.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "extensions": {
    "not-a-namespace": true
  }
}
```

**Fix:** Use reverse-domain keys with object values:

```json
"extensions": {
  "com.example.client": { "config": true }
}
```

---

### DOC-1006: Disallowed author field

**Rule:** `manifest-author-strictness` · **Severity:** error · **Category:** spec · **Autofix:** Yes (remove) · **Reachability:** SDK-only (shadowed by DOC-1008)

**Description:** The `author` object may only contain `name`, `email`, and
`url`. Any other field violates the schema's `additionalProperties: false`.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "author": {
    "name": "HiAI",
    "phone": "+1-555-0100"
  }
}
```

**Fix:** Remove the disallowed field (`phone` in the example).

---

### DOC-1007: Wrong $schema URL

**Rule:** `manifest-schema-match` · **Severity:** error · **Category:** spec · **Autofix:** Yes (rewrite) · **Reachability:** SDK-only (shadowed by DOC-1008/DOC-1010)

**Description:** `plugin.json`'s `$schema` must be the expected schema URL
for the plugin's spec version.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/0.9.0/plugin.schema.json",
  "name": "my-plugin"
}
```

**Fix:** Doctor rewrites `$schema` to the expected URL for the version
(`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`).

---

### DOC-1008: Manifest could not be loaded

**Source:** parser (`scanPlugin`) · **Severity:** error · **Category:** structure · **Autofix:** No · **Reachability:** disk (parser-level)

**Description:** `plugin.json` could not be loaded: the plugin root does not
exist or is not a directory, the file is missing or unreadable, it is
unparseable JSON, or it does not conform to `plugin.schema.json` (one
diagnostic per schema violation). Emitted by the parser, not by a rule
(`ruleId` is `"parser"`). A manifest declaring an unsupported `$schema` is
reported as `DOC-1010` instead (see below).

**Example:**

```json
{
  "version": "1.0.0"
  // Invalid JSON — missing closing brace
}
```

**Behavior:** `scanPlugin` never throws: the failure is collected as a
diagnostic, `plugin` is `null`, and scanning continues over skills,
`mcp.json`, and extensions so every problem is reported at once. `loadPlugin`
instead throws `LoadError`/`ParseError`/`SchemaValidationError` for the same
conditions.

**Fix:** Make `plugin.json` valid, conforming JSON (see `DOC-1001`–`DOC-1007`
for specific violations), or ensure the path resolves inside the plugin root.

---

### DOC-1009: Non-object `extensions` field

**Source:** parser (`parsePluginManifest`) · **Severity:** error · **Category:** spec · **Autofix:** No · **Reachability:** disk (parser-level)

**Description:** `plugin.json` declares an `extensions` field that is not an
object keyed by reverse-domain namespace (a string, array, `null`, number, or
boolean). Per spec §8.1 the field is reported and ignored (non-fatal): the
manifest still loads with the field stripped — but it must never be _silently_
dropped, so the parser emits this explicit diagnostic.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "extensions": "not-an-object"
}
```

**Fix:** Make `extensions` an object keyed by reverse-domain namespace, or
remove the field.

---

### DOC-1010: Unsupported spec version

**Source:** parser (`parsePluginManifest`) · **Severity:** error · **Category:** spec · **Autofix:** No · **Reachability:** disk (parser-level)

**Description:** `plugin.json` declares a `$schema` URL that Doctor does not
support (an older or future Agent Plugins version). The message names the
detected version and the supported version so the failure is actionable —
instead of the vendored schema's generic "must be equal to constant" const
violation (which would otherwise surface as `DOC-1008`).

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json",
  "name": "my-plugin"
}
```

**Fix:** Target a supported spec version (currently Agent Plugins v1.0.0), or
use a Doctor version that supports the plugin's schema.

---

## Skill Diagnostics (DOC-2xxx)

### DOC-2001: Skill name does not match directory

**Rule:** `skill-name-match` · **Severity:** error · **Category:** skills · **Autofix:** Yes (rename) · **Reachability:** disk (rule-level)

**Description:** The skill `name` in SKILL.md frontmatter must match its
directory name under `skills/`.

**Example:**

```text
skills/
  summarize/SKILL.md   # frontmatter name: "summarize-text"
```

**Fix:** Doctor renames the directory to `skills/<name>` (e.g.
`skills/summarize-text`).

---

### DOC-2002: Skill missing required fields

**Rule:** `skill-required-fields` · **Severity:** error · **Category:** skills · **Autofix:** No · **Reachability:** SDK-only (shadowed by DOC-2099)

**Description:** SKILL.md frontmatter must contain `name` and `description`.

**Example:**

```markdown
---
description: Summarize text
---

Body...
```

**Fix:** Add the missing `name` (and/or `description`) field to the
frontmatter.

---

### DOC-2003: Skill description too long

**Rule:** `skill-description-length` · **Severity:** error · **Category:** skills · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** Skill descriptions must not exceed 1024 characters.

**Fix:** Shorten the description.

---

### DOC-2004: Skill compatibility string too long

**Rule:** `skill-compatibility-length` · **Severity:** error · **Category:** skills · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** Skill `compatibility` strings must not exceed 500 characters
when present.

**Fix:** Shorten the compatibility string.

---

### DOC-2005: Malformed allowed-tools

**Rule:** `skill-allowed-tools-format` · **Severity:** error · **Category:** skills · **Autofix:** Yes (whitespace normalization) · **Reachability:** disk (rule-level)

**Description:** Per the Agent Skills spec, `allowed-tools` is a
space-separated string of tool names (e.g. `Bash(git:*) Bash(jq:*) Read`).
The rule validates each whitespace-separated token. A YAML list is a
Doctor-specific extension and only warrants a warning; any other type is an
error.

**Example:**

```yaml
allowed-tools: 'Bash(git:*) Bash(jq:*) Read' # canonical form
```

**Diagnostics:**

- Invalid tool token → error (e.g. `allowed-tools: read !!!`)
- YAML list (`allowed-tools: [Read, Bash]`) → warning — not in the spec,
  consider the space-separated string form (a Doctor-specific extension).
- Number, boolean, object, or list with non-string members → error
- Empty or whitespace-only string → warning (a skill declaring no tools is
  suspicious)
- Comma-separated with spaces (`bash, read`) → warning (likely a user error;
  comma-separated without spaces, e.g. `bash,read`, is a single token and
  valid)

**Fix:** Whitespace is normalized in the string form (multiple spaces →
single space, trimmed); the string is **never** converted to a YAML list.
The list form and invalid types must be fixed by hand.

---

### DOC-2006: Skill body too large

**Rule:** `skill-body-size` · **Severity:** warning · **Category:** skills · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** SKILL.md bodies should stay under 5000 tokens
(whitespace-delimited words). This is a recommendation, not a hard limit.

**Fix:** Split the skill into multiple skills or shorten the body.

---

### DOC-2099: Skill failed to load

**Source:** parser (`loadPlugin`, `scanPlugin`) · **Severity:** error · **Category:** skills · **Autofix:** No · **Reachability:** disk (parser-level)

**Description:** A discovered skill (a directory under `skills/` containing
`SKILL.md`) could not be loaded: the frontmatter is missing or malformed
YAML, or a required field (`name`/`description`) is missing. Emitted by the
parser, not by a rule (`ruleId` is `"parser"`). Note: a component symlink
escape is reported as `DOC-4002` (critical) instead, and a malformed
`allowed-tools` type is _not_ a load failure — the parser preserves the raw
value and the DOC-2005 rule diagnoses it.

**Example:**

```markdown
---
description: Missing the required name field
---

Body...
```

**Behavior:** The failing skill is omitted from the loaded plugin, but other
skills still load (failure isolation, §7.1). The diagnostic is merged into
the validation results by the CLI pipeline, so malformed input is a
validation error (exit code `1`), not a silent drop.

**Fix:** Fix the SKILL.md frontmatter, or remove the escaping symlink so the
file resolves inside the plugin root.

---

## MCP Diagnostics (DOC-3xxx)

### DOC-3001: Unsupported MCP server type

**Rule:** `mcp-server-type` · **Severity:** error · **Category:** mcp · **Autofix:** No · **Reachability:** SDK-only (invalid entries reported as DOC-3008)

**Description:** MCP server types must be `stdio`, `streamable-http`, or
`sse`.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "local": { "type": "websocket", "url": "wss://example.com" }
  }
}
```

**Fix:** Use one of the supported types.

---

### DOC-3002: Invalid stdio command

**Rule:** `mcp-stdio-command` · **Severity:** error · **Category:** mcp · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** stdio servers must declare a single executable token as
their `command` (no whitespace; use `args` for arguments).

**Example:**

```json
"mcpServers": {
  "local": { "type": "stdio", "command": "npx -y @some/server" }
}
```

**Fix:** Move the arguments to `args`:

```json
"mcpServers": {
  "local": { "type": "stdio", "command": "npx", "args": ["-y", "@some/server"] }
}
```

---

### DOC-3003: Reserved env key

**Rule:** `mcp-reserved-env-keys` · **Severity:** error · **Category:** mcp · **Autofix:** Yes (remove) · **Reachability:** SDK-only (invalid entries reported as DOC-3008)

**Description:** The plugin runtime reserves `PLUGIN_ROOT` and `PLUGIN_DATA`;
env must not override them.

**Example:**

```json
"mcpServers": {
  "local": { "type": "stdio", "command": "server", "env": { "PLUGIN_ROOT": "/tmp" } }
}
```

**Fix:** Remove the reserved key from `env`.

---

### DOC-3004: stdio cwd not plugin-relative

**Rule:** `mcp-cwd-pattern` · **Severity:** error · **Category:** mcp · **Autofix:** No · **Reachability:** SDK-only (invalid entries reported as DOC-3008)

**Description:** stdio `cwd` must start with `./`, `${PLUGIN_ROOT}`, or
`${PLUGIN_DATA}`.

**Example:**

```json
"mcpServers": {
  "local": { "type": "stdio", "command": "server", "cwd": "/var/lib/server" }
}
```

**Fix:** Use a plugin-relative path (`./server-data`), or root it in
`${PLUGIN_ROOT}` / `${PLUGIN_DATA}`.

---

### DOC-3005: Invalid remote server URL

**Rule:** `mcp-url-format` · **Severity:** error · **Category:** mcp · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** Remote server (`streamable-http` / `sse`) URLs must be
absolute `http`/`https` URLs without userinfo (`user:password@`) or
fragments (`#...`).

**Example:**

```json
"mcpServers": {
  "remote": { "type": "streamable-http", "url": "https://user:pass@example.com/mcp#section" }
}
```

**Fix:** Remove the userinfo and fragment; use `https://example.com/mcp`.

---

### DOC-3006: Duplicate or non-string header

**Rule:** `mcp-header-validation` · **Severity:** error · **Category:** mcp · **Autofix:** Yes (remove duplicates) · **Reachability:** disk (rule-level, duplicate branch)

**Description:** Headers must be string values with unique case-insensitive
names.

**Example:**

```json
"mcpServers": {
  "remote": { "type": "streamable-http", "url": "https://example.com/mcp",
              "headers": { "Authorization": "Bearer x", "authorization": "Bearer y" } }
}
```

**Fix:** Doctor removes the duplicate members, keeping the first occurrence.
Non-string values must be fixed by hand.

---

### DOC-3007: mcp.json could not be loaded

**Source:** parser (`scanPlugin`) · **Severity:** error · **Category:** mcp · **Autofix:** No · **Reachability:** disk (parser-level)

**Description:** `mcp.json` could not be loaded: the file is unreadable,
unparseable JSON, violates the top level of `mcp.schema.json` (one diagnostic
per violation), or the path escapes the plugin root. Emitted by the parser,
not by a rule (`ruleId` is `"parser"`).

**Example:**

```json
{
  "mcpServers": "not an object"
}
```

**Behavior:** A top-level `mcp.json` violation disables MCP for the plugin
(§7.2.2 rule 2) but does not prevent loading the rest of the plugin.
`scanPlugin` reports it as a diagnostic; `loadPlugin` silently disables MCP
for the same condition. Invalid _server objects_ are isolated per-server
(§7.2.2 rule 3): the entry is preserved as `null` in `mcpServers` and
reported as a `DOC-3008` parser diagnostic, never silently dropped.

**Fix:** Make `mcp.json` conform to `mcp.schema.json`, or remove the escaping
symlink so the file resolves inside the plugin root.

---

### DOC-3008: Invalid MCP server entry

**Source:** parser (`scanPlugin`/`loadPlugin`) + rule `mcp-invalid-server-entry` · **Severity:** error (critical for path traversal) · **Category:** mcp · **Autofix:** No · **Reachability:** disk (parser-level + rule-level)

**Description:** An individual `mcpServers` entry could not be parsed — it
violates `mcp.schema.json`, or its stdio `command`/`cwd` escapes the plugin
root (path traversal). The entry is preserved in the plugin model as `null`
(valid sibling servers still load) and reported, so an invalid server never
silently disappears. The parser emits the precise reason (`ruleId:
"parser"`); the rule reports the same entry when validating a `Plugin` built
in memory (SDK path). An entry whose stdio `command` or `cwd` escapes the
plugin root is a **security-critical finding** (severity `critical`, exit 2,
matching DOC-4001); every other schema violation is a validation error
(severity `error`, exit 1).

**Example:**

```json
{
  "mcpServers": {
    "local": { "type": "websocket", "url": "ws://example.com" }
  }
}
```

Parser diagnostic: `MCP server "local" is invalid: type "websocket" is not
supported (expected stdio, streamable-http, or sse)`.

A traversal entry (`cwd: "../../etc"`) is reported at severity `critical`.

**Behavior:** Failure isolation (§7.2.2 rule 3) keeps every raw entry in
`mcpConfig.mcpServers` — valid entries as typed servers, invalid entries as
`null` — with one `DOC-3008` per invalid entry. This makes the previously
schema-isolated conditions (unsupported `type`, reserved env keys, non-
plugin-relative `cwd`, escaping stdio `command`) reachable from disk: they
surface as `DOC-3008` instead of "No issues found" (exit 0). Validation
errors exit `1`; traversal entries are critical and exit `2`. The MCP rules
`DOC-3001`/`DOC-3003`/`DOC-3004` still fire for in-memory `Plugin` objects
with typed servers (DOC-3004 reports an escaping `cwd` as `critical` too).

**Fix:** Correct the offending server entry in `mcp.json` so it conforms to
`mcp.schema.json` and its stdio command and cwd stay inside the plugin root.

---

## Security Diagnostics (DOC-4xxx)

### DOC-4001: Path traversal

**Rule:** `security-path-traversal` · **Severity:** critical · **Category:** security · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** File references (skill directories, extension paths, stdio
`cwd` and `command`) must stay inside the plugin root. Absolute paths and
parent traversal (`..`) are denied.

**Example:**

```json
"mcpServers": {
  "local": { "type": "stdio", "command": "server", "cwd": "../../outside" }
}
```

**Fix:** Use plugin-relative paths (`./`, `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`).

---

### DOC-4002: Symlink escape

**Rule:** `security-symlink-escape` · **Severity:** critical · **Category:** security · **Autofix:** No · **Reachability:** disk (parser-level + rule-level)

**Description:** No component directory (skill, extension) may be a symlink
that resolves outside the plugin root. The check is conservative: missing
paths and unresolvable roots are skipped silently. The loader emits `DOC-4002`
(critical, `ruleId: "parser"`) during discovery when a skill directory,
`SKILL.md`, or extension namespace resolves through a symlink to a location
outside the root, so the finding is CLI-reachable; the rule provides the same
check for in-memory plugins whose `rootDir` is a real tree.

**Example:**

```bash
ln -s /etc skills/evil   # skills/evil resolves outside the plugin root
```

**Fix:** Remove or re-point the symlink so it stays inside the plugin root.

---

### DOC-4003: Secret detected

**Rule:** `security-secret-detection` · **Severity:** critical · **Category:** security · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** Detects API keys, tokens, private keys, passwords, and
credential-bearing database URLs in MCP env values, headers, and manifest
string fields. Values are redacted in the message.

**Example:**

```json
"mcpServers": {
  "local": { "type": "stdio", "command": "server",
             "env": { "API_KEY": "sk-1234567890abcdefghijklmnop" } }
}
```

**Fix:** Use placeholders (e.g. `<your-key>`, `your-key-here`). Detection is
conservative: placeholder-shaped values, short values (< 16 chars), and
examples are ignored to avoid false positives.

---

## Structure Diagnostics (DOC-5xxx)

### DOC-5001: plugin.json missing

**Rule:** `structure-directory-layout` · **Severity:** error · **Category:** structure · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** `plugin.json` must exist at the plugin root.

**Fix:** Create `plugin.json` with a valid manifest.

---

### DOC-5002: Invalid skill directory name

**Rule:** `structure-skill-directory-name` · **Severity:** error · **Category:** structure · **Autofix:** Yes (rename) · **Reachability:** disk (rule-level)

**Description:** Skill directories under `skills/` must be named after the
skill, using the skill-name pattern (Unicode lowercase alphanumerics and
hyphens, max 64 chars, no `--`).

**Example:**

```text
skills/
  My Skill!/SKILL.md
```

**Fix:** Doctor renames the directory when the skill's declared name is
itself valid (e.g. to `skills/my-skill`).

---

### DOC-5003: Unexpected file at plugin root

**Rule:** `structure-extra-files` · **Severity:** info · **Category:** structure · **Autofix:** No · **Reachability:** disk (rule-level)

**Description:** Reports files at the plugin root that are not part of the
plugin structure. Informational only — does not affect the exit code.

**Example:**

```bash
$ ls my-plugin/
plugin.json  notes.log
```

**Fix:** Move unrelated files out of the plugin root, or keep them — this is
informational. Common repo files (`README.md`, `LICENSE`, `.git`, tooling
config) and reverse-domain extension directories are not reported.

---

## Compatibility Diagnostics (DOC-6xxx)

### DOC-6001: Unsupported spec version

**Rule:** `compatibility-spec-version` · **Severity:** error · **Category:** compatibility · **Autofix:** No · **Reachability:** SDK-only (shadowed by DOC-1010)

**Description:** The plugin must declare a spec version this validator
supports (currently v1.0.0).

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json",
  "name": "my-plugin"
}
```

**Fix:** Declare a supported `$schema`. Note: unsupported `$schema` values
are rejected at parse time as a `DOC-1010` parser diagnostic (exit 1) before
rules run, so this rule fires mainly for programmatically-built plugins.

---

### DOC-6002: Deprecated field

**Rule:** `compatibility-deprecated-fields` · **Severity:** warning · **Category:** compatibility · **Autofix:** Yes (rename or remove) · **Reachability:** dead in v1.0.0 (SDK-only with a custom map)

**Description:** Deprecated manifest fields must be migrated to their
replacements. The Agent Plugins v1.0.0 spec deprecates no fields, so this
rule is silent by default; the mechanism is ready for future spec versions.

**Fix:** When a replacement is defined, Doctor renames the field in place
(preserving the value byte-for-byte); otherwise it removes the field.

---

## Format Diagnostics (DOC-7xxx)

### DOC-7001: Non-canonical JSON formatting

**Rule:** `format-json-formatting` · **Severity:** info · **Category:** format · **Autofix:** Yes (reformat) · **Reachability:** disk (rule-level)

**Description:** `plugin.json` and `mcp.json` should be formatted with
2-space indentation and a trailing newline.

**Example:**

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin"
}
```

**Fix:** Doctor re-formats the file to canonical JSON (2-space indent,
trailing newline). Informational — does not affect the exit code.

---

### DOC-7002: Frontmatter style issues

**Rule:** `format-frontmatter-style` · **Severity:** info · **Category:** format · **Autofix:** Yes (normalize) · **Reachability:** disk (rule-level)

**Description:** SKILL.md frontmatter should use LF line endings, no trailing
whitespace on frontmatter lines, and proper `---` delimiters (no UTF-8 BOM).

**Example:** A file using CRLF line endings or trailing spaces inside the
frontmatter block.

**Fix:** Doctor normalizes the frontmatter region (BOM stripped, CRLF → LF,
trailing whitespace trimmed). The body is preserved byte-for-byte.
Informational — does not affect the exit code.

---

## Summary

| Range     | Count  | Severities                              | With fixes |
| --------- | ------ | --------------------------------------- | ---------- |
| DOC-1xxx  | 10     | 8 error, 2 warning                      | 4          |
| DOC-2xxx  | 7      | 6 error, 1 warning                      | 2          |
| DOC-3xxx  | 8      | 8 error                                 | 2          |
| DOC-4xxx  | 3      | 3 critical                              | 0          |
| DOC-5xxx  | 3      | 2 error, 1 info                         | 1          |
| DOC-6xxx  | 2      | 1 error, 1 warning                      | 1          |
| DOC-7xxx  | 2      | 2 info                                  | 2          |
| **Total** | **35** | 25 error, 4 warning, 3 critical, 3 info | 12         |

`DOC-1008`, `DOC-1009`, `DOC-1010`, `DOC-2099`, `DOC-3007`, `DOC-3008`, and
`DOC-4002` (7 of the 25 errors/critical across the DOC-1xxx, DOC-2xxx,
DOC-3xxx, and DOC-4xxx rows) are emitted by the parser, not by a rule. See
[RULES.md](RULES.md) for the rule implementations behind the remaining codes
and [SPEC_SUPPORT.md](SPEC_SUPPORT.md) for coverage details.

By reachability: 24 codes are disk-reachable (7 of them parser-level), 10 are
SDK-only, and 1 (`DOC-6002`) is intentionally dead under the v1.0.0 default
configuration. This catalog's
[Diagnostic Reachability](#diagnostic-reachability) table is the authoritative
per-code classification.
