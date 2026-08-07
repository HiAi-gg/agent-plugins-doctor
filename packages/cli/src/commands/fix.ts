// fix command: apply safe fixes to an Agent Plugin, then re-validate.
//
// Every fix produced by the rules engine is safe by construction: fixes are
// text-based, idempotent, and the fix engine rejects paths that escape the
// plugin root. Security rules never produce fixes, so nothing destructive is
// ever applied.

import { Command } from 'commander';
import { createInterface } from 'node:readline';
import type { Diagnostic } from '@agent-plugins-doctor/core';
import { scanPlugin } from '@agent-plugins-doctor/parser';
import {
  applyFixes,
  type AppliedFix,
  validatePlugin,
} from '@agent-plugins-doctor/rules';
import { EXIT_CODES, computeExitCode } from '../utils/exit-codes.js';
import {
  error,
  info,
  isNoColor,
  setColorEnabled,
  success,
  warning,
} from '../utils/output.js';
import {
  handleCommandError,
  loadAndValidate,
  resolvePluginDir,
} from '../utils/run.js';

export const fixCommand = new Command('fix')
  .description('Apply safe fixes to an Agent Plugin')
  .argument('[dir]', 'Plugin directory', '.')
  .option('--dry-run', 'Show what would be fixed without applying')
  .option('--yes', 'Apply fixes without confirmation')
  .option('--json', 'Output as JSON')
  .option('--no-color', 'Disable colors')
  .action(async (dir, options) => {
    const noColor = isNoColor(options.color);
    setColorEnabled(!noColor);
    try {
      const exitCode = await runFix(dir, options);
      process.exitCode = exitCode;
    } catch (cause) {
      handleCommandError(cause);
    }
  });

/**
 * Run the fix pipeline and return the exit code.
 * Exported separately so tests can drive the pipeline directly.
 */
export async function runFix(
  dir: string,
  options: {
    dryRun?: boolean;
    yes?: boolean;
    json?: boolean;
  },
): Promise<number> {
  const pluginDir = resolvePluginDir(dir);
  const initial = await loadAndValidate(pluginDir);
  // loadAndValidate uses scanPlugin: when the manifest could not be loaded the
  // plugin is null, so the name falls back to a placeholder.
  const pluginName = initial.plugin?.manifest.name ?? 'unknown';
  const fixable = initial.diagnostics.filter(
    (diagnostic) => diagnostic.fix !== undefined,
  );

  // Nothing to fix: report and exit reflecting the plugin's current state.
  if (fixable.length === 0) {
    if (options.json === true) {
      process.stdout.write(
        JSON.stringify(
          {
            plugin: pluginName,
            dryRun: options.dryRun === true,
            applied: 0,
            failed: 0,
            fixes: [],
            remaining: {
              count: initial.diagnostics.length,
              diagnostics: initial.diagnostics,
            },
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      info('No fixes available.');
    }
    return computeExitCode(initial.diagnostics);
  }

  // Dry run: preview the fixes without touching the filesystem.
  if (options.dryRun === true) {
    const preview = await applyFixes(pluginDir, fixable, { dryRun: true });
    if (options.json === true) {
      process.stdout.write(
        JSON.stringify(
          {
            plugin: pluginName,
            dryRun: true,
            fixesAvailable: fixable.length,
            fixes: preview.fixes.map(serializeAppliedFix),
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      printFixPreview(fixable);
    }
    return computeExitCode(initial.diagnostics);
  }

  // Confirmation: require an explicit yes outside of --yes.
  if (options.yes !== true && !(await confirmApply(fixable.length))) {
    if (options.json === true) {
      process.stdout.write(
        JSON.stringify(
          {
            plugin: pluginName,
            dryRun: false,
            aborted: true,
            applied: 0,
            failed: 0,
            fixes: [],
            remaining: {
              count: initial.diagnostics.length,
              diagnostics: initial.diagnostics,
            },
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      info('Aborted - no changes made.');
    }
    return EXIT_CODES.SUCCESS;
  }

  // Apply fixes, then re-scan and re-validate so every rule sees the changes
  // (raw-file rules read from disk; in-memory state is stale after edits).
  // validatePlugin accepts the ScanResult directly and merges the parser
  // diagnostics, so skills that could not be loaded (no auto-fix) still count
  // against the remaining issues.
  const fixResult = await applyFixes(pluginDir, fixable);
  const revalidated = await validatePlugin(await scanPlugin(pluginDir));

  if (options.json === true) {
    process.stdout.write(
      JSON.stringify(
        {
          plugin: pluginName,
          dryRun: false,
          applied: fixResult.applied,
          failed: fixResult.failed,
          fixes: fixResult.fixes.map(serializeAppliedFix),
          remaining: {
            count: revalidated.diagnostics.length,
            diagnostics: revalidated.diagnostics,
          },
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    if (fixResult.applied > 0) {
      success(
        `Applied ${fixResult.applied} fix${fixResult.applied === 1 ? '' : 'es'}`,
      );
    }
    if (fixResult.failed > 0) {
      error(
        `${fixResult.failed} fix${fixResult.failed === 1 ? '' : 'es'} failed to apply`,
      );
    }
    const remainingCount = revalidated.diagnostics.length;
    if (remainingCount === 0) {
      success('Re-validation: no issues remaining.');
    } else {
      warning(
        `Re-validation: ${remainingCount} issue${remainingCount === 1 ? '' : 's'} remaining.`,
      );
    }
  }

  return computeExitCode(revalidated.diagnostics);
}

/** Human-readable preview of the fixes a dry run would apply. */
function printFixPreview(fixable: Diagnostic[]): void {
  info(`${fixable.length} fix${fixable.length === 1 ? '' : 'es'} available:`);
  for (const diagnostic of fixable) {
    const fix = diagnostic.fix;
    if (fix === undefined) continue;
    info(`  ${diagnostic.code}  ${fix.description} (${fix.file})`);
  }
  info('Run without --dry-run to apply fixes.');
}

/** Prompt for confirmation, reading from stdin. */
async function confirmApply(count: number): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await new Promise<string>((resolveAnswer) => {
      readline.question(
        `Apply ${count} fix${count === 1 ? '' : 'es'}? [y/N] `,
        resolveAnswer,
      );
    });
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    readline.close();
  }
}

/** Serialize an applied fix for JSON output. */
function serializeAppliedFix(entry: AppliedFix) {
  return {
    code: entry.diagnostic.code,
    severity: entry.diagnostic.severity,
    message: entry.diagnostic.message,
    file: entry.fix.file,
    description: entry.fix.description,
    success: entry.success,
    ...(entry.error !== undefined ? { error: entry.error } : {}),
  };
}
