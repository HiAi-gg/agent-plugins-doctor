// Example: how Builder validates a plugin after generating it.
//
// This mirrors the exact pipeline Builder should run after `init`, `create`,
// or `migrate` finishes writing plugin files:
//
//   1. loadPlugin        - parse plugin.json, mcp.json, and skills/ from disk
//   2. validatePlugin    - run every rule in the default registry
//   3. generateReport    - render a human-readable report for the user
//   4. computeExitCode   - 0=valid, 1=errors, 2=security-critical, 3=failure
//
// Run directly:  bun validate-after-generate.ts <plugin-directory>

import { computeExitCode } from '@agent-plugins-doctor/cli';
import { loadPlugin } from '@agent-plugins-doctor/parser';
import { generateReport } from '@agent-plugins-doctor/report';
import { computeSummary, validatePlugin } from '@agent-plugins-doctor/rules';

export async function validateGeneratedPlugin(outputDir: string): Promise<{
  valid: boolean;
  exitCode: number;
  report: string;
}> {
  try {
    // 1. Load the generated plugin. Skills that fail to load (malformed
    //    frontmatter, invalid YAML, ...) are reported as parse diagnostics
    //    instead of being silently dropped.
    const { plugin, parseDiagnostics } = await loadPlugin(outputDir);

    // 2. Validate it
    const result = await validatePlugin(plugin);

    // 2b. Merge parser-level parse diagnostics with the rule diagnostics so
    //     malformed input is a validation error (exit 1), not a silent drop.
    const diagnostics = [...parseDiagnostics, ...result.diagnostics];

    // 3. Generate a report (summary recomputed over the merged diagnostics)
    const report = generateReport(
      {
        ...result,
        diagnostics,
        summary: computeSummary(diagnostics),
        compatible: !diagnostics.some(
          (diagnostic) =>
            diagnostic.severity === 'error' ||
            diagnostic.severity === 'critical',
        ),
      },
      { format: 'human' },
    );

    // 4. Compute exit code
    const exitCode = computeExitCode(diagnostics);

    return {
      valid: exitCode === 0,
      exitCode,
      report,
    };
  } catch (error) {
    return {
      valid: false,
      exitCode: 3,
      report: `Validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// Executable: `bun validate-after-generate.ts <plugin-directory>`.
// Uses exit code 3 for CLI usage errors, matching the tool-failure contract.
if (import.meta.main) {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error('Usage: bun validate-after-generate.ts <plugin-directory>');
    process.exit(3);
  }
  const result = await validateGeneratedPlugin(dir);
  process.stdout.write(result.report);
  process.exit(result.exitCode);
}
