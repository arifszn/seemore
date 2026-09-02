---
title: Publishing
description: Export a static site you can host anywhere.
order: 4
---

# Publishing

```bash
npx seemore build  # static export to dist/ for any host
```

The result is a `dist/` folder of plain web files: drop it on [Netlify](https://netlify.com), [Surge](https://surge.sh), [Cloudflare Pages](https://pages.cloudflare.com) or [GitHub Pages](https://pages.github.com), or hand it to any web host. Every page is its own file, so deep links and reloads work everywhere without special host rules. seemore also writes the handful of files individual hosts look for:

| File | Read by |
| --- | --- |
| `404.html` | GitHub Pages, Netlify, Cloudflare Pages, Vercel, S3 |
| `_redirects` | Netlify, Cloudflare Pages |
| `200.html` | Surge |
| `.nojekyll` | GitHub Pages, so Jekyll doesn't drop every path starting with `_` |

None of these are required for a host that isn't listed above. If your host serves a folder of files, it serves a seemore build.

**GitHub Pages, one thing to know:** project sites live at `username.github.io/my-repo/`, not at the root. Tell seemore once:

```ts
export default defineConfig({ base: '/my-repo/' });
```

or `seemore build --base /my-repo/`. Under GitHub Actions with no `base` set, the build prints the exact line to add.

This site is built exactly this way — see its [`seemore.config.ts`](https://github.com/arifszn/seemore/blob/main/packages/site/seemore.config.ts) and the [features](./features.md) page for what publishing gets you by default.
