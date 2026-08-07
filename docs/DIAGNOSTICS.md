# Diagnostic Codes

Doctor uses stable diagnostic codes in the format `DOC-xxxx`. Codes never
change once shipped; new rules get the next free code in their range. Every
code in this catalog is emitted by one of the 29 shipped rules (see
[RULES.md](RULES.md) for the rule implementation behind each code).

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

12 of the 29 rules attach safe fixes. Fixes are text-based, idempotent, and
contained within the plugin root; security rules never produce fixes.

| Code     | Fix behavior                                                |
| -------- | ----------------------------------------------------------- |
| DOC-1002 | Rewrites the plugin name to a normalized valid form         |
| DOC-1004 | Removes the unknown top-level field                         |
| DOC-1006 | Removes the disallowed author field                         |
| DOC-1007 | Rewrites `$schema` to the expected URL                      |
| DOC-2001 | Renames the skill directory to match the frontmatter name   |
| DOC-2005 | Normalizes a space-separated `allowed-tools` to a YAML list |
| DOC-3003 | Removes the reserved env key                                |
| DOC-3006 | Removes duplicate headers (keeps the first)                 |
| DOC-5002 | Renames the skill directory to a valid name                 |
| DOC-6002 | Renames or removes the deprecated field                     |
| DOC-7001 | Re-formats the JSON file (2-space indent, trailing newline) |
| DOC-7002 | Normalizes SKILL.md frontmatter style                       |

---

## Manifest Diagnostics (DOC-1xxx)

### DOC-1001: Missing required fields

**Rule:** `manifest-required-fields` · **Severity:** error · **Category:** spec · **Autofix:** No

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

**Rule:** `manifest-name-pattern` · **Severity:** error · **Category:** spec · **Autofix:** Yes (normalize)

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

**Rule:** `manifest-name-length` · **Severity:** error · **Category:** spec · **Autofix:** No

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

**Rule:** `manifest-unknown-fields` · **Severity:** warning · **Category:** spec · **Autofix:** Yes (remove)

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

**Rule:** `manifest-extensions-format` · **Severity:** warning · **Category:** spec · **Autofix:** No

**Description:** `extensions` must be an object keyed by reverse-domain
namespaces (e.g. `com.example.client`) with object values (§8.1, §8.2).

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

**Rule:** `manifest-author-strictness` · **Severity:** error · **Category:** spec · **Autofix:** Yes (remove)

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

**Rule:** `manifest-schema-match` · **Severity:** error · **Category:** spec · **Autofix:** Yes (rewrite)

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

## Skill Diagnostics (DOC-2xxx)

### DOC-2001: Skill name does not match directory

**Rule:** `skill-name-match` · **Severity:** error · **Category:** skills · **Autofix:** Yes (rename)

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

**Rule:** `skill-required-fields` · **Severity:** error · **Category:** skills · **Autofix:** No

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

**Rule:** `skill-description-length` · **Severity:** error · **Category:** skills · **Autofix:** No

**Description:** Skill descriptions must not exceed 1024 characters.

**Fix:** Shorten the description.

---

### DOC-2004: Skill compatibility string too long

**Rule:** `skill-compatibility-length` · **Severity:** error · **Category:** skills · **Autofix:** No

**Description:** Skill `compatibility` strings must not exceed 500 characters
when present.

**Fix:** Shorten the compatibility string.

---

### DOC-2005: Malformed allowed-tools

**Rule:** `skill-allowed-tools-format` · **Severity:** error · **Category:** skills · **Autofix:** Yes (normalize string form)

**Description:** `allowed-tools` must be a list of non-empty strings. A
space-separated string is valid and normalized to a list; any other value is
an error.

**Example:**

```yaml
allowed-tools: 'read_file,write_file' # comma-separated: invalid
```

**Fix:** The string form is normalized to a YAML list:

```yaml
allowed-tools:
  - read_file
  - write_file
```

Non-string values (e.g. numbers) cannot be normalized and must be fixed by
hand.

---

### DOC-2006: Skill body too large

**Rule:** `skill-body-size` · **Severity:** warning · **Category:** skills · **Autofix:** No

**Description:** SKILL.md bodies should stay under 5000 tokens
(whitespace-delimited words). This is a recommendation, not a hard limit.

**Fix:** Split the skill into multiple skills or shorten the body.

---

## MCP Diagnostics (DOC-3xxx)

### DOC-3001: Unsupported MCP server type

**Rule:** `mcp-server-type` · **Severity:** error · **Category:** mcp · **Autofix:** No

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

**Rule:** `mcp-stdio-command` · **Severity:** error · **Category:** mcp · **Autofix:** No

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

