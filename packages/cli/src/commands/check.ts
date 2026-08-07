// check command: validate an Agent Plugin and exit with the derived code.

import { Command } from 'commander';
import type { ValidationResult } from '@agent-plugins-doctor/core';
import { generateReport } from '@agent-plugins-doctor/report';
import { computeExitCode } from '../utils/exit-codes.js';
import { isNoColor, setColorEnabled } from '../utils/output.js';
import {
  handleCommandError,
  loadAndValidate,
  splitList,
} from '../utils/run.js';

export const checkCommand = new Command('check')
  .description('Validate an Agent Plugin')
  .argument('[dir]', 'Plugin directory', '.')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown')
  .option('--no-color', 'Disable colors')
  .option('--verbose', 'Show detailed output')
  .option('--strict', 'Treat warnings as errors')
  .option('--rule <id>', 'Run only specific rules (comma-separated)')
  .option('--exclude-rule <id>', 'Exclude specific rules (comma-separated)')
  .action(async (dir, options) => {
    const noColor = isNoColor(options.color);
    setColorEnabled(!noColor);
    try {
      const result = await runCheck(dir, options, noColor);
      process.exitCode = result;
    } catch (cause) {
      // Parse errors are diagnostics in result.diagnostics, not exceptions, so
      // this only catches true tool failures (inaccessible root, etc.).
      handleCommandError(cause);
    }
  });

/**
 * Run the check pipeline and return the exit code.
 * Exported separately so tests can drive the pipeline directly.
 */
export async function runCheck(
  dir: string,
  options: {
    json?: boolean;
    markdown?: boolean;
    verbose?: boolean;
    strict?: boolean;
    rule?: string;
    excludeRule?: string;
  },
  noColor: boolean,
): Promise<number> {
  const result: ValidationResult = await loadAndValidate(dir, {
    strict: options.strict === true,
    rules: splitList(options.rule),
    excludeRules: splitList(options.excludeRule),
  });

  const format = options.json
    ? 'json'
    : options.markdown
      ? 'markdown'
      : 'human';
  const report = generateReport(result, {
    format,
    verbose: options.verbose === true,
    noColor,
  });
  process.stdout.write(report);

  return computeExitCode(result.diagnostics, {
    strict: options.strict === true,
  });
}
