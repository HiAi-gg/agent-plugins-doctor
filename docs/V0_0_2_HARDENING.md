# Agent Plugin Doctor v0.0.2 Hardening

This document summarizes the hardening work completed for v0.0.2.

## Issues Addressed

### P0 — Critical Correctness

1. **allowed-tools (DOC-2005) inverted** — Fixed parser to preserve string form per Agent Skills spec. Rewrote DOC-2005 to accept string as canonical, YAML list as warning.

2. **Compatibility model binary** — Overhauled to support FULL/PARTIAL/UNSUPPORTED/UNKNOWN levels. Verified all 5 client profiles against documentation.

3. **Diagnostic scanning missing** — Added `scanPlugin()` API for diagnostic-oriented loading. Malformed input now produces exit 1 (validation error) instead of exit 3 (tool failure).

4. **Public distribution not working** — Prepared all 6 packages for npm publishing. External installation test verifies `bunx @hiai-gg/agent-plugins-doctor` works.

### P1 — Hardening

5. **Documentation truth pass** — Fixed Doctor skill metadata, audited README, verified all docs match implementation.

6. **Real Builder integration** — Tested against real Builder v0.0.6. All generated plugins pass validation.

7. **Autofix audit** — Found and fixed 3 bugs (DOC-3006 idempotence, rename ordering, order-dependent removal). Added 18 idempotence tests.

## Architecture Decisions

- **6-package monorepo preserved** — No major restructuring
- **scanPlugin() additive** — Kept loadPlugin() strict for SDK consumers
- **Compatibility levels** — FULL/PARTIAL/UNSUPPORTED/UNKNOWN instead of boolean
- **Extension semantics** — `extensions: true` means "safely ignores unknown" per spec

## Known Remaining Limitations

- Line/column ranges not supported (not P0)
- Some diagnostics are SDK-only (documented in DIAGNOSTICS.md)
- DOC-6002 (deprecated-fields) is intentionally dead for v1.0.0

## External Test Findings

Status: Awaiting red-team report. Template prepared in docs/EXTERNAL_TEST_FINDINGS.md.

## Test Coverage

- 578 tests across 73 files
- All quality gates pass (typecheck, lint, prettier, build)
- Self-hosting passes (Doctor validates itself)
- External installation test passes
- Real Builder integration tests pass

## Release Checklist

- [x] All P0 issues fixed
- [x] All P1 hardening complete
- [x] Documentation truthful and complete
- [x] All tests pass
- [x] Self-hosting passes
- [x] External installation works
- [x] Real Builder output validated
- [x] Autofixes audited and idempotent
- [x] CI green on Linux/macOS/Windows
- [ ] External red-team report (pending)
