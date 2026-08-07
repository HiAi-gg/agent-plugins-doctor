// GitHub-flavored Markdown report formatter.
//
// Suitable for pasting into issues/PRs: summary table, diagnostics grouped by
// severity, and a compatibility matrix. Severity groups with more than
// COLLAPSIBLE_THRESHOLD diagnostics are wrapped in <details> elements.

import type {
  CompatibilityLevel,
  CompatibilityResult,
  Diagnostic,
  Severity,
  ValidationResult,
} from '@agent-plugins-doctor/core';
import type { ReportFormatter } from './types.js';
import {
  normalizeFilePath,
  SEVERITY_ORDER,
  sortDiagnostics,
  titleFromRuleId,
} from './util.js';

const COLLAPSIBLE_THRESHOLD = 5;

/** Singular labels for the summary table (matches the spec example). */
const TABLE_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

/** Plural labels for severity section headings. */
const HEADING_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
};

export class MarkdownReportFormatter implements ReportFormatter {
  format(result: ValidationResult): string {
    const sections: string[] = [
      this.formatHeader(result),
      this.formatSummary(result),
      this.formatDiagnostics(result.diagnostics),
    ];
    if (result.compatibility.length > 0) {
      sections.push(this.formatCompatibility(result.compatibility));
    }
    sections.push(this.formatFixes(result));
    return sections.filter((section) => section.length > 0).join('\n\n') + '\n';
  }

  private formatHeader(result: ValidationResult): string {
    const name =
      result.plugin === null ? '(unavailable)' : result.plugin.manifest.name;
    return [
      '# Agent Plugin Doctor Report',
      '',
      '## Plugin',
      `- **Name:** ${name}`,
      `- **Spec Version:** ${result.specVersion || 'unknown'}`,
    ].join('\n');
  }

  private formatSummary(result: ValidationResult): string {
    const rows: string[] = [];
    for (const severity of SEVERITY_ORDER) {
      const count = result.summary.counts[severity];
      if (count > 0) rows.push(`| ${TABLE_LABELS[severity]} | ${count} |`);
    }
    if (rows.length === 0) return '';
    return [
      '## Summary',
      '| Severity | Count |',
      '|----------|-------|',
      ...rows,
    ].join('\n');
  }

  private formatDiagnostics(diagnostics: Diagnostic[]): string {
    if (diagnostics.length === 0) return '';
    const sections = this.groupBySeverity(diagnostics).map(([severity, list]) =>
      this.formatSeverityGroup(severity, list),
    );
    return ['## Diagnostics', '', sections.join('\n\n')].join('\n');
  }

  private formatSeverityGroup(
    severity: Severity,
    diagnostics: Diagnostic[],
  ): string {
    const title = HEADING_LABELS[severity];
    const items = diagnostics
      .map((diagnostic) => this.formatDiagnostic(diagnostic))
      .join('\n\n');
    if (diagnostics.length <= COLLAPSIBLE_THRESHOLD) {
      return `### ${title}\n\n${items}`;
    }
    return [
      '<details>',
      `<summary>${title} (${diagnostics.length})</summary>`,
      '',
      items,
      '',
      '</details>',
    ].join('\n');
  }

  private formatDiagnostic(diagnostic: Diagnostic): string {
    const title = titleFromRuleId(diagnostic.ruleId);
    const file = normalizeFilePath(diagnostic.file);
    const location =
      file === null
        ? '(no file)'
        : diagnostic.range === undefined
          ? file
          : `${file}:${diagnostic.range.start.line}`;
    return [
      `#### ${diagnostic.code}: ${title}`,
      `**File:** ${location}`,
      '',
      diagnostic.message,
    ].join('\n');
  }

  private formatCompatibility(compatibility: CompatibilityResult[]): string {
    const rows = compatibility.map((entry) => {
      const status = this.statusLabel(entry.level);
      return `| ${entry.clientName} | ${status} |`;
    });
    return [
      '## Compatibility',
      '',
      '| Client | Status |',
      '|--------|--------|',
      ...rows,
    ].join('\n');
  }

  /** Level-aware status label for the compatibility matrix. */
  private statusLabel(level: CompatibilityLevel): string {
    switch (level) {
      case 'full':
        return '✓ Compatible';
      case 'partial':
        return '~ Partial';
      case 'unsupported':
        return '✗ Unsupported';
      case 'unknown':
        return '? Unknown';
    }
  }

  private formatFixes(result: ValidationResult): string {
    const count = result.diagnostics.filter(
      (diagnostic) => diagnostic.fix !== undefined,
    ).length;
    if (count === 0) return '## Fixes\nNo fixes available.';
    const available =
      count === 1 ? '1 fix available.' : `${count} fixes available.`;
    return [
      '## Fixes',
      `${available} Run \`agent-plugins-doctor fix\` to apply.`,
    ].join('\n');
  }

  /** Group diagnostics by severity, ordered most severe first. */
  private groupBySeverity(
    diagnostics: Diagnostic[],
  ): [Severity, Diagnostic[]][] {
    const groups = new Map<Severity, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
      const list = groups.get(diagnostic.severity) ?? [];
      list.push(diagnostic);
      groups.set(diagnostic.severity, list);
    }
    const result: [Severity, Diagnostic[]][] = [];
    for (const severity of SEVERITY_ORDER) {
      const list = groups.get(severity);
      if (list !== undefined) result.push([severity, sortDiagnostics(list)]);
    }
    return result;
  }
}
