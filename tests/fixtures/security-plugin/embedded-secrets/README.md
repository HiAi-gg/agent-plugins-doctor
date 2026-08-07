# embedded-secrets

A plugin that embeds credentials in MCP server `env` values — a security
critical violation. All values are fake.

## What it tests

- `security-secret-detection` (`DOC-4003`, critical): secrets in stdio `env`
  values are detected and the finding fails the check with exit code 2.
- Values are redacted in diagnostic messages.
- The detector is conservative: it only fires on strong value patterns
  (prefixed keys with sufficient length, GitHub token prefixes, PEM blocks,
  credential-bearing URLs, etc.) and skips placeholder-shaped values.

## Expected result

```
agent-plugin-doctor check tests/fixtures/security-plugin/embedded-secrets
```

Exit code: `2` (security-critical)

Diagnostics: 1 critical

```
CRITICAL DOC-4003
mcp.json
Possible secret detected in MCP server "secret-server" env key "SECRET_TOKEN"
(value redacted)
```

> Note: only `SECRET_TOKEN` (`ghp_...`, a GitHub-token-shaped value) matches the
> detector's strong patterns. The `API_KEY` value `sk-1234567890abcdef` is only
> 16 characters after the `sk-` prefix, below the detector's 20-character
> threshold for prefixed keys, so it is deliberately not flagged. Keep the
> fixture values as-is: they are fake and document the detector's
> conservative boundary.

## Setup

None required. Self-contained fixture. Never substitute real credentials.
