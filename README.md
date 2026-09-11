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
    <a href="https://github.com/arifszn/seemore/stargazers">
      <img src="https://img.shields.io/github/stars/arifszn/seemore"/>
    </a>
    <a href="https://github.com/arifszn/seemore/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/arifszn/seemore"/>
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

AI tools write Markdown faster than anyone can read it: specs, notes, guides, READMEs, whole folders of it. A folder of `.md` files is a dead end: nothing to click, nothing to search, no order.

**seemore** points at that folder and renders it as a proper site instead, without you moving a single file or writing any code.

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/home.png" alt="The seemore site: a terminal typing npx seemore to serve a folder of notes at localhost:4040, with an arrow pointing to the browser preview" width="640"/>
</p>

## Quick start

Requires [Node.js](https://nodejs.org) 20 or newer. Nothing to install, no config file, no files to move.

```bash
cd my-docs
npx seemore   # renders this folder at http://localhost:4040
```

Open the address it prints. From there it's live: add, rename, retitle or delete a file and the site updates immediately, navigation and search included.

The [seemore website](https://arifszn.github.io/seemore) is itself a folder of Markdown rendered by seemore. That's what your own folder will look like.

## Three ways to use it

- **[In your browser](#edit-from-the-browser)**: `npx seemore` serves the folder you're standing in and updates live as you edit.
- **[In your code editor](#view-in-your-code-editor)**: an extension puts the same site in a panel next to the file you're editing, in VS Code and VS Code-compatible editors like Cursor and Antigravity.
- **[As a static site](#publish-it-to-the-web)**: `npx seemore build` exports plain HTML you can host anywhere, so it doubles as a docs framework, not just a preview tool.

<p align="center">
  <video src="https://github.com/user-attachments/assets/248032a6-7e25-4f9f-8d73-089b5302afb0" width="640" controls muted></video>
</p>

## What you get

Point seemore at anything already sitting in Markdown (AI-written notes, project docs, RFCs, API references, specs, an engineering handbook) and you get:

- **Zero config**: no config file, no code, no files to move; a plain folder works in the browser, in your editor, and as a static build
- **Live preview**: files appear, disappear and reorder as you edit them, navigation and search included
- **Edit in place**: double-click any block in the preview to fix its Markdown
- **Editor integration**: one extension covers VS Code, Cursor, Antigravity and other VS Code-compatible editors, remote workspaces included
- **Documentation framework**: `seemore build` prerenders the whole site to HTML, ready to deploy on any host
- **Page actions**: copy a page as Markdown, or export it as one self-contained HTML file to drop into Slack, email or an AI chat
- **Search built in**: static full-text search with no server and no account, with shareable highlighted results; [Algolia](https://algolia.com) and [Orama Cloud](https://orama.com) drop in when you want a hosted index
- **Rich Markdown**: GitHub Flavoured Markdown, admonitions, steps, `[[wikilinks]]`, [Mermaid](https://mermaid.js.org) and [D2](https://d2lang.com) diagrams, click-to-zoom images, embedded PDFs
- **Full MDX**: `.mdx` pages take real JSX, your own React components and CSS
- **12 themes**: dark and light follow the system, with a toggle that remembers your choice; your own CSS always wins

### How it's different

- **Starts where your files already are**: most docs frameworks want a project, with a scaffold, a config file, a `docs/` layout and a build step wired into your repo. seemore wants a folder that already exists.
- **Preview first, site generator second**: the same content serves locally, renders beside your editor, and builds to static HTML, with no separate setup for each.
- **Nothing to migrate, nothing to undo**: your files are never moved or rewritten, so walking away costs nothing.

## Edit from the browser

The preview is also an editor. Double-click any paragraph, heading, list item, quote or table cell and it opens in a small editor holding that block's **Markdown source**: `**bold**` stays `**bold**`, links stay links, tables stay tables. Fix the text, hit **Save**, and the change is written to the file on disk.

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/inline-editor.png" alt="seemore rendering a folder of Markdown in the browser, with a paragraph's Markdown source open in the inline editor" width="640"/>
</p>

Inline editing is for local previews only.

## View in your code editor

Install **seemore** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode) or [Open VSX](https://open-vsx.org/extension/arifszn/seemore-vscode) to get the same rendered site as a panel beside your editor, with no terminal, no `npx` and no browser tab to manage. The extension bundles the CLI, so nothing is downloaded or put on your PATH. Open VSX also covers VS Code-compatible editors such as Cursor and Antigravity.

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/vscode-extension.png" alt="VS Code with features.md open in the editor and the seemore panel beside it, rendering the same page with a paragraph's Markdown source open in the inline editor" width="640"/>
</p>

1. Open any Markdown file.
2. Click the **seemore** icon in the editor's title bar, or right-click a folder in the explorer and choose **Open Folder in seemore**.
3. The rendered site opens beside your editor, scoped to that file's folder.

## Publish it to the web

```bash
npx seemore build  # static export to dist/ for any host
```

The result is a `dist/` folder of plain web files: drop it on [Netlify](https://netlify.com), [Surge](https://surge.sh), [Cloudflare Pages](https://pages.cloudflare.com) or [GitHub Pages](https://pages.github.com), or hand it to any web host. Every page is prerendered to its own `index.html`, next to a `404.html` that every static host honours, and host-specific files (`_redirects`, `200.html`, `.nojekyll`) are written for you.

> [!TIP]
> Publishing to GitHub Pages? Your site lives at `username.github.io/my-repo/` rather than the root, so tell seemore the subpath once with `base: '/my-repo/'`. If you forget, the build prints the exact line to add.

To share a single page instead of a site, the **Actions** button above every page writes one self-contained HTML file (styles inlined, images embedded, diagrams kept) that opens offline from a double-click. The CLI does the same without a browser:

```bash
npx seemore export docs/spec.md   # writes spec.html next to the Markdown
```

More on both in [publishing](https://arifszn.github.io/seemore/publishing).

## Configuration

Configuration is optional; a folder with no config file builds correctly everywhere. To adjust things, create `seemore.config.ts` next to your content:

```ts
// seemore.config.ts
export default {
  title: 'My Docs',
  description: 'Everything about the thing.',
  favicon: './favicon.svg',
  base: '/my-repo/',
  theme: 'ocean',
  css: './custom.css',
  features: { 'navigation.path': true, 'navigation.instant.preview': true },
  nav: [{ text: 'GitHub', link: 'https://github.com/you/repo' }],
  footer: { text: '© 2026' },
  editLink: { base: 'https://github.com/you/repo/edit/main/docs' },
  search: 'static', // or { provider: 'orama-cloud', endpoint, apiKey } / { provider: 'algolia', appId, apiKey, indexName }
  pageActions: ['copy-markdown', 'export-html'],
  exclude: ['drafts/**'],
};
```

`features` is a set of switches. Name the ones you want to change; flags you don't mention keep their default.

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

Every config key above is documented on the [configuration](https://arifszn.github.io/seemore/configuration) and [features](https://arifszn.github.io/seemore/features) pages.

### Themes

Twelve built-in colour presets: `neutral` (default), `black`, `catppuccin`, `dusk`, `ocean`, `purple`, `ruby`, `solar`, `aspen`, `emerald`, `vitepress`, `shadcn`. Dark and light follow your system setting, with a toggle that remembers your choice. For anything else, put your own CSS in `css`; it's appended last, so it wins.

| `neutral` (default) | `black` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/neutral.png" alt="neutral theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/black.png" alt="black theme" width="100%"> |

All twelve are on the [themes page](https://arifszn.github.io/seemore/themes).

## Content

Works with both `.md` and `.mdx`.

- GitHub Flavoured Markdown, admonitions (note / tip / warning boxes), step-by-step lists, and colour-highlighted code blocks with optional filenames and line numbers
- `[[wikilinks]]`, including `[[Page|label]]` and `[[Page#Heading]]`, the easiest way for you or your AI to link pages without relative paths to get right; plain relative `.md` links are resolved automatically too
- **[Mermaid](https://mermaid.js.org)** and **[D2](https://d2lang.com)** diagrams, rendered live in the browser straight from a ` ```mermaid ` or ` ```d2 ` code fence
- Sibling images inlined as hashed assets with click-to-zoom, and PDFs opened inline in the browser's own viewer
- Page order comes from a `meta.json`, a frontmatter `order`, or the title, in that order

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/diagrams.png" alt="A mermaid flowchart reading Markdown, seemore, Static site rendered live on the Diagrams page, with a D2 diagram of the same chain below it" width="640"/>
</p>

Every syntax above, rendered live, is on the [content page](https://arifszn.github.io/seemore/content).

### PDF viewer

Reference a PDF with image syntax, a sibling file or a remote URL, and it opens inline with a download link underneath:

```md
![sample document](./assets/sample.pdf)
```

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/pdf-viewer.png" alt="A sample PDF rendered inline on the page in the browser's native PDF viewer, with a Download sample document link underneath" width="640"/>
</p>

## CLI

```
seemore [dir]           start the dev server
seemore build [dir]     build a static site into dist/
seemore export <file>   export a page as a standalone HTML file
```

Run `seemore --help` for the options, or see the [CLI reference](https://arifszn.github.io/seemore/cli-reference).

## FAQ

**Do I have to install anything?** No. `npx seemore` runs it without installing. If you'd rather have it around permanently, `npm install -g seemore`, or `npm install -D seemore` to pin a version in a project.

**Does anything leave my machine?** No. The dev server, the build and the export all run locally, with no account and no telemetry. The only network calls are ones you configure yourself, such as a hosted search provider.

**Will it move or rewrite my files?** No. seemore reads your folder where it is. It writes only when you save an inline edit, or when you run `build` or `export`.

**Is it a preview tool or a docs framework?** Both, from the same folder: `seemore` previews it, the extension renders it beside your editor, and `seemore build` publishes it.

## Under the hood

[fumadocs](https://fumadocs.vercel.app) provides the interface presets, with [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org), [D2](https://d2lang.com), [Vite](https://vite.dev) and [React Router](https://reactrouter.com) underneath. The code editor extension runs the same CLI as a child process it manages.

## Contributing

Bug reports and pull requests are welcome. [CONTRIBUTING.md](https://github.com/arifszn/seemore/blob/main/CONTRIBUTING.md) covers how to get the repo running, the checks to pass before opening a pull request, and how releases work.

## Star it

If seemore saved you some time, [give it a star](https://github.com/arifszn/seemore). That is how other people find it.

## Licence

[MIT](LICENSE)
