import matter from 'gray-matter';
import { z } from 'zod';

/**
 * Frontmatter is validated, not restricted: unknown keys pass through so that a corpus
 * written for another tool still builds. Only the keys seemore acts on are typed.
 */
export const frontmatterSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    /** Sidebar ordering, second only to `meta.json`. */
    order: z.number().optional(),
    /**
     * Excluded from the build. Dev keeps drafts so they can be written, so a link to one
     * works while you write it and warns as a dead link when you build.
     */
    draft: z.boolean().optional(),
  })
  .loose();

export type FrontmatterData = z.output<typeof frontmatterSchema> & Record<string, unknown>;

/** Split a source file into validated frontmatter and body. `file` is only for messages. */
export function parseFrontmatter(source: string, file: string): { data: FrontmatterData; content: string } {
  let parsed;
  try {
    parsed = matter(source);
  } catch (error) {
    throw new Error(
      `Invalid frontmatter in ${file}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      { cause: error },
    );
  }

  return { data: validateFrontmatter(parsed.data, file), content: parsed.content };
}

export function validateFrontmatter(data: unknown, file: string): FrontmatterData {
  const result = frontmatterSchema.safeParse(data ?? {});
  if (result.success) return result.data as FrontmatterData;

  const issues = result.error.issues.map((issue) => {
    const field = issue.path.length === 0 ? '(root)' : issue.path.join('.');
    return `  - ${field}: ${issue.message}`;
  });
  throw new Error(`Invalid frontmatter in ${file}:\n${issues.join('\n')}`);
}
