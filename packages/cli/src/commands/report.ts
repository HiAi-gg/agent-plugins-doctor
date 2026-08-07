// report command: generate a detailed report for an Agent Plugin.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import type { ReportFormat } from '@agent-plugins-doctor/report';
import { generateReport } from '@agent-plugins-doctor/report';
import { EXIT_CODES, computeExitCode } from '../utils/exit-codes.js';
import { error, info, isNoColor, setColorEnabled } from '../utils/output.js';
import { handleCommandError, loadAndValidate } from '../utils/run.js';

const FORMATS: readonly ReportFormat[] = ['human', 'json', 'markdown'];

export const reportCommand = new Command('report')
  .description('Generate a detailed report for an Agent Plugin')
  .argument('[dir]', 'Plugin directory', '.')
  .option('--format <format>', 'Report format (human|json|markdown)', 'human')
  .option('--output <file>', 'Write report to file')
  .option('--no-color', 'Disable colors')
  .option('--verbose', 'Show detailed output')
  .action(async (dir, options) => {
    const noColor = isNoColor(options.color);
    setColorEnabled(!noColor);
    if (!FORMATS.includes(options.format)) {
      error(
        `Unknown report format "${options.format}" (expected ${FORMATS.join(', ')})`,
      );
      process.exitCode = EXIT_CODES.TOOL_FAILURE;
      return;
    }
    try {
      const exitCode = await runReport(dir, options, noColor);
      process.exitCode = exitCode;
    } catch (cause) {
      handleCommandError(cause);
    }
  });

/**
 * Run the report pipeline and return the exit code.
 * Exported separately so tests can drive the pipeline directly.
 */
export async function runReport(
  dir: string,
  options: {
    format?: ReportFormat;
    output?: string;
    verbose?: boolean;
  },
  noColor: boolean,
): Promise<number> {
  const result = await loadAndValidate(dir);
  const format = options.format ?? 'human';
  const report = generateReport(result, {
    format,
    verbose: options.verbose === true,
    noColor,
  });

  if (options.output !== undefined) {
    const outputPath = resolve(options.output);
    writeFileSync(outputPath, report, 'utf8');
    info(`Report written to ${options.output}`);
  } else {
    process.stdout.write(report);
  }

  return computeExitCode(result.diagnostics);
}
