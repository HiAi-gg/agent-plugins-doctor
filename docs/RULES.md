# Rule Reference

Reference for the 30 validation rules, organized by implementation. Where
[DIAGNOSTICS.md](DIAGNOSTICS.md) documents the user-facing codes, this
document describes the rule objects themselves: rule IDs, module locations,
engine behavior, and reachability.

Every rule implements the `Rule` contract from
`packages/rules/src/rule.ts`:

```ts
interface Rule {
  id: string; // e.g. "manifest-name-pattern"
  code: string; // stable diagnostic code, e.g. "DOC-1002"
  name: string;
  category: RuleCategory; // spec | skills | mcp | security | structure | compatibility | format
  severity: Severity; // info | warning | error | critical
  supportedSpecVersions: string[]; // ["1.0.0"] or ["*"]
  description: string;
  enabledByDefault: boolean;
  requiresPlugin?: boolean; // false = reads only rootDir, runs in scan mode
  check(ctx: RuleContext): Diagnostic[];
  fix?(ctx: RuleContext, diagnostic: Diagnostic): Fix | null;
}
```

All 30 rules are registered by `createDefaultRegistry()` (in
`packages/rules/src/rules/index.ts`) in category order: manifest → skills →
mcp → security → structure → compatibility → format. Rule IDs are stable
kebab-case strings; diagnostic codes are stable `DOC-xxxx` strings (see
[DIAGNOSTICS.md](DIAGNOSTICS.md)).

## Engine behavior

- **Selection** — the engine honors `enabledByDefault`, then
  `options.rules` (include list), then `options.excludeRules`, then
  spec-version support (`'*'` matches all versions).
- **Diagnostic enrichment** — the engine overrides `ruleId` and `category`
  on every diagnostic the rule emits, so rules cannot emit inconsistent
  metadata.
- **Fix attachment** — if a rule defines `fix()`, the engine calls it per
  diagnostic and attaches the result; a throwing `fix()` never fails
  validation.
- **Internal failures** — a throwing `check()` becomes a `DOC-0000`
  diagnostic with the rule's id, producing exit code 3.

## Reachability notes

Several rules are **enforced by the vendored schemas before the rules engine
runs**, so they are unreachable from on-disk plugins (the loader rejects or
isolates the plugin first). They still fire for programmatically-built
plugins, which is why they exist as rules. Marked **"schema-enforced"**
below, these are: DOC-1001, DOC-1002, DOC-1003, DOC-1006, DOC-1007, DOC-2002,
DOC-3001, DOC-3003, DOC-3004, DOC-6001.

DOC-1005 (non-object `extensions` value) is partially schema-enforced: its
reverse-domain-namespace branch is reachable from disk, and a non-object
`extensions` field is reported by the parser as `DOC-1009` before the rule
could see it. DOC-3006 (non-string header) is likewise partially
schema-enforced. DOC-4001 and DOC-5002 are fully reachable from disk in both
branches. DOC-4002 is reachable from disk through the parser (the loader
emits it during discovery for component symlink escapes) and through the rule
for in-memory plugins. DOC-6002 emits nothing under the default (empty)
deprecated-fields map.

The schema-enforced MCP conditions (unsupported `type` → DOC-3001, reserved
env keys → DOC-3003, non-plugin-relative `cwd` → DOC-3004) are **no longer
silently isolated**: the parser preserves each invalid entry as `null` and
reports it as `DOC-3008` (parser-level; validation errors exit 1, entries
whose stdio `command`/`cwd` escapes the plugin root are `critical` and exit
2), and the `DOC-3008` rule (`mcp-invalid-server-entry`) reports the same
entries when a `Plugin` is built in memory.

