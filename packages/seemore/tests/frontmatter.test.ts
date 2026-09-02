import { describe, expect, it } from 'vitest';
import { parseFrontmatter, validateFrontmatter } from '../src/node/content/frontmatter.js';

describe('parseFrontmatter', () => {
  it('reads frontmatter and returns the body separately', () => {
    const { data, content } = parseFrontmatter('---\ntitle: Hello\n---\n\n# Body\n', 'a.md');
    expect(data.title).toBe('Hello');
    expect(content.trim()).toBe('# Body');
  });

  it('tolerates a file with no frontmatter at all', () => {
    const { data } = parseFrontmatter('# Just a heading\n', 'a.md');
    expect(data.title).toBeUndefined();
  });

  it('names the file when YAML is malformed', () => {
    expect(() => parseFrontmatter('---\ntitle: [unclosed\n---\n', 'guide/broken.md')).toThrow(/guide\/broken\.md/);
  });
});

describe('validateFrontmatter', () => {
  it('accepts the documented fields', () => {
    const data = validateFrontmatter({ title: 'A', description: 'B', order: 2, icon: 'book' }, 'a.md');
    expect(data).toMatchObject({ title: 'A', description: 'B', order: 2, icon: 'book' });
  });

  it('passes unknown keys through untouched', () => {
    const data = validateFrontmatter({ title: 'A', author: 'me', tags: ['x'] }, 'a.md');
    expect(data.author).toBe('me');
    expect(data.tags).toEqual(['x']);
  });

  it('names both the file and the field on a type error', () => {
    let message = '';
    try {
      validateFrontmatter({ title: 42 }, 'guide/deep/page.md');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('guide/deep/page.md');
    expect(message).toContain('title');
  });

  it('rejects a non-numeric order, naming the field', () => {
    expect(() => validateFrontmatter({ order: 'first' }, 'a.md')).toThrow(/order/);
  });

  it('accepts draft as a boolean', () => {
    expect(validateFrontmatter({ draft: true }, 'a.md').draft).toBe(true);
  });
});
