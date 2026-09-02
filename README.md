<img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/vscode/assets/icon.png" alt="seemore" width="96" height="96">

# seemore

Let AI write the Markdown. Let seemore show it better.

[![npm version](https://img.shields.io/npm/v/seemore)](https://www.npmjs.com/package/seemore)
[![VS Code Marketplace](https://img.shields.io/badge/VS_Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode)
[![CI](https://github.com/arifszn/seemore/actions/workflows/ci.yml/badge.svg)](https://github.com/arifszn/seemore/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-informational)](LICENSE)
[![Website](https://img.shields.io/badge/Website-arifszn.github.io%2Fseemore-blue)](https://arifszn.github.io/seemore/)

AI tools write Markdown — specs, notes, guides, READMEs, whole folders of it, faster than
anyone can read. A pile of `.md` files is write-only memory: nothing to click, nothing to
search, no order.

seemore points at that folder and renders it as a proper site instead, without you moving a single file or writing any code.

Three ways to use it:

- **[In your browser](#view-in-your-browser)**: `npx seemore` serves the folder you're standing in and updates live as you edit.
- **[In VS Code](#view-in-vs-code)**: an extension puts the same site in a panel next to the file you're editing.
- **[As a static site](#publish-it-to-the-web)**: `npx seemore build` exports plain HTML you can host anywhere, so it doubles as a docs framework, not just a preview tool.

## View in your browser

```bash
npx seemore     # view the current folder in your browser, live, no setup
```

Open a terminal in your folder of Markdown files, run `npx seemore`, and open the address it prints (`http://localhost:4040` by default). From there it's live: add, rename, retitle or delete a file and the site updates immediately, navigation included.

With no folder given, seemore serves the folder you're standing in. Point it at a subfolder with `npx seemore docs` if that's where your files live.

## View in VS Code

Install [seemore for VS Code](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode) to get the same rendered site as a panel beside your editor. No terminal, no `npx`, no browser tab to manage.

1. Open any Markdown file.
2. Click the seemore icon in the editor's title bar, or right-click a folder in the explorer and choose **Open Folder in seemore**.
3. The rendered site opens beside your editor, scoped to that file's folder.

### Commands

| Command | Where | Does |
| --- | --- | --- |
| **Open in seemore** | Editor title bar, on any Markdown file | Renders that file's folder as a site |
| **Open Folder in seemore** | Explorer, right-click a folder | Renders that folder as a site and pins it as the root |
| **Pin Current Root** | Status bar item, while a site is open | Pins the currently-serving root for this workspace |

### Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `seemore.path` | *(bundled copy)* | Path to a `seemore` CLI entry point to use instead of the version bundled with the extension. Leave empty unless you're developing seemore itself. |

## Publish it to the web

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

## What you get by default

Every page arrives with its full text already in it, no placeholder or loading skeleton. Pages start loading as soon as you point at a link, and page transitions animate, without giving up the plain-files output above. Add, rename, retitle, reorder or delete a file and the running preview updates immediately: no restart, no full reload.

Search works out of the box with no server to run and nothing to pay for; if your site grows past what a no-server search index can carry, the build tells you and points at alternatives. If your site lives under a path like `example.com/my-repo/` rather than the root, set `base` once and links, search and assets all follow (a test builds the site under a sub-folder and checks nothing leaks). Since the build is just ordinary files, publishing means dropping that folder on any host; the few conventions individual hosts look for are written for you automatically.

## Content

`.md` and `.mdx` alike, with the format inferred per file, so plain Markdown never needs MDX syntax.

- GitHub Flavoured Markdown, admonitions (note / tip / warning boxes), step-by-step lists, and colour-highlighted code blocks
- `[[wikilinks]]`, including `[[Page|label]]` and `[[Page#Heading]]`, the easiest way for you or your AI to link pages without relative paths to get right
- Relative `.md` links are resolved to working links automatically
- Mermaid diagrams, rendered in the browser
- Sibling images inlined as hashed assets, sibling PDFs open in the browser's own viewer
- Frontmatter (the `key: value` block at the top of a file) is validated, with errors that name the file and the field

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

### Themes

Twelve built-in colour presets: `neutral` (default), `black`, `catppuccin`, `dusk`, `ocean`, `purple`, `ruby`, `solar`, `aspen`, `emerald`, `vitepress`, `shadcn`. For anything else, put your own CSS in `css`; it's appended last, so it wins. Dark and light follow your system setting, with a toggle that remembers your choice.

### Features

A flat list of switches for readers who want fine control. Prefix one with `!` to switch off something that's on by default.

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

Combinations that can't work together raise a config error naming both flags and the fix.

## CLI reference

```
seemore [dir]           start the dev server
seemore build [dir]     build a static site into dist/

Options
  --port <number>        dev server port (default 4040)
  --host [host]          expose the dev server on the network
  --open / --no-open     open a browser on start (default: no)
  --json                 print one machine-readable JSON line instead of the summary (dev only)
  --config <path>        path to seemore.config.ts
  --out <dir>            build output directory (default: dist)
  --base <path>          subpath the site is served from, e.g. /my-repo/
  -h, --help             show this message
  -v, --version          show the version
```

## Under the hood

[fumadocs](https://fumadocs.vercel.app) provides the interface presets, with [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org), [Vite](https://vite.dev) and [React Router](https://reactrouter.com) underneath. The VS Code extension runs the same CLI as a child process it manages. Bug reports and pull requests are welcome at [github.com/arifszn/seemore](https://github.com/arifszn/seemore).

## Licence

[MIT](LICENSE)
