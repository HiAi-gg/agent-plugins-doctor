// DOC-5003: unexpected files at the plugin root (informational).

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Rule } from '../../rule.js';
import { makeDiagnostic, REVERSE_DOMAIN_PATTERN } from '../../util.js';

const ID = 'structure-extra-files';
const CODE = 'DOC-5003';

// Files and directories commonly found at a plugin root that are not part of
// the plugin specification but should not be flagged.
const EXPECTED_ENTRIES = new Set([
  'plugin.json',
  'mcp.json',
  'skills',
  'docs',
  'README.md',
  'README',
  'readme.md',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'CHANGELOG.md',
  'CHANGELOG',
  'NOTICE',
  'NOTICE.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.git',
  '.github',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.prettierrc',
  '.prettierignore',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.mjs',
  '.eslintrc.cjs',
  '.npmignore',
  'package.json',
  'tsconfig.json',
  // Monorepo / tooling scaffolding: a plugin root that is also a repository
  // commonly contains these; they are not part of the plugin specification but
  // should not be flagged (Doctor self-hosts from such a root).
  'tsconfig.base.json',
  'eslint.config.mjs',
  'bunfig.toml',
  'bun.lock',
  'MEMORY.md',
  'AGENTS.md',
  'checkpoint.md',
  'notes.md',
  'node_modules',
  'packages',
  'tests',
  'examples',
  'scripts',
  'PUBLISHING.md',
]);

export const extraFilesRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Extra files at root',
  category: 'structure',
  severity: 'info',
  supportedSpecVersions: ['1.0.0'],
  description:
    'Report unexpected files at the plugin root that are not part of the plugin structure.',
  enabledByDefault: true,
  requiresPlugin: false,

  check(ctx) {
    let entries: string[];
    try {
      entries = readdirSync(ctx.rootDir).sort((a, b) => a.localeCompare(b));
    } catch {
      return []; // root unavailable: nothing to inspect
    }

    const diagnostics = [];
    for (const entry of entries) {
      if (EXPECTED_ENTRIES.has(entry)) continue;
      if (entry.startsWith('.') && entry !== '.') continue; // dotfiles
      let isDir = false;
      try {
        isDir = statSync(join(ctx.rootDir, entry)).isDirectory();
      } catch {
        // Ignore entries that vanish mid-scan.
      }
      // Extension namespaces are reverse-domain *directories* (§8.2); files
      // that merely look dotted (e.g. notes.log) are still reported.
      if (isDir && REVERSE_DOMAIN_PATTERN.test(entry)) continue;
      diagnostics.push(
        makeDiagnostic(
          CODE,
          ID,
          'structure',
          'info',
          `Unexpected ${isDir ? 'directory' : 'file'} at plugin root: "${entry}"`,
          entry,
        ),
      );
    }
    return diagnostics;
  },
};
