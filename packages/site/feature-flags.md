---
title: Feature flags
description: Every switch on the features key, with its default.
---

# Feature flags

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
| `content.action.edit` | on with `editLink` | "Edit this page" link. See [Edit link](./configuration.md#edit-link) |
| `content.edit` | on | [Inline editing](./live-preview.md#inline-editing) in the live preview. Never part of a build |
| `content.image.zoom` | on | Click-to-zoom on content images |
| `search.suggest` | on | Inline query completion |
| `search.highlight` | on | Highlight the query on the page you land on |
| `social.cards` | off | A preview image for every page. See [Social cards](./publishing.mdx#social-cards). Cannot be combined with `auth` |

A combination that cannot work stops seemore with a config error that names both flags and the fix. To use `toc.integrate`, also set `'toc.follow': false`. `social.cards` cannot be used with [password protection](./publishing.mdx#password-protection), because social cards are public images.
