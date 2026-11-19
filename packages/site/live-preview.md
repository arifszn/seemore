---
title: Live preview and editing
description: The site follows your files as they change, and the page itself is an editor.
---

# Live preview and editing

The live preview is the site seemore serves while you work: `npx seemore` in a terminal, a window in the [desktop app](./desktop-app.mdx), or the panel in the [code editor extension](./code-editor-extension.md). All three run the same server, so everything on this page works in each of them.

## What updates live

seemore watches the folder. You do not restart anything or reload the page:

- Edit a page, and its content changes in place.
- Add, rename or delete a file, and the sidebar and search follow.
- Change a page's `title` or `order` in its frontmatter, and the sidebar re-sorts.
- Change `seemore.config.ts`, and the page reloads with the new settings.

This makes the preview a good place to read what an AI agent is writing, as it writes it.

A content error, such as invalid frontmatter, shows as a warning and the preview keeps running. Fix the file and the page recovers.

Pages with `draft: true` in their frontmatter show in the preview but are left out of `seemore build`.

## Inline editing

The page in the preview is also an editor. Double-click any paragraph, heading, list item, quote or table cell, and it opens in place with that block's **Markdown source**: `**bold**` stays `**bold**`, links stay links, tables stay tables.

![A seemore page in a browser window, with a paragraph open in the inline editor showing its Markdown source, next to the words: Double-click a paragraph, fix it, Save.](./assets/inline-editor.png)

Fix the text and press **Save**. seemore writes the change to the file, and the page updates exactly as it does for an edit made in your editor.

- seemore writes nothing until you press **Save**. Clicking away closes the editor without saving. Once you have typed something, the editor stays open rather than discarding your text.
- To add text to the end of the file, double-click below the last block, or anywhere on an empty page.
- Inline editing works only in the live preview. A site built with `seemore build` is static and has no editor.

To turn it off, set the `content.edit` [feature flag](./feature-flags.md):

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  features: { 'content.edit': false },
};
```
