// E2E regression: DOC-7003 (duplicate frontmatter) severity -> exit code.
//
// The ecosystem audit requires DOC-7003 to be an *error*: a SKILL.md with more
// than one YAML frontmatter block is structural corruption, and the Builder
// Contract requires the check to fail (exit 1). These tests spawn the real CLI
// binary and lock the end-to-end behavior:
//   - corrupted SKILL.md -> exit 1 with DOC-7003 on stdout
//   - valid SKILL.md (with a Markdown horizontal rule) -> exit 0, no findings

import { describe, expect, test } from 'bun:test';
import { runCli } from '../e2e/helpers.js';
import { canonicalJson, cleanup, makeTempDir, writeTree } from './helpers.js';

describe('ECO-002: Duplicate Frontmatter E2E', () => {
  test('duplicated-frontmatter SKILL.md → DOC-7003 → exit 1', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        'skills/test/SKILL.md': `---
name: test
description: Test
---
---
name: duplicate
description: Second block
---
# Body
`,
      });

      // runCli executes the shipped binary via Bun.spawn with an absolute path
      // (bun <bin>), so it works identically on Windows and POSIX — unlike
      // executing the shebang file directly.
      const result = await runCli(['check', dir, '--no-color']);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('DOC-7003');
      expect(result.stdout).toContain('duplicate frontmatter');
    } finally {
      cleanup(dir);
    }
  });

  test('valid SKILL.md with Markdown horizontal rule → exit 0', async () => {
    const dir = makeTempDir();
    try {
      writeTree(dir, {
        'plugin.json': canonicalJson({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'test',
        }),
        'skills/test/SKILL.md': `---
name: test
description: Test
---

# Body

---

Some text after horizontal rule.
`,
      });

      const result = await runCli(['check', dir, '--no-color']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No issues found');
    } finally {
      cleanup(dir);
    }
  });
});
