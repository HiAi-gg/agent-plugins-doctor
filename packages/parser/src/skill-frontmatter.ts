import matter from 'gray-matter';
import type {
  AllowedToolsValue,
  SkillFrontmatter,
} from '@agent-plugins-doctor/core';
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
    const allowedTools = data['allowed-tools'];
    // The Agent Skills specification defines `allowed-tools` as a
    // space-separated string (YAML scalar), so string values are preserved
    // verbatim. Other YAML types (lists, numbers, booleans, mappings) are
    // preserved as-is too: the DOC-2005 rule is the gatekeeper for this
    // field and diagnoses non-string forms (YAML list → warning, anything
    // else → error), so malformed input surfaces as a validation error
    // rather than a load failure.
    if (isAllowedToolsValue(allowedTools)) {
      frontmatter['allowed-tools'] = allowedTools;
    }
  }

  return { frontmatter, body };
}

/** True for any YAML value the DOC-2005 rule knows how to diagnose. */
function isAllowedToolsValue(value: unknown): value is AllowedToolsValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    Array.isArray(value) ||
    isPlainObject(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
