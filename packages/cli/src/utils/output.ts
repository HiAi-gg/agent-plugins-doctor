// Terminal output utilities for the CLI.
//
// All output is written through process.stdout/process.stderr (never
// console.log) so reports stay machine-parseable and tests can capture output
// deterministically. Colors honor the --no-color flag via setColorEnabled,
// and chalk's ambient TTY detection disables them automatically in pipes.

import chalk, { Chalk, type ChalkInstance } from 'chalk';

let colorEnabled = true;

/** Resolve the active chalk instance honoring the global color toggle. */
function currentChalk(): ChalkInstance {
  return colorEnabled ? chalk : new Chalk({ level: 0 });
}

/** Enable or disable colors for subsequent output (from --no-color). */
export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

/** True when a negated --no-color option means colors are disabled. */
export function isNoColor(color: boolean | undefined): boolean {
  return color === false;
}

/** Build a chalk instance for a single command honoring --no-color. */
export function resolveChalk(noColor: boolean): ChalkInstance {
  return noColor ? new Chalk({ level: 0 }) : chalk;
}

export function success(message: string): void {
  process.stdout.write(`${currentChalk().green(`✓ ${message}`)}\n`);
}

export function warning(message: string): void {
  process.stdout.write(`${currentChalk().yellow(`Warning: ${message}`)}\n`);
}

export function error(message: string): void {
  process.stderr.write(`${currentChalk().red(`✗ ${message}`)}\n`);
}

export function info(message: string): void {
  process.stdout.write(`${currentChalk().blue(message)}\n`);
}

export interface Spinner {
  update(message: string): void;
  succeed(message: string): void;
  fail(message: string): void;
  stop(): void;
}

/**
 * Create a lightweight spinner handle.
 *
 * This is intentionally minimal (no animation frames): it emits the final
 * status line on succeed/fail so output stays deterministic in CI and in
 * tests. `update` tracks the current message; `stop` silences the handle.
 */
export function createSpinner(initialMessage: string): Spinner {
  let message = initialMessage;
  let active = true;

  return {
    update(next: string): void {
      message = next;
    },
    succeed(done: string): void {
      if (!active) return;
      active = false;
      process.stdout.write(
        `${currentChalk().green(`✓ ${done !== '' ? done : message}`)}\n`,
      );
    },
    fail(done: string): void {
      if (!active) return;
      active = false;
      process.stderr.write(
        `${currentChalk().red(`✗ ${done !== '' ? done : message}`)}\n`,
      );
    },
    stop(): void {
      active = false;
    },
  };
}