**Rule:** `mcp-reserved-env-keys` · **Severity:** error · **Category:** mcp · **Autofix:** Yes (remove)

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

**Rule:** `mcp-cwd-pattern` · **Severity:** error · **Category:** mcp · **Autofix:** No

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

**Rule:** `mcp-url-format` · **Severity:** error · **Category:** mcp · **Autofix:** No

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

**Rule:** `mcp-header-validation` · **Severity:** error · **Category:** mcp · **Autofix:** Yes (remove duplicates)

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

## Security Diagnostics (DOC-4xxx)

### DOC-4001: Path traversal

**Rule:** `security-path-traversal` · **Severity:** critical · **Category:** security · **Autofix:** No

**Description:** File references (skill directories, extension paths, stdio
`cwd`) must stay inside the plugin root. Absolute paths and parent traversal
(`..`) are denied.

**Example:**

```json
"mcpServers": {
  "local": { "type": "stdio", "command": "server", "cwd": "../../outside" }
}
```

**Fix:** Use plugin-relative paths (`./`, `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`).

---

### DOC-4002: Symlink escape

**Rule:** `security-symlink-escape` · **Severity:** critical · **Category:** security · **Autofix:** No

**Description:** No component directory (skill, extension) may be a symlink
that resolves outside the plugin root. The check is conservative: missing
paths and unresolvable roots are skipped silently.

**Example:**

```bash
ln -s /etc skills/evil   # skills/evil resolves outside the plugin root
```

**Fix:** Remove or re-point the symlink so it stays inside the plugin root.

---

### DOC-4003: Secret detected

**Rule:** `security-secret-detection` · **Severity:** critical · **Category:** security · **Autofix:** No

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

**Rule:** `structure-directory-layout` · **Severity:** error · **Category:** structure · **Autofix:** No

**Description:** `plugin.json` must exist at the plugin root.

**Fix:** Create `plugin.json` with a valid manifest.

---

### DOC-5002: Invalid skill directory name

**Rule:** `structure-skill-directory-name` · **Severity:** error · **Category:** structure · **Autofix:** Yes (rename)

**Description:** Skill directories under `skills/` must be named after the
skill, using the skill-name pattern (lowercase alphanumerics and hyphens,
max 64 chars, no `--`).

**Example:**

```text
skills/
  My Skill!/SKILL.md
```

**Fix:** Doctor renames the directory when the skill's declared name is
itself valid (e.g. to `skills/my-skill`).

---

### DOC-5003: Unexpected file at plugin root

**Rule:** `structure-extra-files` · **Severity:** info · **Category:** structure · **Autofix:** No

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

**Rule:** `compatibility-spec-version` · **Severity:** error · **Category:** compatibility · **Autofix:** No

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
are rejected at load time (exit 3) before rules run, so this rule fires
mainly for programmatically-built plugins.

---

### DOC-6002: Deprecated field

**Rule:** `compatibility-deprecated-fields` · **Severity:** warning · **Category:** compatibility · **Autofix:** Yes (rename or remove)

**Description:** Deprecated manifest fields must be migrated to their
replacements. The Agent Plugins v1.0.0 spec deprecates no fields, so this
rule is silent by default; the mechanism is ready for future spec versions.

**Fix:** When a replacement is defined, Doctor renames the field in place
(preserving the value byte-for-byte); otherwise it removes the field.

---

## Format Diagnostics (DOC-7xxx)

### DOC-7001: Non-canonical JSON formatting

**Rule:** `format-json-formatting` · **Severity:** info · **Category:** format · **Autofix:** Yes (reformat)

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

**Rule:** `format-frontmatter-style` · **Severity:** info · **Category:** format · **Autofix:** Yes (normalize)

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
| DOC-1xxx  | 7      | 5 error, 2 warning                      | 4          |
| DOC-2xxx  | 6      | 5 error, 1 warning                      | 2          |
| DOC-3xxx  | 6      | 6 error                                 | 2          |
| DOC-4xxx  | 3      | 3 critical                              | 0          |
| DOC-5xxx  | 3      | 2 error, 1 info                         | 1          |
| DOC-6xxx  | 2      | 1 error, 1 warning                      | 1          |
| DOC-7xxx  | 2      | 2 info                                  | 2          |
| **Total** | **29** | 19 error, 4 warning, 3 critical, 3 info | 12         |

See [RULES.md](RULES.md) for the rule implementations behind these codes and
[SPEC_SUPPORT.md](SPEC_SUPPORT.md) for coverage details (including which
codes are reachable from disk and which are enforced by the schemas first).
