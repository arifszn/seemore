<br/>

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/assets/icon.png" alt="seemore" width="40" height="40">
  <h1 align="center">seemore</h1>
  <h4 align="center">Let AI write the Markdown. Let seemore show it better — zero config documentation framework.</h4>
  <p align="center">
    <a href="https://www.npmjs.com/package/seemore">
      <img src="https://img.shields.io/npm/v/seemore"/>
    </a>
    <a href="https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode">
      <img src="https://img.shields.io/badge/VS_Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white"/>
    </a>
    <a href="https://open-vsx.org/extension/arifszn/seemore-vscode">
      <img src="https://img.shields.io/badge/Open_VSX-Registry-C160EF?logo=eclipseide&logoColor=white"/>
    </a>
    <a href="https://github.com/arifszn/seemore/actions/workflows/ci.yml">
      <img src="https://github.com/arifszn/seemore/actions/workflows/ci.yml/badge.svg"/>
    </a>
    <a href="https://github.com/arifszn/seemore/issues">
      <img src="https://img.shields.io/github/issues/arifszn/seemore"/>
    </a>
    <a href="https://github.com/arifszn/seemore/stargazers">
      <img src="https://img.shields.io/github/stars/arifszn/seemore"/>
    </a>
    <a href="https://github.com/arifszn/seemore">
      <img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat"/>
    </a>
    <a href="https://github.com/arifszn/seemore/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/arifszn/seemore"/>
    </a>
    <a href="https://twitter.com/intent/tweet?url=https://github.com/arifszn/seemore&hashtags=markdown,docs,webdev,opensource">
      <img src="https://img.shields.io/twitter/url?style=social&url=https%3A%2F%2Fgithub.com%2Farifszn%2Fseemore"/>
    </a>
  </p>
  <p align="center">
    <a href="https://arifszn.github.io/seemore">Website</a>
    ·
    <a href="https://github.com/arifszn/seemore/issues">Report Bug</a>
    ·
    <a href="https://github.com/arifszn/seemore/issues/new?labels=enhancement">Request Feature</a>
  </p>
</p>

AI tools write Markdown — specs, notes, guides, READMEs, whole folders of it, faster than
anyone can read. A pile of `.md` files is write-only memory: nothing to click, nothing to
search, no order.

seemore points at that folder and renders it as a proper site instead, without you moving a single file or writing any code.

Three ways to use it:

