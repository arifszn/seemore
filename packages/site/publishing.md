---
title: Publishing
description: Export a static site you can host anywhere.
order: 4
---

# Publishing

```bash
npx seemore build  # static export to dist/ for any host
```

The result is a `dist/` folder of plain web files: drop it on [Netlify](https://netlify.com), [Surge](https://surge.sh), [Cloudflare Pages](https://pages.cloudflare.com) or [GitHub Pages](https://pages.github.com), or hand it to any web host.

**On GitHub Pages:** project sites live under `username.github.io/my-repo/`, not the root, so set `base` once:

```ts
export default defineConfig({ base: '/my-repo/' });
```

(or `--base /my-repo/` on the CLI). Building under GitHub Actions without it set prints the exact line to add.

This site is built exactly this way — see its [`seemore.config.ts`](https://github.com/arifszn/seemore/blob/main/packages/site/seemore.config.ts) and the [features](./features.md) page for what publishing gets you by default.
