// @agent-plugin-doctor/report
// Formatted reports (human / JSON / Markdown) from validation results.

import type { ValidationResult } from '@agent-plugin-doctor/core';
import type { ReportFormat, ReportFormatter, ReportOptions } from './types.js';
import { HumanReportFormatter } from './human.js';
import { JsonReportFormatter } from './json.js';
import { MarkdownReportFormatter } from './markdown.js';

export function generateReport(
  result: ValidationResult,
  options: ReportOptions,
): string {
  const formatter = getFormatter(options.format, options);
  return formatter.format(result);
}

export function getFormatter(
  format: ReportFormat,
  options?: ReportOptions,
): ReportFormatter {
  switch (format) {
    case 'human':
      return new HumanReportFormatter(options);
    case 'json':
      return new JsonReportFormatter();
    case 'markdown':
      return new MarkdownReportFormatter();
    default:
      throw new Error(`Unknown report format: ${format}`);
  }
}

export * from './types.js';
export * from './human.js';
export * from './json.js';
export * from './markdown.js';
