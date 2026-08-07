// Human-readable terminal report formatter.
//
// Output is grouped by file (files with the most severe diagnostics first,
// then alphabetically), with each diagnostic printed as:
//
//   ERROR DOC-1002
//   plugin.json:3
//   Plugin name does not match the required pattern.

import chalk, {
  Chalk,
  type ChalkInstance,
  type ColorSupportLevel,
} from 'chalk';
import type {
  CompatibilityLevel,
  CompatibilityResult,
  Diagnostic,
  Severity,
  ValidationResult,
} from '@agent-plugins-doctor/core';
import type { ReportFormatter, ReportOptions } from './types.js';
import {
  normalizeFilePath,
  pluralize,
  SEVERITY_ORDER,
  sortDiagnostics,
  worstSeverityRank,
  wrapText,
} from './util.js';

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

/** Fixed labels for the summary section (plural even for a count of 1). */
const SUMMARY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
};

const NO_FILE = '(no file)';

/**
 * Resolve a Chalk instance for this formatter. `noColor` disables styling;
 * otherwise chalk's standard FORCE_COLOR / NO_COLOR overrides are honored at
 * construction time so output is deterministic regardless of TTY state.
 */
function resolveChalk(noColor?: boolean): ChalkInstance {
  if (noColor) return new Chalk({ level: 0 });
  const forced = process.env.FORCE_COLOR;
  if (forced !== undefined && forced !== '') {
    const parsed = Number.parseInt(forced, 10);
    const level = (
      Number.isNaN(parsed) ? 1 : Math.min(Math.max(parsed, 0), 3)
    ) as ColorSupportLevel;
    return new Chalk({ level });
  }
  if (process.env.NO_COLOR !== undefined) return new Chalk({ level: 0 });
  return chalk;
}

export class HumanReportFormatter implements ReportFormatter {
  private readonly c: ChalkInstance;
  private readonly verbose: boolean;

  constructor(options: ReportOptions = { format: 'human' }) {
    this.c = resolveChalk(options.noColor);
    this.verbose = options.verbose === true;
  }

  format(result: ValidationResult): string {
    const sections: string[] = [
      this.formatHeader(result),
      this.formatDiagnostics(result.diagnostics),
      this.formatSummary(result),
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
    const lines: string[] = [
      this.c.bold('Agent Plugin Doctor'),
      '',
      `Plugin: ${name}`,
      `Spec: Agent Plugins ${result.specVersion || 'unknown'}`,
      '',
    ];
    const total = this.totalCount(result);
    if (total === 0) {
      lines.push(this.c.bold('Result: No issues found'));
    } else {
      lines.push(
        this.c.bold('Result: ') + this.resultSummaryParts(result).join(', '),
      );
    }
    return lines.join('\n');
  }

  /** "2 errors, 1 warning, 1 info" with severity words colored. */
  private resultSummaryParts(result: ValidationResult): string[] {
    const parts: string[] = [];
    for (const severity of SEVERITY_ORDER) {
      const count = result.summary.counts[severity];
      if (count > 0) {
        const label = pluralize(count, SEVERITY_LABELS[severity].toLowerCase());
        parts.push(`${count} ${this.colorSeverity(severity)(label)}`);
      }
    }
    return parts;
  }

  private formatDiagnostics(diagnostics: Diagnostic[]): string {
    return this.groupByFile(diagnostics)
      .map(({ diagnostics: group }) =>
        group
          .map((diagnostic) => this.formatDiagnostic(diagnostic))
          .join('\n\n'),
      )
      .join('\n\n');
  }

  private formatDiagnostic(diagnostic: Diagnostic): string {
    const severity = this.colorSeverity(diagnostic.severity)(
      diagnostic.severity.toUpperCase(),
    );
    const lines = [`${severity} ${this.c.dim(diagnostic.code)}`];
    const file = normalizeFilePath(diagnostic.file);
    if (file !== null) {
      const location =
        diagnostic.range === undefined
          ? file
          : `${file}:${diagnostic.range.start.line}`;
      lines.push(this.c.dim(location));
    } else {
      lines.push(this.c.dim(NO_FILE));
    }
    lines.push(wrapText(diagnostic.message));
    if (this.verbose) {
      lines.push(
        this.c.dim(`Rule: ${diagnostic.ruleId} (${diagnostic.category})`),
      );
    }
    return lines.join('\n');
  }

  private formatSummary(result: ValidationResult): string {
    const entries: string[] = [];
    for (const severity of SEVERITY_ORDER) {
      const count = result.summary.counts[severity];
      if (count > 0) entries.push(`  ${SUMMARY_LABELS[severity]}: ${count}`);
    }
    if (entries.length === 0) return '';
    return ['Summary:', ...entries].join('\n');
  }

  private formatCompatibility(compatibility: CompatibilityResult[]): string {
    const lines = ['Compatibility:'];
    for (const entry of compatibility) {
      const symbol = this.compatibilitySymbol(entry.level);
      const suffix = entry.level === 'full' ? '' : ` (${entry.level})`;
      lines.push(`  ${entry.clientName}: ${symbol}${suffix}`);
      if (entry.level !== 'full') {
        if (entry.unsupported.length > 0) {
          lines.push(`    Unsupported: ${entry.unsupported.join(', ')}`);
        }
        for (const issue of entry.issues) {
          lines.push(`    ${issue}`);
        }
      }
    }
    return lines.join('\n');
  }

  /** Level-aware status symbol: ✓ full, ~ partial, ✗ unsupported, ? unknown. */
  private compatibilitySymbol(level: CompatibilityLevel): string {
    switch (level) {
      case 'full':
        return this.c.green('✓');
      case 'partial':
        return this.c.yellow('~');
      case 'unsupported':
        return this.c.red('✗');
      case 'unknown':
        return this.c.dim('?');
    }
  }

  private formatFixes(result: ValidationResult): string {
    const count = result.diagnostics.filter(
      (diagnostic) => diagnostic.fix !== undefined,
    ).length;
    const lines = [this.c.bold(`Fixes available: ${count}`)];
    if (count > 0) {
      lines.push(this.c.dim('Run with --fix to apply safe fixes.'));
    }
    return lines.join('\n');
  }

  private colorSeverity(severity: Severity): (text: string) => string {
    switch (severity) {
      case 'critical':
      case 'error':
        return this.c.red.bold;
      case 'warning':
        return this.c.yellow.bold;
      case 'info':
        return this.c.blue.bold;
    }
  }

  /**
   * Group diagnostics by file. Groups are ordered by their worst severity
   * (most severe first), then alphabetically by file.
   */
  private groupByFile(
    diagnostics: Diagnostic[],
  ): { file: string; diagnostics: Diagnostic[] }[] {
    const groups = new Map<string, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
      const file = normalizeFilePath(diagnostic.file) ?? NO_FILE;
      const list = groups.get(file) ?? [];
      list.push(diagnostic);
      groups.set(file, list);
    }
    return [...groups.entries()]
      .map(([file, list]) => ({ file, diagnostics: sortDiagnostics(list) }))
      .sort((a, b) => {
        const rank =
          worstSeverityRank(b.diagnostics) - worstSeverityRank(a.diagnostics);
        if (rank !== 0) return rank;
        return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
      });
  }

  private totalCount(result: ValidationResult): number {
    return (
      result.summary.counts.error +
      result.summary.counts.warning +
      result.summary.counts.info +
      result.summary.counts.critical
    );
  }
}
