# Risk Assessment

## Overview

This document identifies and assesses risks to the Agent Plugin Doctor
project, with mitigation strategies. It covers technical, integration,
operational, and external risks. Supporting evidence for the mitigations can be
found in [docs/ARCHITECTURE.md](ARCHITECTURE.md),
[docs/REPOSITORY_AUDIT.md](REPOSITORY_AUDIT.md), and
[docs/COMPATIBILITY.md](COMPATIBILITY.md).

## Technical Risks

### R1: Specification Changes

**Risk:** Agent Plugins specification changes, breaking Doctor's validation.

**Severity:** HIGH
**Likelihood:** MEDIUM
**Impact:** Doctor validates against outdated spec

**Mitigation:**

- Version-isolated spec layer (`spec/v1/`, future `spec/v2/` — ADR-004)
- Vendored schemas (never fetched at runtime)
- Rules declare supported spec versions
- Clear error message for unsupported versions (DOC-1010 diagnostic, exit 1)

**Status:** ✅ Mitigated

### R2: Schema Drift

**Risk:** Doctor's validation diverges from official schemas.

**Severity:** HIGH
**Likelihood:** LOW
**Impact:** False positives/negatives

**Mitigation:**

- Vendored schemas are byte-exact copies (`packages/parser/src/schemas/`)
- Automated tests verify schema conformance
- Regular sync with upstream (when spec updates)

**Status:** ✅ Mitigated

### R3: Security Vulnerabilities

**Risk:** Doctor itself has security vulnerabilities.

**Severity:** CRITICAL
**Likelihood:** LOW
**Impact:** Compromised validation, potential code execution

**Mitigation:**

- Path containment enforcement (security boundary — `resolvePluginPath`,
  symlink escape detection; ADR-005)
- No code execution during validation (parse-only, no eval/dynamic imports)
- Secret redaction in output (DOC-4003)
- Treat all plugin content as untrusted
- Bounded filesystem traversal (1000 files / 10 levels, skips `.git`,
  `node_modules`, hidden entries)
- Regular security audits

**Status:** ✅ Mitigated

### R4: Performance Degradation

**Risk:** Large plugins cause slow validation.

**Severity:** MEDIUM
**Likelihood:** LOW
**Impact:** Poor user experience

**Mitigation:**

- Parser caching (path + mtime + size — `ParsedFileCache`)
- Bounded filesystem traversal (max 1000 files)
- Incremental validation mode (`validateIncremental`)
- Performance benchmarks in CI (`tests/benchmarks/`)

**Status:** ✅ Mitigated

### R5: False Positives

**Risk:** Doctor reports errors for valid plugins.

**Severity:** HIGH
**Likelihood:** MEDIUM
**Impact:** User frustration, loss of trust

**Mitigation:**

- Comprehensive test suite (483 tests across 65 files)
- Fixture library with valid plugins (15 fixtures, each with a README)
- Self-hosting test (Doctor validates itself, `check .` exits 0)
- Builder compatibility tests (`tests/fixtures/builder-generated/`)
- Conservative secret detection to avoid placeholder false positives

**Status:** ✅ Mitigated

### R6: False Negatives

**Risk:** Doctor misses real errors.

**Severity:** HIGH
**Likelihood:** LOW
**Impact:** Invalid plugins pass validation

**Mitigation:**

- 30 rules across 7 categories
- Security-focused rules (DOC-4xxx)
- Regular rule additions
- Community feedback

**Status:** ✅ Mitigated

## Integration Risks

### R7: Builder Integration Failure

**Risk:** Builder fails to integrate with Doctor.

**Severity:** MEDIUM
**Likelihood:** LOW
**Impact:** Duplication continues, inconsistency

**Mitigation:**

- Clear integration contract ([docs/BUILDER_INTEGRATION.md](BUILDER_INTEGRATION.md))
- Programmatic API examples (`examples/builder-integration/`)
- Builder-generated fixture tests
- Stable public API (pinned by `tests/integration/api-stability.test.ts`)

**Status:** ✅ Mitigated

### R8: API Breaking Changes

**Risk:** Doctor's public API changes, breaking consumers.

