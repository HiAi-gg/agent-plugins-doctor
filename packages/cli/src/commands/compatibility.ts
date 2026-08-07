// compatibility command: check compatibility with Agent Plugin clients.

import { Command } from 'commander';
import type { CompatibilityCheck } from '@agent-plugins-doctor/compatibility';
import {
  checkCompatibility,
  CompatibilityLevel,
} from '@agent-plugins-doctor/compatibility';
import type { Plugin } from '@agent-plugins-doctor/core';
import { scanPlugin } from '@agent-plugins-doctor/parser';
import { EXIT_CODES } from '../utils/exit-codes.js';
import {
  error,
  isNoColor,
  resolveChalk,
  setColorEnabled,
} from '../utils/output.js';
import {
  assertRootAccessible,
  handleCommandError,
  resolvePluginDir,
} from '../utils/run.js';

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
  const rootDir = resolvePluginDir(dir);
  assertRootAccessible(rootDir);
  const scanResult = await scanPlugin(rootDir);
  if (scanResult.plugin === null) {
    // plugin.json could not be loaded: report the parser diagnostics as a
    // validation error (exit 1) instead of failing with a tool error.
    for (const diagnostic of scanResult.diagnostics) {
      error(`${diagnostic.code}: ${diagnostic.message}`);
    }
    return EXIT_CODES.SPEC_ERRORS;
  }
  const plugin = scanResult.plugin;
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
      level: check.level,
      compatible: check.compatible,
      working: check.working,
      unsupported: check.unsupported,
      issues: check.issues.map((issue) => ({
        severity: issue.severity,
        message: issue.message,
        component: issue.component ?? null,
      })),
      evidence: check.evidence,
      extensionsHandling: check.extensionsHandling ?? null,
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
    lines.push(`  ${compatLabel(c, check)}`);
    if (check.extensionsHandling !== undefined) {
      lines.push(...formatExtensions(plugin, check));
    }
    if (check.level !== CompatibilityLevel.FULL) {
      if (check.unsupported.length > 0) {
        lines.push(`    Unsupported: ${check.unsupported.join(', ')}`);
      }
      for (const issue of check.issues) {
        // Extension findings are covered by the extension section above.
        if (
          check.extensionsHandling !== undefined &&
          issue.component === 'extensions'
        ) {
          continue;
        }
        lines.push(`    - ${issue.message}`);
      }
    }
  }
  lines.push(
    '',
    `Summary: ${compatible} compatible, ${checks.length - compatible} incompatible`,
  );
  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Per-client extension handling lines, shown even for FULL clients so users
 * can see how a plugin's extension namespaces are treated. Doctor never
 * claims a client "understands" a namespace unless it is explicitly listed
 * in the profile.
 */
function formatExtensions(plugin: Plugin, check: CompatibilityCheck): string[] {
  const lines: string[] = [];
  for (const extension of plugin.extensions) {
    lines.push(`    Extension namespace ${extension.namespace}:`);
    switch (check.extensionsHandling) {
      case 'supported':
        lines.push(`      Supported by this client.`);
        break;
      case 'ignored':
        lines.push(`      Unknown to this client.`);
        lines.push(`      Plugin portable components remain usable.`);
        lines.push(`      (Client safely ignores unknown extensions per spec)`);
        break;
      case 'unsupported':
        lines.push(`      Not supported by this client.`);
        lines.push(`      Plugin portable components remain usable.`);
        lines.push(`      (Client will ignore these extensions)`);
        break;
      case 'unknown':
        lines.push(`      How this client handles extensions is unverified.`);
        break;
      case undefined:
        break;
    }
  }
  return lines;
}

/** Colored, level-aware per-client status line. */
function compatLabel(
  c: ReturnType<typeof resolveChalk>,
  check: CompatibilityCheck,
): string {
  switch (check.level) {
    case CompatibilityLevel.FULL:
      return `${c.green('✓')} ${check.clientName}`;
    case CompatibilityLevel.PARTIAL:
      return `${c.yellow('~')} ${check.clientName} (partial)`;
    case CompatibilityLevel.UNSUPPORTED:
      return `${c.red('✗')} ${check.clientName} (unsupported)`;
    case CompatibilityLevel.UNKNOWN:
      return `${c.dim('?')} ${check.clientName} (unknown)`;
  }
}
