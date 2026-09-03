---
title: Features
description: What you get by default, and the switches to change it.
order: 8
---

# Features

Every page arrives with its full text already in it, no placeholder or loading skeleton. Pages start loading as soon as you point at a link, and page transitions animate, without giving up the plain-files output described under [publishing](./publishing.md). Add, rename, retitle, reorder or delete a file and the running preview updates immediately: no restart, no full reload.

Search works out of the box with no server to run and nothing to pay for; if your site grows past what a no-server search index can carry, the build tells you and points at alternatives. If your site lives under a path like `example.com/my-repo/` rather than the root, set `base` once and links, search and assets all follow. Since the build is just ordinary files, publishing means dropping that folder on any host; the few conventions individual hosts look for are written for you automatically.

## Edit from the page

While the preview is running, the page is also an editor. Double-click any paragraph, heading, list item, quote or table cell and it opens in place with that block's **Markdown source** — `**bold**` stays `**bold**`, links stay links. Fix the text and hit **Save** (`Ctrl+Enter` / `Cmd+Enter`, with `Esc` to cancel); the change is written straight back to the file, and the page hot-reloads exactly as it does for an edit made in your editor. Nothing is written until you say so: clicking away keeps the editor open.

The write is surgical. Each block carries its exact character range in the source file, and a save replaces exactly those characters — the rest of the file is left byte for byte as it was, so a diff shows the sentence you changed and nothing else. Line endings are preserved, and if the file changed since the page was rendered, the save is refused with a reload prompt rather than clobbering the newer text.

It works the same in the [code editor extension](./code-editor.md), whose panel runs the same dev server.

Two limits, both deliberate. It is dev only — `seemore build` output is static, with no server to write through. And content seemore rebuilds wholesale — code fences, Mermaid and D2 diagrams — has no source range to write back to, so double-clicking it does nothing. Constructs where only the *wrapper* is generated, such as GitHub alerts and steps, stay editable inside; the editor shows their raw source, `[!NOTE]` marker and `>` prefixes included, because that is literally what the file says.

> [!NOTE]
> The dev server binds to localhost, so only your machine can reach the endpoint that writes. If you serve the site to your network with `--host`, anyone who can open the site can also edit your files — pass `features: ['!content.edit']` when you do that.

## Diagrams

A ` ```mermaid ` or ` ```d2 ` code fence renders live in the browser, no build step or external service.

**Mermaid**

```mermaid
graph TD;
  A[Markdown] --> B[seemore];
  B --> C[Static site];
```

**D2**

```d2
Markdown -> seemore -> Static site
```

## Image zoom

Click any content image to zoom in, on by default. Turn it off with `!content.image.zoom`.

![placeholder](https://dummyimage.com/1600x4:3/)

## Feature flags

A flat list of switches for readers who want fine control, set as an array on the `features` key in `seemore.config.ts`. To turn on something that's off by default, add its flag name. To turn off something that's on by default, add its flag name prefixed with `!`.

```ts
// seemore.config.ts
export default defineConfig({
  features: [
    'navigation.path',              // off by default → this turns it on
    '!navigation.instant.prefetch', // on by default → this turns it off
  ],
});
```

Flags you don't mention are left at their default, so you only ever list the ones you're changing.

| Flag | Default | Effect |
| --- | --- | --- |
| `navigation.instant.prefetch` | on | Load the target page on hover |
| `navigation.instant.preview` | off | Hover popover showing the target page |
| `navigation.footer` | on | Previous and next links |
| `navigation.top` | on | Back-to-top button |
| `navigation.path` | off | Breadcrumbs |
| `navigation.sections` | off | Top-level entries as sidebar groups |
| `navigation.prune` | off | Render only the visible subtree |
| `toc.follow` | on | Keep the active heading visible |
| `toc.integrate` | off | Merge the table of contents into the sidebar |
| `content.code.copy` | on | Copy button on code blocks |
| `content.action.edit` | on with `editLink` | Edit-this-page link |
| `content.edit` | on (dev only) | Double-click a block to edit its Markdown in place |
| `content.image.zoom` | on | Click-to-zoom on content images |
| `search.suggest` | on | Inline query completion |
| `search.highlight` | on | Highlight the query on the page you land on |
| `social.cards` | off | Per-page OG images (needs `takumi-js`) |

Combinations that can't work together raise a config error naming both flags and the fix.
