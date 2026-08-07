// Machine-readable JSON report formatter.
//
// Output is a single JSON document with stable field ordering (key insertion
// order is preserved by JSON.stringify) so diffs between runs are meaningful.

import type {
  CompatibilityResult,
  Diagnostic,
  Fix,
  RuleCategory,
  Severity,
  ValidationResult,
} from '@agent-plugins-doctor/core';
import type { ReportFormatter } from './types.js';
import { normalizeFilePath } from './util.js';

const CATEGORY_KEYS = [
  'spec',
  'skills',
  'mcp',
  'security',
  'structure',
  'compatibility',
  'format',
] as const;

export class JsonReportFormatter implements ReportFormatter {
  format(result: ValidationResult): string {
    const data = {
      plugin: {
        name: result.plugin === null ? null : result.plugin.manifest.name,
        specVersion: result.specVersion,
      },
      diagnostics: result.diagnostics.map(serializeDiagnostic),
      summary: {
        counts: orderCounts(result.summary.counts),
        byCategory: orderCategories(result.summary.byCategory),
      },
      compatibility: result.compatibility.map(serializeCompatibility),
      fixesAvailable: result.diagnostics.filter(
        (diagnostic) => diagnostic.fix !== undefined,
      ).length,
      compatible: result.compatible,
      elapsedMs: result.elapsedMs,
    };
    return JSON.stringify(data, null, 2) + '\n';
  }
}

function serializeDiagnostic(diagnostic: Diagnostic) {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ruleId: diagnostic.ruleId,
    category: diagnostic.category,
    file: normalizeFilePath(diagnostic.file),
    range: diagnostic.range
      ? {
          start: { ...diagnostic.range.start },
          end: { ...diagnostic.range.end },
        }
      : null,
    fix: diagnostic.fix ? serializeFix(diagnostic.fix) : null,
  };
}

function serializeFix(fix: Fix) {
  return {
    kind: fix.kind,
    file: normalizeFilePath(fix.file) ?? fix.file,
    description: fix.description,
    ...(fix.oldText !== undefined ? { oldText: fix.oldText } : {}),
    ...(fix.newText !== undefined ? { newText: fix.newText } : {}),
    ...(fix.oldPath !== undefined ? { oldPath: fix.oldPath } : {}),
    ...(fix.newPath !== undefined ? { newPath: fix.newPath } : {}),
  };
}

function serializeCompatibility(entry: CompatibilityResult) {
  return {
    clientId: entry.clientId,
    clientName: entry.clientName,
    level: entry.level,
    compatible: entry.compatible,
    working: entry.working,
    unsupported: entry.unsupported,
    issues: entry.issues,
    evidence: entry.evidence,
  };
}

/** Fixed severity key order: error, warning, info, critical. */
function orderCounts(
  counts: Record<Severity, number>,
): Record<Severity, number> {
  return {
    error: counts.error,
    warning: counts.warning,
    info: counts.info,
    critical: counts.critical,
  };
}

/** Category counts with zero categories omitted, in fixed key order. */
function orderCategories(
  byCategory: Record<RuleCategory, number>,
): Partial<Record<RuleCategory, number>> {
  const ordered: Partial<Record<RuleCategory, number>> = {};
  for (const category of CATEGORY_KEYS) {
    if (byCategory[category] > 0) ordered[category] = byCategory[category];
  }
  return ordered;
}
