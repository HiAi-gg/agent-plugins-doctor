// DOC-4002: no symlink may escape the plugin root. Critical, no fix.
//
// Conservative: only component directories that resolve to a real path
// outside the real plugin root are reported. Missing paths and environments
// where the plugin root cannot be resolved are skipped silently.

import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { isWithinPath } from '@agent-plugins-doctor/core';
import type { Rule } from '../../rule.js';
import { makeDiagnostic } from '../../util.js';

const ID = 'security-symlink-escape';
const CODE = 'DOC-4002';

export const symlinkEscapeRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Symlink escape',
  category: 'security',
  severity: 'critical',
  supportedSpecVersions: ['1.0.0'],
  description:
    'No component directory may be a symlink that resolves outside the plugin root.',
  enabledByDefault: true,

  check(ctx) {
    let realRoot: string;
    try {
      realRoot = realpathSync(ctx.rootDir);
    } catch {
      // Plugin root unavailable: nothing to check, stay conservative.
      return [];
    }

    const targets: Array<{ path: string; file: string }> = [];
    for (const skill of ctx.plugin.skills) {
      targets.push({
        path: join(ctx.rootDir, skill.directory),
        file: skill.directory,
      });
    }
    for (const extension of ctx.plugin.extensions) {
      targets.push({
        path: join(ctx.rootDir, extension.path),
        file: extension.path,
      });
    }

    const diagnostics = [];
    for (const target of targets) {
      try {
        const realTarget = realpathSync(target.path);
        if (!isWithinPath(realTarget, realRoot)) {
          diagnostics.push(
            makeDiagnostic(
              CODE,
              ID,
              'security',
              'critical',
              `Symbolic link at "${target.file}" escapes the plugin root`,
              target.file,
            ),
          );
        }
      } catch {
        // Missing or unreadable component: skip (conservative).
      }
    }
    return diagnostics;
  },
};
