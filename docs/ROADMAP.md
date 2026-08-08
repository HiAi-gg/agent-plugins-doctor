# Implementation Roadmap

> **Historical record (2026-08-07).** This roadmap reflects the pre-release
> v0.1.0 planning state. Doctor was released as **0.0.6** (see
> [CHANGELOG.md](../CHANGELOG.md) and [RELEASING.md](RELEASING.md)); the
> phase-by-phase history below is kept intact for reference.

## Current Status

**Version:** 0.1.0 (Ready for release)
**Date:** 2026-08-07
**Status:** All Phase 0-17 complete, Phase 18 deliverables complete

## Completed Phases

### Phase 0: Research ✅

- Agent Plugins specification researched
- Builder repository reviewed
- Integration points identified

### Phase 1: Architecture ✅

- Architecture Decision Records created (docs/ARCHITECTURE.md)
- Product boundaries defined (ADR-002)
- Duplication analysis completed (docs/DUPLICATION_ANALYSIS.md)

### Phase 2: Repository Setup ✅

- Monorepo scaffold created
- 6 packages initialized
- CI/CD configured (3-OS matrix)

### Phase 3: Core Package ✅

- Domain types implemented
- Spec constants defined (v1.0.0)
- Path utilities implemented (security boundary)
- 87 tests passing

### Phase 4: Parser Package ✅

- plugin.json parser
- mcp.json parser
- SKILL.md frontmatter parser (gray-matter based)
- Plugin loader with per-component failure isolation
- ParsedFileCache + bounded traversal
- 63 tests passing

### Phase 5: Rules Package ✅

- Validation engine
- 30 rules across 7 categories
- Auto-fix engine (idempotent `applyFixes`)
- Incremental validation (`validateIncremental`)
- 178 tests passing

### Phase 6: Compatibility Package ✅

- Client profile registry
- 5 verified clients
- Compatibility checker
- 21 tests passing

### Phase 7: Report Package ✅

- Human report formatter
- JSON report formatter
- Markdown report formatter
- 29 tests passing

### Phase 8: CLI Package ✅

- check command
- fix command
- report command
- compatibility command
- Exit-code contract (0/1/2/3)
- 37 tests passing

### Phase 9: Fixture Library ✅

- 15 test fixtures (valid, invalid, edge cases, security, vendor extensions,
  builder-generated, legacy, future-spec, complex, minimal, warning)
- All fixtures verified
- README for each fixture

### Phase 10-11: Integration & Self-Hosting ✅

- Cross-package integration tests (40 passing)
- E2E CLI tests (23 passing)
- Self-hosting (Doctor validates itself)
- API stability tests

### Phase 12-13: Builder Integration ✅

- Builder integration contract (docs/BUILDER_INTEGRATION.md)
- Builder-generated fixtures (`tests/fixtures/builder-generated/`)
- Integration contract tests (`builder-contract.test.ts`)
- API stability tests (`api-stability.test.ts`)

### Phase 14-15: Documentation & Standards ✅

- README, AGENTS.md, CHANGELOG
- SDK, DIAGNOSTICS, RULES, COMPATIBILITY, SPEC_SUPPORT, EXTENSIBILITY docs
- LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT
- GitHub templates (issue + PR)

### Phase 16-17: Performance & Release ✅

- Parser caching (path + mtime + size)
- Bounded traversal (1000 files / 10 levels)
- Incremental validation
- Performance benchmarks (budgets enforced in CI)
- Release preparation

### Phase 18: Deliverables ✅

