// Example: how Builder replaces its regex-based frontmatter parsers with
// Doctor's parseSkillFrontmatter.
//
// Builder previously used several regex-based parsers across its codebase
// (one per frontmatter variant). Doctor's parser is the single canonical
// implementation: robust YAML parsing (gray-matter), required-field
// validation, and body extraction — no regex, no edge-case drift.

import { parseSkillFrontmatter } from '@agent-plugins-doctor/parser';
import type { ParsedSkill } from '@agent-plugins-doctor/parser';
import type { AllowedToolsValue } from '@agent-plugins-doctor/core';

export interface ParsedSkillResult {
  name: string;
  description: string;
  body: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: AllowedToolsValue;
}

export function parseSkill(
  content: string,
  filePath: string,
): ParsedSkillResult {
  // Old way (Builder's regex):
  // const nameMatch = content.match(/^name:\s*(.+)$/m);
  // const descMatch = content.match(/^description:\s*(.+)$/m);

  // New way (Doctor's parser):
  const parsed: ParsedSkill = parseSkillFrontmatter(content, filePath);
  return {
    name: parsed.frontmatter.name,
    description: parsed.frontmatter.description,
    body: parsed.body,
    license: parsed.frontmatter.license,
    compatibility: parsed.frontmatter.compatibility,
    metadata: parsed.frontmatter.metadata,
    allowedTools: parsed.frontmatter['allowed-tools'],
  };
}
