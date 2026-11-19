---
title: Themes
description: The twelve built-in colour presets, and how to add your own CSS.
---

# Themes

seemore has twelve built-in colour presets. Set one with `theme` in [seemore.config.ts](./configuration.md):

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  theme: 'ocean',
};
```

Every theme has a light and a dark mode. The site follows the reader's system setting, with a toggle that remembers their choice. `black` is built for dark mode, and the image below shows it that way.

| `neutral` (default) | `black` |
| :--- | :--- |
| ![neutral theme](./assets/themes/neutral.png) | ![black theme](./assets/themes/black.png) |

| `catppuccin` | `dusk` |
| :--- | :--- |
| ![catppuccin theme](./assets/themes/catppuccin.png) | ![dusk theme](./assets/themes/dusk.png) |

| `ocean` | `purple` |
| :--- | :--- |
| ![ocean theme](./assets/themes/ocean.png) | ![purple theme](./assets/themes/purple.png) |

| `ruby` | `solar` |
| :--- | :--- |
| ![ruby theme](./assets/themes/ruby.png) | ![solar theme](./assets/themes/solar.png) |

| `aspen` | `emerald` |
| :--- | :--- |
| ![aspen theme](./assets/themes/aspen.png) | ![emerald theme](./assets/themes/emerald.png) |

| `vitepress` | `shadcn` |
| :--- | :--- |
| ![vitepress theme](./assets/themes/vitepress.png) | ![shadcn theme](./assets/themes/shadcn.png) |

## Custom CSS

For anything a preset does not cover, point `css` at your own stylesheet. seemore adds it after everything else, so your rules win:

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  css: './custom.css',
};
```

The themes are built on [fumadocs](https://fumadocs.dev) colour variables, named `--color-fd-*`. Override them to change a colour everywhere it is used, in light mode under `:root` and in dark mode under `.dark`:

```css title="custom.css"
:root {
  --color-fd-primary: #4f46e5;
}

.dark {
  --color-fd-primary: #a5b4fc;
}
```
