---
title: Configuration
description: seemore.config.ts, and every option it takes.
order: 6
---

# Configuration

Optional. A folder with no config file builds correctly in the browser, in VS Code, and when built for publishing. If you want to adjust things, create `seemore.config.ts` next to your content:

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

`theme` picks one of the twelve built-in colour presets — see the [Themes](./themes.md) page for screenshots of each. For anything else, put your own CSS in `css`; it's appended last, so it wins.

See the [features](./features.md) page for the full list of feature flags.
