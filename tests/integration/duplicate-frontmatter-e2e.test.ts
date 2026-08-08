// E2E regression: DOC-7003 (duplicate frontmatter) severity -> exit code.
//
// The ecosystem audit requires DOC-7003 to be an *error*: a SKILL.md with more
// than one YAML frontmatter block is structural corruption, and the Builder
// Contract requires the check to fail (exit 1). These tests spawn the real CLI
// binary and lock the end-to-end behavior:
//   - corrupted SKILL.md -> exit 1 with DOC-7003 on stdout
//   - valid SKILL.md (with a Markdown horizontal rule) -> exit 0, no findings

import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import {
  canonicalJson,
  cleanup,
  makeTempDir,
  REPO_ROOT,
  writeTree,
} from './helpers.js';

const CLI = './packages/cli/bin/agent-plugins-doctor';

describe('ECO-002: Duplicate Frontmatter E2E', () => {
  test('duplicated-frontmatter SKILL.md → DOC-7003 → exit 1', () => {
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

      try {
        execSync(`${CLI} check ${dir} --no-color`, {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        throw new Error('Should have exited with code 1');
      } catch (error) {
        const err = error as { status?: number; stdout?: string | Buffer };
        expect(err.status).toBe(1);
        expect(String(err.stdout)).toContain('DOC-7003');
        expect(String(err.stdout)).toContain('duplicate frontmatter');
      }
    } finally {
      cleanup(dir);
    }
  });

  test('valid SKILL.md with Markdown horizontal rule → exit 0', () => {
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

      const result = execSync(`${CLI} check ${dir} --no-color`, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect(String(result)).toContain('No issues found');
    } finally {
      cleanup(dir);
    }
  });
});
