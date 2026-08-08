// @agent-plugins-doctor/cli
// The agent-plugins-doctor command-line tool: a thin wrapper around the core,
// parser, rules, compatibility, and report packages.

import { Command } from 'commander';
import { checkCommand } from './commands/check.js';
import { fixCommand } from './commands/fix.js';
import { reportCommand } from './commands/report.js';
import { compatibilityCommand } from './commands/compatibility.js';

// Public exit-code contract: Builder and other programmatic consumers derive
// process exit codes from validation diagnostics the same way the CLI does
// (0=valid, 1=spec errors, 2=security-critical, 3=tool failure).
export {
  EXIT_CODES,
  computeExitCode,
  type ExitCode,
  type ExitCodeOptions,
} from './utils/exit-codes.js';

/**
 * Build a fresh program. Tests create a new instance per run so option state
 * never leaks between invocations; the exported `program` singleton is used
 * by the bin.
 */
export function createProgram(): Command {
  return new Command()
    .name('agent-plugins-doctor')
    .description('Diagnose and fix Agent Plugins')
    .version('0.0.4')
    .addCommand(checkCommand)
    .addCommand(fixCommand)
    .addCommand(reportCommand)
    .addCommand(compatibilityCommand);
}

export const program = createProgram();

/**
 * Parse and run the CLI. parseAsync (not parse) is used so the process exit
 * code is set after the async action handlers complete.
 */
export async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}
