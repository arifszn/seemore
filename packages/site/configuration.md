---
title: Configuration
description: seemore.config.ts, and every option it takes.
---

# Configuration

Configuration is optional. A folder with no config file works in the browser, in your code editor and as a static build. To change settings, create `seemore.config.ts` next to your content:

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  description: 'Everything about the thing.',
  theme: 'ocean',
  base: '/my-repo/',
};
```

Once a config file exists, `title` is required. Every other option is optional. The dev server reloads the page when the file changes.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `title` | `'Docs'` without a config file | Site name in the header, the browser tab and social cards |
| `description` | none | Site description, used as the meta description of pages without their own |
| `favicon` | the seemore icon | The site icon |
| `theme` | `'neutral'` | One of the twelve [themes](./themes.md) |
| `css` | none | Path to a CSS file added after everything else, so its rules win. See [Custom CSS](./themes.md#custom-css) |
| `base` | `'/'` | Subpath the site is served from, such as `'/my-repo/'`. See [Base path](./publishing.mdx#base-path) |
| `url` | none | Origin the site is served from, such as `'https://you.github.io'`. Turns on `sitemap.xml` and makes social card URLs absolute. See [Sitemap](./publishing.mdx#sitemap) |
| `nav` | none | Links in the header: `[{ text: 'GitHub', link: 'https://github.com/you/repo' }]` |
| `footer` | none | A footer below every page. See [Site footer](#site-footer) |
| `editLink` | none | Adds an "Edit this page" link. See [Edit link](#edit-link) |
| `features` | see [Feature flags](#feature-flags) | Switches for navigation, table of contents, code blocks, search and more |
| `search` | `'static'` | Search provider. See [Search](#search) |
| `pageActions` | `['copy-markdown', 'export-html']` | Actions in the button above each page. See [Page actions](#page-actions) |
| `exclude` | `[]` | Glob patterns to skip. See [Which files are included](#which-files-are-included) |
| `include` | `[]` | Folders or globs to bring back from the default skips |
| `auth` | off | Password protection for the built site. See [Password protection](#password-protection) |

A complete config, for reference:

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  description: 'Everything about the thing.',
  favicon: './favicon.svg',
  base: '/my-repo/',
  url: 'https://you.github.io',
  theme: 'ocean',
  css: './custom.css',
  features: { 'navigation.path': true, 'navigation.instant.preview': true },
  nav: [{ text: 'GitHub', link: 'https://github.com/you/repo' }],
  footer: { text: '© 2026' },
  editLink: { base: 'https://github.com/you/repo/edit/main/docs' },
  search: 'static',
  pageActions: ['copy-markdown', 'export-html'],
  exclude: ['drafts/**'],
  include: ['.notes'],
  auth: true,
};
```

A mistake in the config, such as an unknown theme or two feature flags that cannot be combined, stops seemore with a message that names the option and the fix.

## Feature flags

Feature flags turn parts of the interface on or off. Set them on the `features` key in `seemore.config.ts`. Name only the flags you are changing, `true` to turn one on and `false` to turn it off. Every other flag keeps its default.

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  features: {
    'navigation.path': true,               // off by default → this turns it on
    'navigation.instant.prefetch': false,  // on by default → this turns it off
  },
};
```

| Flag | Default | Effect |
| --- | --- | --- |
| `navigation.instant.prefetch` | on | Load the target page when the pointer is over a link |
| `navigation.instant.preview` | off | Show a preview of the target page in a popover. Needs `navigation.instant.prefetch` |
| `navigation.footer` | on | Previous and next page links. The `footer` option controls the site footer |
| `navigation.top` | on | Back-to-top button |
| `navigation.path` | off | Breadcrumbs |
| `navigation.sections` | off | Top-level entries as sidebar groups |
| `navigation.prune` | off | Render only the visible part of the sidebar, for large sites |
| `toc.follow` | on | Keep the active heading visible in the table of contents |
| `toc.integrate` | off | Merge the table of contents into the sidebar. Cannot be combined with `toc.follow` |
| `content.code.copy` | on | Copy button on code blocks |
| `content.action.edit` | on with `editLink` | "Edit this page" link. See [Edit link](#edit-link) |
| `content.edit` | on | [Inline editing](./live-preview.md#inline-editing) in the live preview. Never part of a build |
| `content.image.zoom` | on | Click-to-zoom on content images |
| `search.suggest` | on | Inline query completion |
| `search.highlight` | on | Highlight the query on the page you land on |
| `social.cards` | off | A preview image for every page. Needs `url`. See [Social cards](./publishing.mdx#social-cards). Cannot be combined with `auth` |

A combination that cannot work stops seemore with a config error that names both flags and the fix. To use `toc.integrate`, also set `'toc.follow': false`. `social.cards` cannot be used with [password protection](./publishing.mdx#password-protection), because social cards are public images.

## Which files are included

Every `.md`, `.markdown` and `.mdx` file under the content folder becomes a page, except in folders that are almost never documentation: dot folders such as `.github`, `node_modules`, `dist`, `build`, `out`, `vendor`, `target`, `venv`, `deps`, `Pods` and `bower_components`.

`exclude` skips more, using glob patterns relative to the content folder. `include` brings back something those defaults skip, as a folder name or a glob. `exclude` still wins over `include`:

```ts
exclude: ['drafts/**'],
include: ['.notes', 'build/reports/**'],
```

This only applies inside the content folder. Running `npx seemore .github/docs` works without any config.

## Search

The default `search: 'static'` needs no setup, no server and no account. seemore builds the index from your Markdown and queries it in the browser, in a Web Worker. `search.suggest` completes your query inline. `search.highlight` carries the query onto the page you land on (`?h=…`), so search-result links are shareable.

If the index grows past 1.5 MB gzipped, the build warns and names the alternatives: [Orama Cloud](https://orama.com) (`@orama/core`) or [Algolia](https://algolia.com) (`algoliasearch`). Each needs only its own SDK installed:

```ts
search: { provider: 'algolia', appId: '…', apiKey: '…', indexName: '…' },
search: { provider: 'orama-cloud', endpoint: '…', apiKey: '…' },
```

Hosted search cannot be combined with `auth`: the provider would receive the page text in plain text.

## Page actions

`pageActions` decides what the Actions button above every page holds, in order. The default is
both actions. An empty array removes the button:

```ts
pageActions: ['copy-markdown', 'export-html'],  // the default
```

[Share a single page](./publishing.mdx#share-a-single-page) explains what each action does.

## Edit link

`editLink` adds an "Edit this page" link to every page. `base` is the URL the page's path is added to:

```ts
editLink: { base: 'https://github.com/you/repo/edit/main/docs' },
editLink: { base: 'https://github.com/you/repo/edit/main/docs', text: 'Suggest a change' },
```

## Site footer

`footer` adds a footer below every page. `text` is one line of text. `links` is a list of links
after the text. Both are optional. If you do not set `footer`, the site has no footer:

```ts
footer: {
  text: '© 2026 Acme',
  links: [{ text: 'GitHub', link: 'https://github.com/you/repo' }],
},
```

## Password protection

`auth` protects the whole built site with one password. Set the password in the
`SEEMORE_PASSWORD` environment variable when you build. Do not put it in this file.

```ts
auth: true,                                    // remember for 1 day
auth: { remember: '7d' },                      // '12h' or '7d'
auth: { id: 'acme-handbook', remember: '7d' }, // keep access after changing the site title
```

Setup is on the [publishing](./publishing.mdx#password-protection) page.