**Severity:** HIGH
**Likelihood:** LOW
**Impact:** Builder and other consumers break

**Mitigation:**

- Semantic versioning
- API stability tests (`tests/integration/api-stability.test.ts`)
- Deprecation warnings before breaking changes
- Comprehensive SDK documentation ([docs/SDK.md](SDK.md))

**Status:** ✅ Mitigated

## Operational Risks

### R9: Maintenance Burden

**Risk:** Project becomes too complex to maintain.

**Severity:** MEDIUM
**Likelihood:** LOW
**Impact:** Slow development, bugs

**Mitigation:**

- Clean architecture (6 packages, dependency graph `cli → rules → parser → core`)
- Comprehensive documentation
- Automated testing (483 tests)
- Clear contribution guidelines (CONTRIBUTING.md)

**Status:** ✅ Mitigated

### R10: Documentation Drift

**Risk:** Documentation becomes outdated.

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Impact:** Confusion, incorrect usage

**Mitigation:**

- Documentation in code (JSDoc)
- Automated doc generation where possible
- PR checklist includes doc updates (AGENTS.md quality gates)
- Regular doc reviews
- The 12 Phase 20 deliverables include a repository audit that tracks this
  ([docs/REPOSITORY_AUDIT.md](REPOSITORY_AUDIT.md))

**Status:** ⚠️ Partially mitigated (requires ongoing attention)

## External Risks

### R11: Client Compatibility Changes

**Risk:** Clients change their Agent Plugins support.

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Impact:** Incorrect compatibility reports

**Mitigation:**

- Evidence-leveled compatibility data
- Regular verification of client support
- Clear documentation of evidence sources ([docs/COMPATIBILITY.md](COMPATIBILITY.md))
- Community reporting of changes

**Status:** ✅ Mitigated

### R12: Ecosystem Fragmentation

**Risk:** Multiple validation tools emerge, causing confusion.

**Severity:** LOW
**Likelihood:** LOW
**Impact:** Users don't know which tool to use

**Mitigation:**

- Doctor is the canonical validation tool
- Builder integration establishes Doctor as standard
- Clear positioning in README
- Community engagement

**Status:** ✅ Mitigated

## Risk Matrix

| Risk                    | Severity | Likelihood | Impact   | Status       |
| ----------------------- | -------- | ---------- | -------- | ------------ |
| R1: Spec changes        | HIGH     | MEDIUM     | HIGH     | ✅ Mitigated |
| R2: Schema drift        | HIGH     | LOW        | HIGH     | ✅ Mitigated |
| R3: Security vulns      | CRITICAL | LOW        | CRITICAL | ✅ Mitigated |
| R4: Performance         | MEDIUM   | LOW        | MEDIUM   | ✅ Mitigated |
| R5: False positives     | HIGH     | MEDIUM     | HIGH     | ✅ Mitigated |
| R6: False negatives     | HIGH     | LOW        | HIGH     | ✅ Mitigated |
| R7: Builder integration | MEDIUM   | LOW        | MEDIUM   | ✅ Mitigated |
| R8: API breaking        | HIGH     | LOW        | HIGH     | ✅ Mitigated |
| R9: Maintenance         | MEDIUM   | LOW        | MEDIUM   | ✅ Mitigated |
| R10: Doc drift          | MEDIUM   | MEDIUM     | MEDIUM   | ⚠️ Partial   |
| R11: Client changes     | MEDIUM   | MEDIUM     | MEDIUM   | ✅ Mitigated |
| R12: Fragmentation      | LOW      | LOW        | LOW      | ✅ Mitigated |

## Conclusion

> **Historical record.** This risk register was written for the pre-release
> v0.1.0 plan (2026-08-07); Doctor was released as **0.0.6** (see
> [CHANGELOG.md](../CHANGELOG.md)).

Agent Plugin Doctor has comprehensive risk mitigation in place. The most
critical risks (security, schema drift, false positives) are well-mitigated
through architecture, testing, and documentation. Ongoing attention is needed
for documentation drift and client compatibility changes.

The project is in a strong position for v0.1.0 release and future development.
