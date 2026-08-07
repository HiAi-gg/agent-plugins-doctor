import { describe, expect, test } from 'bun:test';
import { ParseError, parseSkillFrontmatter } from '../src/index.js';

const FILE = '/tmp/example-skill/SKILL.md';

describe('parseSkillFrontmatter', () => {
  test('valid SKILL.md parses correctly', () => {
    const content = `---
name: summarize
description: Summarize text and extract key points.
---
# Summarize

Do the thing.
`;
    const { frontmatter, body } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter.name).toBe('summarize');
    expect(frontmatter.description).toBe(
      'Summarize text and extract key points.',
    );
    expect(body).toContain('# Summarize');
    expect(body).toContain('Do the thing.');
  });

  test('parses all optional fields', () => {
    const content = `---
name: pdf-processing
description: Process PDF files.
license: Apache-2.0
compatibility: Requires python3
metadata:
  author: example-org
  version: "1.0"
---
Body
`;
    const { frontmatter } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter.name).toBe('pdf-processing');
    expect(frontmatter.license).toBe('Apache-2.0');
    expect(frontmatter.compatibility).toBe('Requires python3');
    expect(frontmatter.metadata).toEqual({
      author: 'example-org',
      version: '1.0',
    });
  });

  test('missing frontmatter throws ParseError', () => {
    expect(() =>
      parseSkillFrontmatter('# No frontmatter here\n', FILE),
    ).toThrow(ParseError);
    expect(() =>
      parseSkillFrontmatter('# No frontmatter here\n', FILE),
    ).toThrow(/must start with YAML frontmatter/);
  });

  test('missing required field name throws ParseError', () => {
    const content = '---\ndescription: No name here\n---\nBody';
    expect(() => parseSkillFrontmatter(content, FILE)).toThrow(ParseError);
    expect(() => parseSkillFrontmatter(content, FILE)).toThrow(/'name'/);
  });

  test('missing required field description throws ParseError', () => {
    const content = '---\nname: no-desc\n---\nBody';
    expect(() => parseSkillFrontmatter(content, FILE)).toThrow(ParseError);
    expect(() => parseSkillFrontmatter(content, FILE)).toThrow(/'description'/);
  });

  test('empty required fields throw ParseError', () => {
    expect(() =>
      parseSkillFrontmatter('---\nname: ""\ndescription: "x"\n---\n', FILE),
    ).toThrow(ParseError);
    expect(() =>
      parseSkillFrontmatter('---\nname: x\ndescription: ""\n---\n', FILE),
    ).toThrow(ParseError);
  });

  test('non-mapping frontmatter throws ParseError', () => {
    expect(() =>
      parseSkillFrontmatter('---\njust a string\n---\n', FILE),
    ).toThrow(ParseError);
  });

  test('malformed YAML throws ParseError', () => {
    const content = '---\nname: [unclosed\n---\nBody';
    let error: unknown;
    try {
      parseSkillFrontmatter(content, FILE);
    } catch (caught) {
      error = caught;
    }
    // Note: js-yaml v3 (used by gray-matter) only throws on the first parse of
    // a given malformed string, so the content is parsed exactly once here.
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).message).toMatch(/Malformed YAML/);
  });

  test('quoted strings are handled correctly', () => {
    const content =
      '---\nname: my-skill\ndescription: "A description with \\"nested quotes\\" inside"\n---\nBody';
    const { frontmatter } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter.description).toBe(
      'A description with "nested quotes" inside',
    );
  });

  test('multiline descriptions are handled correctly', () => {
    const content = `---
name: multi-line
description: |
  First line of the description.
  Second line with more detail.
---
Body
`;
    const { frontmatter } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter.description).toBe(
      'First line of the description.\nSecond line with more detail.',
    );
  });

  test('colons in values are handled correctly', () => {
    // A colon not followed by a space is valid in a plain YAML scalar
    const plain =
      '---\nname: colon-skill\ndescription: Extract PDFs:fill forms:merge\n---\nBody';
    expect(parseSkillFrontmatter(plain, FILE).frontmatter.description).toBe(
      'Extract PDFs:fill forms:merge',
    );

    // Colon followed by a space must be quoted in YAML; the parser must
    // accept the quoted form and preserve the value verbatim.
    const quoted =
      '---\nname: colon-skill\ndescription: "Use when: handling PDFs."\n---\nBody';
    expect(parseSkillFrontmatter(quoted, FILE).frontmatter.description).toBe(
      'Use when: handling PDFs.',
    );
  });

  test('allowed-tools as string is normalized to array', () => {
    const content =
      '---\nname: tools-skill\ndescription: Uses tools\nallowed-tools: Bash(git:*) Bash(jq:*) Read\n---\nBody';
    const { frontmatter } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter['allowed-tools']).toEqual([
      'Bash(git:*)',
      'Bash(jq:*)',
      'Read',
    ]);
  });

  test('allowed-tools empty string normalizes to empty array', () => {
    const content =
      '---\nname: tools-skill\ndescription: Uses tools\nallowed-tools: ""\n---\nBody';
    const { frontmatter } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter['allowed-tools']).toEqual([]);
  });

  test('allowed-tools as array is preserved', () => {
    const content =
      '---\nname: tools-skill\ndescription: Uses tools\nallowed-tools: [Read, Bash]\n---\nBody';
    const { frontmatter } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter['allowed-tools']).toEqual(['Read', 'Bash']);
  });

  test('allowed-tools of invalid type throws ParseError', () => {
    const content =
      '---\nname: tools-skill\ndescription: Uses tools\nallowed-tools: 42\n---\nBody';
    expect(() => parseSkillFrontmatter(content, FILE)).toThrow(ParseError);
    expect(() => parseSkillFrontmatter(content, FILE)).toThrow(/allowed-tools/);
  });

  test('UTF-8 BOM before the delimiter is tolerated', () => {
    const content =
      '\uFEFF---\nname: bom-skill\ndescription: Has a BOM\n---\nBody';
    const { frontmatter } = parseSkillFrontmatter(content, FILE);
    expect(frontmatter.name).toBe('bom-skill');
  });
});
