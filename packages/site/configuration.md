---
title: Configuration
description: seemore.config.ts, and every option it takes.
order: 6
---

# Configuration

Configuration is optional. A folder with no config file builds correctly in the browser, in your code editor, and when built for publishing. To change settings, create `seemore.config.ts` next to your content:

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  description: 'Everything about the thing.',
  favicon: './favicon.svg',
  base: '/my-repo/',
  theme: 'ocean',
  css: './custom.css',
  features: { 'navigation.path': true, 'navigation.instant.preview': true },
  nav: [{ text: 'GitHub', link: 'https://github.com/you/repo' }],
  footer: { text: '© 2026' },
  editLink: { base: 'https://github.com/you/repo/edit/main/docs' },
  search: 'static', // or { provider: 'orama-cloud', endpoint, apiKey } / { provider: 'algolia', appId, apiKey, indexName }
  pageActions: ['copy-markdown', 'export-html'],
  exclude: ['drafts/**'],
  include: ['.notes'], // dot folders, build/, dist/ and similar are skipped unless listed here
  auth: true,
};
```

`theme` picks one of the twelve built-in colour presets. See the [Themes](./themes.md) page for screenshots of each. For anything else, put your own CSS in `css`. seemore appends it last, so it wins. See the [features](./features.md) page for the full list of feature flags.

## Which files are included

Every `.md` and `.mdx` file under the content folder becomes a page, except in folders that are almost never documentation: dot folders such as `.github`, `node_modules`, `dist`, `build`, `out`, `vendor`, `target`, `venv`, `deps`, `Pods` and `bower_components`.

`exclude` skips more, using glob patterns relative to the content folder. `include` brings back something those defaults skip, as a folder name or a glob. `exclude` still wins over `include`:

```ts
exclude: ['drafts/**'],
include: ['.notes', 'build/reports/**'],
```

This only applies inside the content folder. Running `npx seemore .github/docs` works without any config.

## Search

The default `search: 'static'` needs no setup, no server and no account. seemore builds the index from your Markdown and queries it in the browser, in a Web Worker. `search.suggest` completes your query inline. `search.highlight` carries the query onto the page you land on (`?h=…`), so search-result links are shareable.

Hosted indexes are a drop-in swap whenever you want one: [Orama Cloud](https://orama.com) (`@orama/core`) or [Algolia](https://algolia.com) (`algoliasearch`). Each needs only its own SDK installed:

```ts
search: { provider: 'algolia', appId: '…', apiKey: '…', indexName: '…' },
```

Hosted search cannot be combined with `auth`: the provider would receive the page text in plain text.

## Page actions

`pageActions` decides what the Actions button above every page holds, in order. The default is
both actions. An empty array removes the button:

```ts
pageActions: ['copy-markdown', 'export-html'],  // the default
```

The [features](./features.md) page explains what each action does, and everything an exported
file keeps. The [CLI reference](./cli-reference.md) page covers the CLI equivalent.

## Password protection

`auth` protects the whole built site with one password. Set the password in the
`SEEMORE_PASSWORD` environment variable when you build. Do not put it in this file.

```ts
auth: true,                                    // remember for 1 day
auth: { remember: '7d' },                      // '12h' or '7d'
auth: { id: 'acme-handbook', remember: '7d' }, // keep access after changing the site title
```

Setup and limits are on the [publishing](./publishing.mdx#password-protection) page.
