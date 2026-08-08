// DOC-7003: SKILL.md must not contain duplicate YAML frontmatter blocks.
// gray-matter parses only the first block; additional blocks are silently
// accepted as body content. Structural corruption -> error, no autofix
// (removing a block is destructive and ambiguous).

import type { Rule } from '../../rule.js';
import { makeDiagnostic, readTextFile } from '../../util.js';

const ID = 'format-duplicate-frontmatter';
const CODE = 'DOC-7003';

// A line that opens or closes a fenced code block: three or more backticks
// or tildes. Inline backticks (`code`) do not toggle fence state.
function isFenceLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

// A top-level YAML key-value pair (`key: value`). Distinguishes a duplicate
// frontmatter block from a horizontal rule (`---` paragraph separator).
const YAML_KEY_LINE = /^[a-zA-Z_][a-zA-Z0-9_-]*:.*$/;

/**
 * Count YAML frontmatter blocks that follow the first one in a SKILL.md
 * file. Returns 0 when the file is clean (a single block) or has no
 * frontmatter at all.
 *
 * The first block must open on the first line of the file and is located by
 * scanning forward for its closing `---`. Every later `---` line found
 * outside a code fence is a candidate duplicate; it counts when the content
 * up to the next `---` (or EOF) contains at least one YAML key-value line.
 */
export function countDuplicateFrontmatterBlocks(raw: string): number {
  // Split on LF or CRLF: a trailing \r would otherwise break the YAML key
  // pattern (JS `$` anchors to the end of the string, not before a final \r).
  const lines = raw.split(/\r\n|\n/);

  // The first block must open on the first line of the file.
  if (!/^---/.test(lines[0] ?? '')) return 0;

  let inFence = false;

  // Find the closing delimiter of the first block.
  let firstClose = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isFenceLine(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && lines[i].trim() === '---') {
      firstClose = i;
      break;
    }
  }
  if (firstClose === -1) return 0;

  // Scan the remainder of the file for candidate duplicate blocks.
  let count = 0;
  for (let i = firstClose + 1; i < lines.length; i++) {
    if (isFenceLine(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence || lines[i].trim() !== '---') continue;

    // Candidate duplicate: scan forward for the next `---` or EOF and look
    // for at least one YAML key-value line in between.
    let j = i + 1;
    let hasKey = false;
    while (j < lines.length && !hasKey) {
      if (isFenceLine(lines[j])) {
        inFence = !inFence;
      } else if (!inFence && lines[j].trim() === '---') {
        break; // closing delimiter (or another `---` line)
      } else if (!inFence && YAML_KEY_LINE.test(lines[j])) {
        hasKey = true;
      }
      j++;
    }
    if (hasKey) count++;
    // Resume just before the closing delimiter so it is also considered as
    // the opening of the next block (`---` can serve both roles).
    i = j - 1;
  }
  return count;
}

export const duplicateFrontmatterRule: Rule = {
  id: ID,
  code: CODE,
  name: 'Duplicate frontmatter',
  category: 'format',
  severity: 'error',
  supportedSpecVersions: ['1.0.0'],
  description:
    'SKILL.md must not contain duplicate YAML frontmatter blocks. ' +
    'gray-matter only parses the first block; additional blocks are silently accepted.',
  enabledByDefault: true,

  check(ctx) {
    const diagnostics = [];
    for (const skill of ctx.plugin.skills) {
      const file = `${skill.directory}/SKILL.md`;
      const raw = readTextFile(ctx.rootDir, file);
      if (raw === null) continue;
      const count = countDuplicateFrontmatterBlocks(raw);
      if (count > 0) {
        diagnostics.push(
          makeDiagnostic(
            CODE,
            ID,
            'format',
            'error',
            `${file}: ${count} duplicate frontmatter block(s) found after the first — ` +
              `gray-matter silently ignores these; remove or merge them`,
            file,
          ),
        );
      }
    }
    return diagnostics;
  },
  // NO autofix — ambiguous which block to keep
};
