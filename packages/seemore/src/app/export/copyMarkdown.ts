import { preloadPage } from '../lib/pages.js';

/**
 * Copy the page you are reading as Markdown.
 *
 * The Markdown is not reconstructed from the DOM, and no second copy of the content is
 * fetched: `remark-llms` stringifies the page during the MDX compile and writes the result
 * to a named export (see `MARKDOWN_EXPORT` in `node/vite/mdx.ts`), which rides along in the
 * same module the router already imports to render the page. By the time this runs that
 * module is on screen, so `preloadPage` is a cache hit and the copy is synchronous in
 * practice.
 *
 * The trade is payload: every page ships its own source alongside its compiled form. That
 * buys a copy that matches what the author wrote — `.mdx` components included, as JSX —
 * rather than a lossy walk over rendered HTML.
 */
export async function copyPageAsMarkdown(url: string): Promise<void> {
  const page = await preloadPage(url);
  const markdown = page?._markdown;
  if (markdown === undefined || markdown.trim() === '') {
    throw new Error('There is no Markdown source for this page.');
  }

  // Emptying the frontmatter node leaves the blank lines that followed it.
  await writeToClipboard(`${markdown.trim()}\n`);
}

/**
 * `navigator.clipboard` needs a secure context, which `file://` pages and some editor
 * webviews are not. The deprecated `execCommand` path is the only thing that works there,
 * and it needs a real selection over a live element, so the textarea has to be in the
 * document and visible enough to focus.
 */
async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard !== undefined && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission refused or the document was not focused; fall through.
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();

  try {
    if (!document.execCommand('copy')) throw new Error('The browser refused the copy.');
  } finally {
    area.remove();
  }
}
