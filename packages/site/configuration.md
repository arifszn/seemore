---
title: Configuration
description: seemore.config.ts, and every option it takes.
order: 6
---

# Configuration

Optional — a folder with no config file builds correctly in the browser, in your code editor, and when built for publishing. To adjust things, create `seemore.config.ts` next to your content:

```ts
// seemore.config.ts
import { defineConfig } from 'seemore';

export default defineConfig({
  title: 'My Docs',
  description: 'Everything about the thing.',
  favicon: './favicon.svg',
  base: '/my-repo/',
  theme: 'ocean',
  css: './custom.css',
  features: ['navigation.path', 'navigation.instant.preview'],
  nav: [{ text: 'GitHub', link: 'https://github.com/you/repo' }],
  footer: { text: '© 2026' },
  editLink: { base: 'https://github.com/you/repo/edit/main/docs' },
  search: 'static', // or { provider: 'orama-cloud', endpoint, apiKey } / { provider: 'algolia', appId, apiKey, indexName }
  exclude: ['drafts/**'],
});
```

`theme` picks one of the twelve built-in colour presets — see the [Themes](./themes.md) page for screenshots of each. For anything else, put your own CSS in `css`; it's appended last, so it wins. See the [features](./features.md) page for the full list of feature flags.

## Search

The default `search: 'static'` needs no setup, no server and no account: the index is built from your Markdown and queried in the browser, in a Web Worker. `search.suggest` completes your query inline, and `search.highlight` carries the query onto the page you land on (`?h=…`), so search-result links are shareable.

Hosted indexes are a drop-in swap whenever you want one: [Orama Cloud](https://orama.com) (`@orama/core`) or [Algolia](https://algolia.com) (`algoliasearch`), each needing nothing but its SDK installed:

```ts
search: { provider: 'algolia', appId: '…', apiKey: '…', indexName: '…' },
```
