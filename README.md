# openmd

Point it at a folder of Markdown. Get a docs site.

```bash
npx openmd              # dev server on the current folder, live reload, zero config
npx openmd build        # static export to dist/ for Netlify, Surge or GitHub Pages
```

**Fumadocs, without the app.**

Fumadocs already runs without Next.js, and already supports static hosting. Neither is the
gap. The gap is that Fumadocs and VitePress make you scaffold an app, wire routes, configure
a content source, and get prerender, search and base path right yourself. Get one of them
wrong and you ship a blank SPA shell that builds fine, deploys fine, and breaks on the first
click.

openmd points at a folder that already exists and makes the correct static build the default.
Dev mode writes nothing into your folder. `openmd build` writes only `dist/`.

## What you get by default

- **Real HTML, not a shell.** Every route is prerendered to its own `index.html`. Fetch a
  deep route with JavaScript disabled and the full page text is there. A test asserts it.
- **A client router after hydration.** Hover prefetch and view transitions, without giving up
  the static output.
- **Live reload that includes the sidebar.** Create, rename, retitle, reorder or delete a
  file and the navigation follows, with no restart and no full page reload.
- **Search with no server.** A static index, parsed and queried in a web worker. If it grows
  past 1.5 MB gzipped, the build tells you and points at the hosted alternatives.
- **Base paths that actually work.** Set `base` once and the router, assets, search index,
  links and host fallbacks all agree. A test builds under `/sub/` and asserts nothing leaks.
- **Works on any static host.** Every route is a real file, so nothing depends on server
  config. The host-specific fallback conventions are written for you.

## Content

`.md` and `.mdx` alike, with the format inferred per file, so plain Markdown never needs MDX
syntax.

- GitHub Flavoured Markdown, admonitions, steps, and Shiki highlighting done at build time
- `[[wikilinks]]`, including `[[Page|label]]` and `[[Page#Heading]]`
- Relative `.md` links resolved to real routes
- Mermaid diagrams, rendered in the browser
- Sibling images inlined as hashed assets, sibling PDFs in the browser's own viewer
- Frontmatter validated with zod, with errors that name the file and the field

### URLs

| File | URL |
| --- | --- |
| `index.md` | `/` |
| `README.md` (root) | `/` |
| `getting-started.md` | `/getting-started` |
| `guide/index.md` | `/guide` |
| `guide/Deep Dive.md` | `/guide/deep-dive` |

Directory-style output, so both `/guide` and `/guide/` work on every host.

### Ordering

1. `meta.json` in the directory
2. Frontmatter `order`
3. Alphabetical by title

## Configuration

Optional. A folder with no config file builds correctly.

```ts
// openmd.config.ts
import { defineConfig } from 'openmd';

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

One of the colour presets fumadocs ships: `neutral` (default), `black`, `catppuccin`,
`dusk`, `ocean`, `purple`, `ruby`, `solar`, `aspen`, `emerald`, `shadcn`. Anything else goes
in `css`, which is appended last and wins. Dark and light follow
`prefers-color-scheme`, with a toggle that remembers your choice.

### Features

A flat list of flags. Prefix one with `!` to switch off something that is on by default.

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

## Base paths

GitHub Pages serves project sites from a subpath, and getting this wrong is the classic way
to ship a broken site. `base` is never guessed:

```ts
export default defineConfig({ base: '/my-repo/' });
```

or `openmd build --base /my-repo/`. Under GitHub Actions with no `base` set, the build prints
the exact line to add.

## CLI

```
openmd [dir]           start the dev server
openmd build [dir]     build a static site into dist/

  --port <number>      dev server port
  --host [host]        expose the dev server on the network
  --open / --no-open   open a browser on start (default: no)
  --config <path>      path to openmd.config.ts
  --out <dir>          build output directory (default: dist)
  --base <path>        subpath the site is served from
```

With no `dir`, openmd looks for `docs/`, then `content/`, then uses the current folder.

## Deploying

```bash
openmd build
npx surge dist          # or drop dist/ on Netlify, or push it to gh-pages
```

`dist/` is plain static files. Every route is its own `index.html`, so no host needs a
rewrite rule to serve a deep link, and reloading after a client-side navigation works
everywhere. Alongside that, openmd writes the conventions individual hosts look for:

| File | Read by |
| --- | --- |
| `404.html` | GitHub Pages, Netlify, Cloudflare Pages, Vercel, S3 |
| `_redirects` | Netlify, Cloudflare Pages |
| `200.html` | Surge |
| `.nojekyll` | GitHub Pages — without it, Jekyll drops every path starting with `_` |

Nothing here is required for a host that is not listed. If yours serves a directory of files,
it serves an openmd build.

For GitHub Pages, remember `base`. That is the one setting no host can infer for you.

## What openmd is not

Not a React framework, not a CMS, not a general static site generator. Multi-version docs,
i18n, and `file://` browsing are out of scope. You cannot pass your own React components for
the shell — the moment you can, you need a build of your own, which is the thing openmd
exists to avoid.

## Licence

MIT
