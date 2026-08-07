import matter from 'gray-matter';
import type { SkillFrontmatter } from '@agent-plugin-doctor/core';
import { ParseError } from './errors.js';

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Parse a SKILL.md file and extract frontmatter + body.
 *
 * Uses gray-matter for robust YAML parsing (replaces regex-based extraction).
 * Handles:
 * - Quoted strings
 * - Multiline descriptions
 * - Colons in values (when quoted, as YAML requires)
 * - Empty fields
 * - YAML lists (allowed-tools can be string or array)
 *
 * @param content - Full content of SKILL.md file
 * @param filePath - File path for error messages
 * @returns Parsed frontmatter and body
 * @throws ParseError if frontmatter is malformed
 */
export function parseSkillFrontmatter(
  content: string,
  filePath: string,
): ParsedSkill {
  // Strip a UTF-8 BOM if present
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  // Frontmatter is required: the file must start with a '---' delimiter
  if (!/^\s*---/.test(text)) {
    throw new ParseError(
      'SKILL.md must start with YAML frontmatter delimited by "---"',
      filePath,
    );
  }

  // gray-matter parses the YAML frontmatter and splits off the body
  let data: unknown;
  let body: string;
  try {
    const parsed = matter(text);
    data = parsed.data;
    body = parsed.content;
  } catch (error) {
    throw new ParseError(
      `Malformed YAML frontmatter: ${(error as Error).message}`,
      filePath,
      error,
    );
  }

  if (!isPlainObject(data)) {
    throw new ParseError(
      'Frontmatter must be a YAML mapping of key/value pairs',
      filePath,
    );
  }

  // Required fields: name and description (Agent Skills specification)
  const name = data.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ParseError(
      "Frontmatter is missing required field 'name'",
      filePath,
    );
  }
  const description = data.description;
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new ParseError(
      "Frontmatter is missing required field 'description'",
      filePath,
    );
  }

  const frontmatter: SkillFrontmatter = {
    name,
    // YAML block scalars (|) preserve a trailing newline; trim it so string
    // values carry no parsing artifact.
    description: description.trimEnd(),
  };

  if (typeof data.license === 'string') {
    frontmatter.license = data.license.trimEnd();
  }
  if (typeof data.compatibility === 'string') {
    frontmatter.compatibility = data.compatibility.trimEnd();
  }
  if (isPlainObject(data.metadata)) {
    frontmatter.metadata = data.metadata as Record<string, string>;
  }
  if (data['allowed-tools'] !== undefined && data['allowed-tools'] !== null) {
    frontmatter['allowed-tools'] = normalizeAllowedTools(
      data['allowed-tools'],
      filePath,
    );
  }

  return { frontmatter, body };
}

/**
 * Normalize the `allowed-tools` field to a string array. The Agent Skills
 * specification defines it as a space-separated string; an explicit YAML
 * list is also accepted. Any other value is malformed.
 */
function normalizeAllowedTools(value: unknown, filePath: string): string[] {
  if (typeof value === 'string') {
    return value.split(/\s+/).filter((tool) => tool.length > 0);
  }
  if (Array.isArray(value)) {
    if (!value.every((tool) => typeof tool === 'string')) {
      throw new ParseError(
        "'allowed-tools' must be a string or a list of strings",
        filePath,
      );
    }
    return value as string[];
  }
  throw new ParseError(
    "'allowed-tools' must be a string or a list of strings",
    filePath,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