- All 12 Phase 20 deliverables complete:
  1. Builder review (research phase)
  2. Architecture review (docs/ARCHITECTURE.md)
  3. Public SDK proposal (docs/SDK.md)
  4. Package layout proposal (docs/ARCHITECTURE.md)
  5. Diagnostic specification (docs/DIAGNOSTICS.md)
  6. Compatibility model (docs/COMPATIBILITY.md)
  7. Migration strategy (docs/BUILDER_INTEGRATION.md)
  8. Duplication analysis (docs/DUPLICATION_ANALYSIS.md)
  9. Rule engine design (docs/RULE_ENGINE.md)
  10. Risk assessment (docs/RISK_ASSESSMENT.md)
  11. Repository quality audit (docs/REPOSITORY_AUDIT.md)
  12. Updated implementation roadmap (this document)

## v0.1.0 Release Checklist

- [x] All tests pass (484 tests across 65 files)
- [x] Type check passes
- [x] Lint passes
- [x] Prettier passes
- [x] Self-hosting passes (`check .` exits 0)
- [x] Documentation complete (14 docs + README/AGENTS)
- [x] CHANGELOG updated
- [x] Version set to 0.1.0
- [ ] npm publication (pending)
- [ ] Git tag creation (pending)
- [ ] GitHub release (pending)

## Future Roadmap

### v0.2.0 (Planned)

- Additional validation rules based on community feedback
- SARIF report format for GitHub code scanning
- GitHub Action for automated validation
- More client profiles as they adopt Agent Plugins

### v0.3.0 (Planned)

- Runtime MCP health checks (opt-in)
- Plugin provenance checks
- Signed release verification
- Dependency/SBOM analysis

### v1.0.0 (Planned)

- Stable API guarantee
- Long-term support
- Comprehensive client compatibility database
- Performance optimizations for very large plugins

### Beyond v1.0.0

- Registry-wide scans
- Remote repository audit
- Marketplace quality scoring
- Historical compatibility tracking
- Plugin analytics

## Builder Integration Roadmap

### Phase 1: Doctor Independent ✅

- Doctor built as standalone monorepo
- All validation logic implemented
- Public API stable (pinned by api-stability tests)

### Phase 2: Doctor Published (Pending)

- Publish to npm
- Semantic versioning
- Public API documented (docs/SDK.md)

### Phase 3: Builder Depends on Doctor (Pending)

- Builder adds Doctor as dependency
- No behavior change yet

### Phase 4: Builder Replaces Validation (Pending)

- Builder's `package` command calls Doctor
- Frontmatter parsing switches to Doctor (`parseSkillFrontmatter`)

### Phase 5: Builder Removes Duplication (Pending)

- Delete Builder's regex parsers (6 files)
- Delete Builder's inline validation code
- Import Doctor's types and patterns

### Phase 6: CI Contract (Pending)

- Builder CI validates with Doctor
- Zero false positives guaranteed
- Shared fixture library

## Community Roadmap

### Contribution Guidelines

- See CONTRIBUTING.md
- Welcome contributions
- Clear process for adding rules (docs/RULE_ENGINE.md)
- Clear process for adding client profiles (docs/EXTENSIBILITY.md)

### Communication

- GitHub Issues for bugs
- GitHub Discussions for questions
- Regular releases with CHANGELOG

### Ecosystem Growth

- Doctor as canonical validation tool
- Builder as canonical generation tool
- Shared foundation for future tools
- Strong community adoption

## Success Metrics

### Technical

- ✅ 484 tests passing (65 files)
- ✅ < 2000ms for 100-skill plugin (measured ~14ms)
- ✅ Zero false positives on valid plugins
- ✅ Self-hosting passes

### Adoption

- [ ] npm downloads (track after publication)
- [ ] GitHub stars
- [ ] Builder integration
- [ ] Community contributions

### Quality

- ✅ Comprehensive documentation
- ✅ Clear architecture
- ✅ Strong security model
- ✅ Performance benchmarks

## Conclusion

Agent Plugin Doctor v0.1.0 is complete and ready for release. All 18 phases of
implementation are done, all 12 Phase 20 deliverables are complete, and the
project meets all quality gates.

The future roadmap focuses on community adoption, additional features based on
feedback, and deeper integration with the Agent Plugins ecosystem through
Builder and other tools.
