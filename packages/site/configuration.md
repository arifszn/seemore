---
title: Configuration
description: seemore.config.ts, and the twelve built-in themes.
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
  search: 'static',
  exclude: ['drafts/**'],
});
```

## Themes

Twelve built-in colour presets: `neutral` (default), `black`, `catppuccin`, `dusk`, `ocean`, `purple`, `ruby`, `solar`, `aspen`, `emerald`, `vitepress`, `shadcn`. For anything else, put your own CSS in `css`; it's appended last, so it wins. Dark and light follow your system setting, with a toggle that remembers your choice.

See the [features](./features.md) page for the full list of feature flags.
