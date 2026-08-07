// compatibility command: check compatibility with Agent Plugin clients.

import { Command } from 'commander';
import type { CompatibilityCheck } from '@agent-plugin-doctor/compatibility';
import { checkCompatibility } from '@agent-plugin-doctor/compatibility';
import type { Plugin } from '@agent-plugin-doctor/core';
import { loadPlugin } from '@agent-plugin-doctor/parser';
import { EXIT_CODES } from '../utils/exit-codes.js';
import {
  error,
  isNoColor,
  resolveChalk,
  setColorEnabled,
} from '../utils/output.js';
import { handleCommandError, resolvePluginDir } from '../utils/run.js';

export const compatibilityCommand = new Command('compatibility')
  .description('Check compatibility with Agent Plugin clients')
  .argument('[dir]', 'Plugin directory', '.')
  .option('--client <id>', 'Check only specific client')
  .option('--json', 'Output as JSON')
  .option('--no-color', 'Disable colors')
  .action(async (dir, options) => {
    const noColor = isNoColor(options.color);
    setColorEnabled(!noColor);
    try {
      const exitCode = await runCompatibility(dir, options, noColor);
      process.exitCode = exitCode;
    } catch (cause) {
      handleCommandError(cause);
    }
  });

/**
 * Run the compatibility pipeline and return the exit code.
 * Exported separately so tests can drive the pipeline directly.
 */
export async function runCompatibility(
  dir: string,
  options: {
    client?: string;
    json?: boolean;
  },
  noColor: boolean,
): Promise<number> {
  const plugin: Plugin = await loadPlugin(resolvePluginDir(dir));
  const compat = checkCompatibility(plugin);
  const checks =
    options.client === undefined
      ? compat.checks
      : compat.checks.filter((check) => check.clientId === options.client);

  if (options.client !== undefined && checks.length === 0) {
    error(
      `Unknown client "${options.client}" (expected ${compat.checks.map((check) => check.clientId).join(', ')})`,
    );
    return EXIT_CODES.TOOL_FAILURE;
  }

  if (options.json === true) {
    process.stdout.write(
      JSON.stringify(toJson(plugin, checks), null, 2) + '\n',
    );
  } else {
    printHuman(plugin, checks, noColor);
  }

  const incompatible = checks.some((check) => !check.compatible);
  return incompatible ? EXIT_CODES.SPEC_ERRORS : EXIT_CODES.SUCCESS;
}

function toJson(plugin: Plugin, checks: CompatibilityCheck[]) {
  const compatible = checks.filter((check) => check.compatible).length;
  return {
    plugin: { name: plugin.manifest.name, specVersion: plugin.specVersion },
    summary: {
      total: checks.length,
      compatible,
      incompatible: checks.length - compatible,
    },
    clients: checks.map((check) => ({
      clientId: check.clientId,
      clientName: check.clientName,
      compatible: check.compatible,
      issues: check.issues.map((issue) => ({
        severity: issue.severity,
        message: issue.message,
        component: issue.component ?? null,
      })),
      evidence: check.evidence,
    })),
  };
}

function printHuman(
  plugin: Plugin,
  checks: CompatibilityCheck[],
  noColor: boolean,
): void {
  const c = resolveChalk(noColor);
  const compatible = checks.filter((check) => check.compatible).length;
  const lines: string[] = [
    'Agent Plugin Doctor - Compatibility',
    '',
    `Plugin: ${plugin.manifest.name} (Agent Plugins ${plugin.specVersion})`,
    '',
  ];
  for (const check of checks) {
    if (check.compatible) {
      lines.push(c.green(`✓ ${check.clientName}`));
    } else {
      lines.push(c.red(`✗ ${check.clientName}`));
      for (const issue of check.issues) {
        lines.push(`  - ${issue.message}`);
      }
    }
  }
  lines.push(
    '',
    `Summary: ${compatible} compatible, ${checks.length - compatible} incompatible`,
  );
  process.stdout.write(lines.join('\n') + '\n');
}
