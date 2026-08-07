// Report types for @agent-plugins-doctor/report

import type { ValidationResult } from '@agent-plugins-doctor/core';

export type ReportFormat = 'human' | 'json' | 'markdown';

export interface ReportOptions {
  format: ReportFormat;
  verbose?: boolean;
  noColor?: boolean;
}

export interface ReportFormatter {
  format(result: ValidationResult): string;
}
