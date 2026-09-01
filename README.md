# seemore

Let AI write the Markdown. Let seemore show it better.

[![npm version](https://img.shields.io/npm/v/@arifszn%2Fseemore)](https://www.npmjs.com/package/seemore)
[![CI](https://github.com/arifszn/seemore/actions/workflows/ci.yml/badge.svg)](https://github.com/arifszn/seemore/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-informational)](LICENSE)

AI tools write Markdown — specs, notes, guides, READMEs, whole folders of it, faster than
anyone can read. A pile of `.md` files is write-only memory: nothing to click, nothing to
search, no order.

seemore is the other half. Point it at a folder that already exists and read it in your
browser instead — every file rendered, with navigation, search and a clean reading
layout. You don't move the files, you don't write any code, and there is nothing to set
up.

```bash
npx seemore     # see the current folder in your browser, live, no setup
npx seemore build  # static export to dist/ for any host
```

## Getting started

1. Open a terminal in your folder of Markdown files.
2. Run `npx seemore`, then open the address it prints —
   `http://localhost:4040` by default — in your browser.

From there it's live: every file you add, rename, retitle or delete is reflected
immediately, navigation included. When you're happy, `npx seemore build`
produces a folder
of ordinary web files you can put on any host (more on that under
[Publishing](#publishing)).

With no folder given, seemore serves the folder you are standing in. Point it at a
subfolder with `npx seemore docs` if that's where your files live.

## What you get by default

- **Real pages in your browser, not a placeholder.** Every page arrives with its full
  text already in it — nothing waits on JavaScript, and what you see is what a search
  engine sees. A test asserts it.
- **Fast, app-like browsing.** Pages start loading when you point at a link, and page
  changes animate smoothly — without giving up the plain-files output above.
- **A preview that keeps up.** Add, rename, retitle, reorder or delete a file and the
  site updates instantly — no restart, no full page reload.
- **Search built in.** The whole site is searchable out of the box, with no server to run
  and nothing to pay for. If your site grows past what a no-server search can carry, the
  build says so and points at the alternatives.
- **Sub-folder sites that work.** If your site lives at `example.com/my-repo/` instead of
  the root, set `base` once and links, search and assets all follow. A test builds the
  site under a sub-folder and asserts nothing leaks.
- **Publish anywhere.** The build is a folder of ordinary files — no special server
  setup. The few conventions individual hosts look for are written for you.

## Content

`.md` and `.mdx` alike, with the format inferred per file, so plain Markdown never needs
MDX syntax.

- GitHub Flavoured Markdown, admonitions (note / tip / warning boxes), step-by-step
  lists, and colour-highlighted code blocks
- `[[wikilinks]]`, including `[[Page|label]]` and `[[Page#Heading]]` — the easiest way
  for you or your AI to link pages, with no relative paths to get right
- Relative `.md` links are resolved to working links automatically
- Mermaid diagrams, rendered in the browser
- Sibling images inlined as hashed assets, sibling PDFs open in the browser's own viewer
- Frontmatter (the `key: value` block at the top of a file) is validated, with errors
  that name the file and the field

### Page addresses

| File | Address |
| --- | --- |
| `index.md` | `/` |
| `README.md` (root) | `/` |
| `getting-started.md` | `/getting-started` |
| `guide/index.md` | `/guide` |
| `guide/Deep Dive.md` | `/guide/deep-dive` |

Both `/guide` and `/guide/` work on every host.

### Ordering

Pages are ordered by:

1. `meta.json` in the directory
2. Frontmatter `order`
3. Alphabetical by title

## Configuration

Optional. A folder with no config file builds correctly. If you want to adjust things,
create `seemore.config.ts` next to your content:

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

### Themes

Eleven built-in colour presets: `neutral` (default), `black`, `catppuccin`, `dusk`,
`ocean`, `purple`, `ruby`, `solar`, `aspen`, `emerald`, `shadcn`. For anything else, put
your own CSS in `css` — it is appended last and wins. Dark and light follow your system
setting, with a toggle that remembers your choice.

### Features

A flat list of switches for readers who want fine control. Prefix one with `!` to switch
off something that is on by default.

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
| `search.suggest` | on | Inline query completion |
| `search.highlight` | on | Highlight the query on the page you land on |
| `social.cards` | off | Per-page OG images (needs `takumi-js`) |

Combinations that cannot work are a config error naming both flags and the fix.

## Publishing

```bash
npx seemore build
```

The result is a `dist/` folder of plain web files — drop it on
[Netlify](https://netlify.com), [Surge](https://surge.sh),
[Cloudflare Pages](https://pages.cloudflare.com) or
[GitHub Pages](https://pages.github.com), or hand it to any web host. Every page is its
own file, so no host needs special rules to serve a deep link, and reloading after moving
around the site works everywhere. Alongside the pages, seemore writes the few conventions
individual hosts look for:

| File | Read by |
| --- | --- |
| `404.html` | GitHub Pages, Netlify, Cloudflare Pages, Vercel, S3 |
| `_redirects` | Netlify, Cloudflare Pages |
| `200.html` | Surge |
| `.nojekyll` | GitHub Pages — without it, Jekyll drops every path starting with `_` |

None of these are required for a host that is not listed. If yours serves a folder of
files, it serves a seemore build.

**GitHub Pages, one thing to know:** project sites live at
`username.github.io/my-repo/`, not at the root. Tell seemore once:

```ts
export default defineConfig({ base: '/my-repo/' });
```

or `seemore build --base /my-repo/`. Under GitHub Actions with no `base` set, the build
prints the exact line to add.

## Command reference

```
seemore [dir]           start the live preview
seemore build [dir]     static export into dist/

  --port <number>      preview server port (default 4040)
  --host [host]        expose the preview server on the network
  --open / --no-open   open a browser on start (default: no)
  --config <path>      path to seemore.config.ts
  --out <dir>          build output directory (default: dist)
  --base <path>        subpath the site is served from
```

## What seemore is not

seemore shows folders of Markdown in your browser and exports them for hosting — that's
all it does. It is not a general site builder, not a CMS, and not a place to build
custom web apps.
Multi-version docs, translations, and opening the site by double-clicking a file on disk
are out of scope.

## Under the hood

Built in the open on open tools: [fumadocs](https://fumadocs.vercel.app) provides the
interface presets, with [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org),
[Vite](https://vite.dev) and [React Router](https://reactrouter.com) underneath. Bug
reports and pull requests are welcome at
[github.com/arifszn/seemore](https://github.com/arifszn/seemore).

## Licence

[MIT](LICENSE)