[DIAGNOSTICS.md](DIAGNOSTICS.md#diagnostic-reachability) carries the
authoritative per-code reachability table.

---

## Manifest rules (spec, DOC-1xxx)

Source: `packages/rules/src/rules/manifest/`

| Rule id                      | Code     | Severity | Fix                         | Checks                                                         |
| ---------------------------- | -------- | -------- | --------------------------- | -------------------------------------------------------------- |
| `manifest-required-fields`   | DOC-1001 | error    | —                           | `$schema` and `name` present and non-empty                     |
| `manifest-name-pattern`      | DOC-1002 | error    | replace (normalize)         | name matches `NAME_PATTERN`, ≤ 64 chars                        |
| `manifest-name-length`       | DOC-1003 | error    | —                           | name ≤ `NAME_MAX_LENGTH` (64)                                  |
| `manifest-unknown-fields`    | DOC-1004 | warning  | replace (remove member)     | no unknown top-level fields (§5.2)                             |
| `manifest-extensions-format` | DOC-1005 | warning  | —                           | `extensions` object with reverse-domain keys and object values |
| `manifest-author-strictness` | DOC-1006 | error    | replace (remove member)     | `author` only `name`/`email`/`url`                             |
| `manifest-schema-match`      | DOC-1007 | error    | replace (rewrite `$schema`) | `$schema` equals the expected plugin schema URL                |

Parser-level manifest codes (no rule): `DOC-1009` (non-object `extensions`
field, §8.1 — reported and stripped, exit 1) and `DOC-1010` (unsupported
`$schema` version — exit 1). See [DIAGNOSTICS.md](DIAGNOSTICS.md).

### Implementation notes

- **Raw-file rules**: `manifest-unknown-fields` and `manifest-author-strictness`
  re-read `plugin.json` from disk because the parser strips unknown fields
  and rejects or drops disallowed author fields at load time. They fall back
  to the in-memory manifest when the file is unavailable (programmatic
  plugins). Their `fix()` identifies the target member via the message-embedded
  field name (internal contract) and removes exactly that member's span,
  including its trailing comma.
- **`manifest-name-pattern`** exports `normalizePluginName(name)` — the
  best-effort normalizer used by its fix (lowercase, replace disallowed
  chars with hyphens, collapse separators, strip edges). Returns `null` when
  no valid normalization exists; the fix is then skipped.
- **`manifest-schema-match`** uses `getSpecVersion()` rather than the
  plugin's resolved spec so it also catches version mismatches.
- **Reachability**: the schema enforces name pattern/length (`pattern` +
  `maxLength`) and author shape (`additionalProperties: false` rejects at
  parse → `DOC-1008`, exit 1). An unsupported `$schema` version is rejected
  by the parser before validation (`DOC-1010`, exit 1).
  DOC-1002/1003/1006/1007 are therefore mostly reachable through the SDK on
  programmatic plugins; DOC-1004 and DOC-1005 are the disk-reachable
  manifest rules (a non-object `extensions` field surfaces as parser-level
  `DOC-1009`).

## Skill rules (skills, DOC-2xxx)

Source: `packages/rules/src/rules/skill/`

| Rule id                      | Code     | Severity | Fix                  | Checks                                                                                  |
| ---------------------------- | -------- | -------- | -------------------- | --------------------------------------------------------------------------------------- |
| `skill-name-match`           | DOC-2001 | error    | rename (directory)   | frontmatter `name` equals directory name                                                |
| `skill-required-fields`      | DOC-2002 | error    | —                    | `name` and `description` present and non-empty                                          |
| `skill-description-length`   | DOC-2003 | error    | —                    | description ≤ `DESCRIPTION_MAX_LENGTH` (1024)                                           |
| `skill-compatibility-length` | DOC-2004 | error    | —                    | `compatibility` ≤ `COMPATIBILITY_MAX_LENGTH` (500)                                      |
| `skill-allowed-tools-format` | DOC-2005 | error    | replace (whitespace) | `allowed-tools` is a space-separated string; YAML list = warning, invalid types = error |
| `skill-body-size`            | DOC-2006 | warning  | —                    | body < `BODY_TOKEN_LIMIT` (5000 words)                                                  |

### Implementation notes

- **`skill-name-match`** renames the directory to `skills/<name>` via a
  `rename` fix (`oldPath`/`newPath`), refused when the target exists.
- **`skill-allowed-tools-format`**: the space-separated _string_ form (e.g.
  `Bash(git:*) Bash(jq:*) Read`) is canonical per the Agent Skills spec. YAML
  lists are a Doctor extension (warning), invalid types (numbers, booleans,
  objects, mixed lists) are errors, and empty/whitespace-only or
  comma+space-separated strings are warnings. The parser preserves the raw
  `allowed-tools` value so this rule diagnoses non-string forms from disk.
  The fix only normalizes whitespace in the string form — it never converts
  a string into a list.
- **`skill-body-size`** exports `countTokens(text)` — a whitespace-split
  word count. It is a recommendation (warning), not a hard limit.
- **Reachability**: DOC-2001/DOC-5002 fire on disk (skill dir/frontmatter
  name mismatch); DOC-2002/2003 are partially schema-adjacent — malformed
  skills are skipped by the loader before rules run, but valid-yet-oversized
  descriptions are disk-reachable (see the `huge-description` fixture).

## MCP rules (mcp, DOC-3xxx)

Source: `packages/rules/src/rules/mcp/`

| Rule id                    | Code     | Severity         | Fix                         | Checks                                                              |
| -------------------------- | -------- | ---------------- | --------------------------- | ------------------------------------------------------------------- |
| `mcp-server-type`          | DOC-3001 | error            | —                           | server `type` ∈ {stdio, streamable-http, sse}                       |
| `mcp-stdio-command`        | DOC-3002 | error            | —                           | stdio `command` is a single token                                   |
| `mcp-reserved-env-keys`    | DOC-3003 | error            | replace (remove member)     | env does not declare `PLUGIN_ROOT`/`PLUGIN_DATA`                    |
| `mcp-cwd-pattern`          | DOC-3004 | error / critical | —                           | stdio `cwd` starts with `./`, `${PLUGIN_ROOT}`, or `${PLUGIN_DATA}` |
| `mcp-url-format`           | DOC-3005 | error            | —                           | remote URL: absolute http/https, no userinfo, no fragment           |
| `mcp-header-validation`    | DOC-3006 | error            | replace (remove duplicates) | headers are strings; names unique case-insensitively                |
| `mcp-invalid-server-entry` | DOC-3008 | error            | —                           | every server entry parsed; invalid entries reported, never dropped  |

### Implementation notes

- **`mcp-reserved-env-keys`** and **`mcp-header-validation`** compute
  targeted JSON member-removal fixes using the single-pass scanner in
  `packages/rules/src/util.ts` (`scanJsonMembers`): removal spans include the
  member's trailing comma (or the preceding comma for the last member), so
  fixes apply cleanly in any order and are idempotent. Header dedupe uses
  `findDuplicateJsonMemberSpans`, which keeps the first occurrence of each
  case-insensitive key.
- **`mcp-url-format`** validates with the WHATWG `URL` parser: protocol must
  be `http:`/`https:`, no `username`/`password`, no `hash`.
- **`mcp-invalid-server-entry`** (DOC-3008) reports server entries preserved
  as `null` by the parser (schema violation, or a stdio `command` escaping
  the plugin root). From disk the parser emits the precise reason; the rule
  covers the SDK path where a `Plugin` is built in memory.
- **`mcp-cwd-pattern`** (DOC-3004) reports a `cwd` that escapes the plugin
  root (absolute path or `..` traversal) as `critical` — matching DOC-4001 —
  and any other non-conforming `cwd` as `error`.
- **Reachability**: the mcp schema enforces `propertyNames.not.enum` for
  reserved env keys, `cwd`'s pattern, and server `type` — but since the
  parser preserves invalid entries as `null` (reported as DOC-3008), those
  conditions are no longer silent on disk. DOC-3003, DOC-3004, and DOC-3001
  remain SDK-only rules for typed in-memory servers; DOC-3002
  (empty/whitespace command — schema allows it) and DOC-3006 (duplicate JSON
  keys parse to the last value, schema-valid) are the disk-reachable MCP
  rules with fixes.

## Security rules (security, DOC-4xxx)

Source: `packages/rules/src/rules/security/`

| Rule id                     | Code     | Severity | Fix | Checks                                         |
| --------------------------- | -------- | -------- | --- | ---------------------------------------------- |
| `security-path-traversal`   | DOC-4001 | critical | —   | file references stay inside the plugin root    |
| `security-symlink-escape`   | DOC-4002 | critical | —   | no component symlink resolves outside the root |
| `security-secret-detection` | DOC-4003 | critical | —   | no secrets in env, headers, or manifest fields |

### Implementation notes

- **No security rule produces fixes.** Nothing destructive is ever applied.
- **`security-path-traversal`** checks `isTraversalPath(value)` (absolute
  POSIX paths (`/…`), absolute Windows paths (`C:\…`), and `..` segments).
  It checks skill directories, extension paths, and stdio `cwd` and
  `command`. The shared helper lives in `@agent-plugins-doctor/core` (so the
  parser's stdio `command` check, DOC-3008, agrees with the rule); the rule
  module re-exports it. The loader's `resolvePluginPath` already rejects
  escaping paths, so DOC-4001 is largely schema/loader-enforced on disk; it
  remains valuable for programmatic plugins.
- **`security-symlink-escape`** is conservative: only component directories
  that resolve to a real path outside the real plugin root are reported;
  missing paths and unresolvable roots are skipped silently. The parser also
  emits `DOC-4002` during discovery when a skill directory, `SKILL.md`, or
  extension namespace is a symlink escape, so the finding is CLI-reachable.
- **`security-secret-detection`** is conservative to avoid false positives:
  strong patterns only (≥ 16 chars; PEM blocks; `AKIA…`; `ghp_…`/`gho_…`/
  `ghu_…`/`ghs_…`/`ghr_…`; `sk-`/`rk-`/`pk-` prefixes with ≥ 20-char values;
  credential-bearing DB URLs; suggestive key names with long values), and
  placeholder-shaped values (`<…>`, `your-…`, `xxx`, `changeme`, `…`) are
  skipped. Messages redact the detected value.
- **Reachability**: DOC-4003 is disk-reachable (`embedded-secrets` fixture,
  exit 2); DOC-4002 is disk-reachable through the parser (the loader emits it
  for component symlink escapes) and through the rule for in-memory plugins;
  DOC-4001 is loader/schema-enforced on disk and fires for programmatic
  plugins.

## Structure rules (structure, DOC-5xxx)

Source: `packages/rules/src/rules/structure/`

| Rule id                          | Code     | Severity | Fix                | Checks                                                  |
| -------------------------------- | -------- | -------- | ------------------ | ------------------------------------------------------- |
| `structure-directory-layout`     | DOC-5001 | error    | —                  | `plugin.json` exists at the plugin root                 |
| `structure-skill-directory-name` | DOC-5002 | error    | rename (directory) | dir name is a valid skill name matching the frontmatter |
| `structure-extra-files`          | DOC-5003 | info     | —                  | unexpected files at the plugin root                     |

### Implementation notes

- **`structure-skill-directory-name`** fires on two conditions: an invalid
  directory name, or a valid-but-mismatched one. Its `rename` fix only
  applies when the declared skill name is itself valid; it renames the
  directory and is refused when the target exists.
- **`structure-extra-files`** maintains `EXPECTED_ENTRIES` — spec files plus
  common repo/tooling entries (`.git`, `README.md`, `LICENSE`, `package.json`,
  `tsconfig*.json`, monorepo scaffolding, …). Dotfiles are skipped;
  reverse-domain directories are treated as extension namespaces and not
  reported. This rule is why Doctor can self-host from a monorepo root.
- **Reachability**: DOC-5001 is loader-enforced on disk (missing
  `plugin.json` → `LoadError`), but fires for programmatic plugins.
  DOC-5003 fires for any root with extra files (e.g. `AGENTS.md`).

## Compatibility rules (compatibility, DOC-6xxx)

Source: `packages/rules/src/rules/compatibility/`

| Rule id                           | Code     | Severity | Fix                        | Checks                                   |
| --------------------------------- | -------- | -------- | -------------------------- | ---------------------------------------- |
| `compatibility-spec-version`      | DOC-6001 | error    | —                          | plugin declares a supported spec version |
| `compatibility-deprecated-fields` | DOC-6002 | warning  | replace (rename or remove) | no deprecated manifest fields            |

### Implementation notes

- **`compatibility-spec-version`** supports `['*']` (applies to every version
  under validation). Unsupported `$schema` values are rejected at parse time
  as a `DOC-1008` parser diagnostic (exit 1), so the rule mainly fires for
  programmatically-built plugins.
- **`compatibility-deprecated-fields`** is a **factory**:
  `deprecatedFieldsRule(map = DEFAULT_DEPRECATED_FIELDS)`. v1.0.0 deprecates
  no fields, so the default map is empty and the rule is silent by default.
  Future spec versions register a map; the rename fix preserves the value
  byte-for-byte via `rewriteJsonMembers`, the removal fix drops the member.

## Format rules (format, DOC-7xxx)

Source: `packages/rules/src/rules/format/`

| Rule id                        | Code     | Severity | Fix                      | Checks                                                                    |
| ------------------------------ | -------- | -------- | ------------------------ | ------------------------------------------------------------------------- |
| `format-json-formatting`       | DOC-7001 | info     | replace (canonical JSON) | `plugin.json`/`mcp.json` use 2-space indent + trailing newline            |
| `format-frontmatter-style`     | DOC-7002 | info     | replace (normalize)      | SKILL.md frontmatter: LF, no BOM/trailing whitespace, proper delimiters   |
| `format-duplicate-frontmatter` | DOC-7003 | error    | — (detection only)       | SKILL.md has more than one YAML frontmatter block; only the first is used |

### Implementation notes

- **Whole-file replace fixes**: the two fixable format rules replace the
  entire file.
  Because other rules may have rewritten the file first, the fix engine
  re-derives the canonical form from the _current_ content
  (`canonicalJson` / `normalizeSkillFrontmatter`) when the original `oldText`
  no longer matches — this keeps `--fix` conflict-free regardless of rule
  order.
- **`format-json-formatting`** checks `./plugin.json` and `./mcp.json`
  (only when present; `extension.json` is not checked — it has no schema).
  Absent or unparseable files are skipped (those are parser errors).
- **`format-frontmatter-style`** exports `frontmatterStyleIssue(text)` for
  reuse. Its fix normalizes only the frontmatter region; the markdown body
  is preserved byte-for-byte.
- **`format-duplicate-frontmatter`** exports
  `countDuplicateFrontmatterBlocks(text)` and ships **no autofix** — Doctor
  never deletes file content automatically. The loader only uses the first
  `---`-delimited block, so a second block is dead content. Markdown
  horizontal rules, `---` inside code fences, and YAML examples without
  delimiters are ignored.
- **Reachability**: fully disk-reachable; DOC-7001/DOC-7002 are
  informational (exit 0) and DOC-7003 is an error (exit 1).

---

## Registry order and fix conflicts

`createDefaultRegistry()` registers rules in the order listed above
(manifest → … → format). Combined with the fix engine's properties —
text-based matching, per-fix file re-reads, no-op idempotence, targeted
member spans, and re-derived format fixes — multiple fixes on the same file
apply cleanly in any order, and repeated runs never change a file twice.

See [DIAGNOSTICS.md](DIAGNOSTICS.md) for the user-facing catalog,
[SPEC_SUPPORT.md](SPEC_SUPPORT.md) for coverage details, and
[SDK.md](SDK.md) for the `Rule`/`RuleRegistry`/`ValidationEngine` API.