- **[In your browser](#view-in-your-browser)**: `npx seemore` serves the folder you're standing in and updates live as you edit.
- **[In your code editor](#view-in-your-code-editor)**: an extension puts the same site in a panel next to the file you're editing — VS Code and VS Code-compatible editors like Cursor and Antigravity.
- **[As a static site](#publish-it-to-the-web)**: `npx seemore build` exports plain HTML you can host anywhere, so it doubles as a docs framework, not just a preview tool.

And whichever preview is open, the page is also an editor: **double-click any paragraph to fix its Markdown in place**, and the change is written straight back to the file.

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/inline-editor.png" alt="seemore rendering a folder of Markdown in the browser, with a paragraph's Markdown source open in the inline editor" width="640"/>
</p>

## View in your browser

```bash
npx seemore     # view the current folder in your browser, live, no setup
```

Open a terminal in your folder of Markdown files, run `npx seemore`, and open the address it prints (`http://localhost:4040` by default). From there it's live: add, rename, retitle or delete a file and the site updates immediately, navigation included.

With no folder given, seemore serves the folder you're standing in. Point it at a subfolder with `npx seemore docs` if that's where your files live.

## View in your code editor

Install seemore from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode) or [Open VSX](https://open-vsx.org/extension/arifszn/seemore-vscode) to get the same rendered site as a panel beside your editor. No terminal, no `npx`, no browser tab to manage. Open VSX also covers VS Code-compatible editors — Cursor, Antigravity, and others.

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

## Edit your files from the browser

The preview is not just for reading — it is the fastest way to fix what you are reading. Double-click any paragraph, heading, list item, quote or table cell and it opens in a small editor holding that block's **Markdown source**: `**bold**` stays `**bold**`, links stay links, tables stay tables. Fix the text and hit **Save** — `Ctrl+Enter` (`Cmd+Enter` on a Mac), with `Esc` to cancel — and the change is written to the file on disk. Nothing is written until you say so: clicking away leaves the editor open rather than saving behind your back.

When AI writes your Markdown, this closes the loop. You review the docs the way a reader sees them, double-click the sentence that is wrong, fix it, and you are done — no switching back to the editor, no hunting for the file and line the text came from.

The save is surgical. Every editable block carries its exact character range from the source file, and a save replaces exactly those characters — the rest of the file is left byte for byte as it was, so `git diff` shows the sentence you changed and nothing else. The file's line endings are preserved, and if the file changed since the page was rendered (you edited it in your editor meanwhile), the save is refused and you are asked to reload, rather than one edit clobbering the other. Once saved, the page hot-reloads through the same path an edit made in an editor takes — and it works the same in the VS Code panel, which runs the same dev server.

It is **dev only**: `seemore build` output is static, with no server to write through, so nothing is emitted there.

Not everything is editable. Content seemore rebuilds wholesale — code fences, Mermaid and D2 diagrams — has no source range to write back to, so double-clicking it does nothing. That is deliberate: no pointer means no edit, rather than a wrong write. Constructs where only the *wrapper* is generated, such as GitHub alerts and steps, do let you edit the text inside, but the editor shows the raw source of that block — including the `[!NOTE]` marker and the `>` prefixes — because that is literally what the file says.

This is on by default in dev. Switch it off with the `!` prefix:

```ts
export default defineConfig({
  features: ['!content.edit'],
});
```

> [!NOTE]
> The dev server binds to localhost, so only your machine can reach the endpoint that writes.
> If you serve the site to your network with `--host`, anyone who can open the site can also
> edit your files — pass `features: ['!content.edit']` when you do that.

## Publish it to the web

```bash
npx seemore build  # static export to dist/ for any host
```

The result is a `dist/` folder of plain web files: drop it on [Netlify](https://netlify.com), [Surge](https://surge.sh), [Cloudflare Pages](https://pages.cloudflare.com) or [GitHub Pages](https://pages.github.com), or hand it to any web host.

**On GitHub Pages:** project sites live under `username.github.io/my-repo/`, not the root, so set `base` once:

```ts
export default defineConfig({ base: '/my-repo/' });
```

(or `--base /my-repo/` on the CLI). Building under GitHub Actions without it set prints the exact line to add.

## Configuration

Optional. A folder with no config file builds correctly in the browser, in your code editor, and when built for publishing. If you want to adjust things, create `seemore.config.ts` next to your content:

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

### Themes

Twelve built-in colour presets: `neutral` (default), `black`, `catppuccin`, `dusk`, `ocean`, `purple`, `ruby`, `solar`, `aspen`, `emerald`, `vitepress`, `shadcn`. For anything else, put your own CSS in `css`; it's appended last, so it wins. Dark and light follow your system setting, with a toggle that remembers your choice — `black` is built for dark mode, shown below with the toggle on.

| `neutral` (default) | `black` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/neutral.png" alt="neutral theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/black.png" alt="black theme" width="100%"> |

| `catppuccin` | `dusk` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/catppuccin.png" alt="catppuccin theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/dusk.png" alt="dusk theme" width="100%"> |

| `ocean` | `purple` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/ocean.png" alt="ocean theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/purple.png" alt="purple theme" width="100%"> |

| `ruby` | `solar` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/ruby.png" alt="ruby theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/solar.png" alt="solar theme" width="100%"> |

| `aspen` | `emerald` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/aspen.png" alt="aspen theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/emerald.png" alt="emerald theme" width="100%"> |

| `vitepress` | `shadcn` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/vitepress.png" alt="vitepress theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/shadcn.png" alt="shadcn theme" width="100%"> |

### Features

A flat list of switches for readers who want fine control, set as an array on the `features` key in `seemore.config.ts`. To turn on something that's off by default, add its flag name. To turn off something that's on by default, add its flag name prefixed with `!`.

```ts
// seemore.config.ts
export default defineConfig({
  features: [
    'navigation.path',              // off by default → this turns it on
    '!navigation.instant.prefetch', // on by default → this turns it off
  ],
});
```

Flags you don't mention are left at their default, so you only ever list the ones you're changing.

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
| `content.edit` | on (dev only) | Double-click a block to edit its Markdown in place |
| `content.image.zoom` | on | Click-to-zoom on content images |
| `search.suggest` | on | Inline query completion |
| `search.highlight` | on | Highlight the query on the page you land on |
| `social.cards` | off | Per-page OG images (needs `takumi-js`) |

Combinations that can't work together raise a config error naming both flags and the fix.

## Content

Supports `.md` and `.mdx` both.

- GitHub Flavoured Markdown, admonitions (note / tip / warning boxes), step-by-step lists, and colour-highlighted code blocks
- `[[wikilinks]]`, including `[[Page|label]]` and `[[Page#Heading]]`, the easiest way for you or your AI to link pages without relative paths to get right
- Relative `.md` links are resolved to working links automatically
- **[Mermaid](https://mermaid.js.org)** and **[D2](https://d2lang.com)** diagrams, both rendered live in the browser straight from a ` ```mermaid ` or ` ```d2 ` code fence
- Sibling images inlined as hashed assets, sibling PDFs open in the browser's own viewer
- Frontmatter (the `key: value` block at the top of a file) is validated, with errors that name the file and the field

### Code blocks

Fences are highlighted at build time by [Shiki](https://shiki.style), in the theme's own colours.

Settings go on the fence line, after the language — ` ```ts title="server.ts" lineNumbers `:

| On the fence | Effect |
| --- | --- |
| `title="server.ts"` | Filename bar above the block |
| `lineNumbers` | Numbers down the side; `lineNumbers=5` starts the count at 5 |
| `noCopy` | No copy button on this one block |

Comments mark individual lines and never reach the page:

| In the code | Effect |
| --- | --- |
| `// [!code highlight]` | Marks the line |
| `// [!code ++]`, `// [!code --]` | Diff lines: green with a `+`, red with a `-` |
| `// [!code focus]` | Blurs every other line until the pointer is over the block |
| `// [!code word:needle]` | Marks that word everywhere it appears in the block |

The marker follows the language's own comment syntax, so `# [!code highlight]` in Python and `<!-- [!code highlight] -->` in HTML.

### Components

An `.mdx` file can use `<Callout>`, `<Card>`, `<Cards>`, `<CodeBlockTabs>`, `<Mermaid>`, `<D2>` and `<Pdf>` without importing anything. The set is deliberately small: Markdown has no imports, so every component is one seemore ships to every site whether it is used or not, and these are the ones that pair with something Markdown already expresses. Anything else — fumadocs' `<Tabs>`, `<Accordions>`, `<Files>` among them — fails the build, naming the file and the component. In a plain `.md` file a tag is not JSX at all: it is dropped and its text kept, so components need the `.mdx` extension. The [Content page](https://arifszn.github.io/seemore/content) has the details.

Numbered headings — `## 1. Install it`, `## 2. Point it at a folder` — become a numbered sequence.

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

1. `meta.json` in the directory — an explicit list, with `...` standing in for anything you didn't name:

   ```json
   // guide/meta.json
   { "pages": ["getting-started", "installation", "..."] }
   ```

2. Frontmatter `order` — lower numbers first:

   ```md
   ---
   title: Getting Started
   order: 1
   ---
   ```

3. Alphabetical by title, for anything left unordered by the two above

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

[fumadocs](https://fumadocs.vercel.app) provides the interface presets, with [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org), [D2](https://d2lang.com), [Vite](https://vite.dev) and [React Router](https://reactrouter.com) underneath. The code editor extension runs the same CLI as a child process it manages. Bug reports and pull requests are welcome at [github.com/arifszn/seemore](https://github.com/arifszn/seemore).

## Licence

[MIT](LICENSE)
