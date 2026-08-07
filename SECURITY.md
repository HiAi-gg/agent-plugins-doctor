# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Agent Plugin Doctor, please report it responsibly.

### How to Report

1. **Email:** Send details to security@hiai.gg (or create a private security advisory on GitHub)
2. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment:** We will acknowledge receipt within 48 hours
- **Assessment:** We will assess the severity and validity within 7 days
- **Fix:** We will work on a fix and coordinate disclosure
- **Credit:** We will credit reporters (unless they prefer anonymity)

### Security Model

Agent Plugin Doctor treats all plugin content as untrusted:

- Never executes code found in plugins
- Never fetches schemas at runtime (vendored only)
- Enforces path containment (no traversal, no symlink escapes)
- Redacts secrets detected in plugins
- Validates against official schemas offline

### Security Boundaries

The following are security boundaries and must never be weakened:

- `packages/core/src/path.ts` — Path containment enforcement
- Secret detection in `packages/rules/src/rules/security/`
- Schema validation in `packages/parser/src/`

## Security Best Practices

When using Doctor:

- Review fixes before applying (use `--dry-run` first)
- Don't run Doctor on untrusted plugins in sensitive environments
- Keep Doctor updated to the latest version
- Report any suspicious behavior

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter submits vulnerability
2. We validate and assess severity
3. We develop and test a fix
4. We release the fix
5. We publicly disclose the vulnerability (after 90 days or when fix is widely deployed)
