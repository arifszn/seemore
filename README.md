<br/>

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/assets/logo.png" alt="seemore" width="280">
  <h4 align="center">Let AI write the Markdown. Let seemore show it better — zero config documentation framework.</h4>
  <p align="center">
    <a href="https://www.npmjs.com/package/seemore">
      <img src="https://img.shields.io/npm/v/seemore"/>
    </a>
    <a href="https://open-vsx.org/extension/arifszn/seemore-vscode">
      <img src="https://img.shields.io/badge/Open_VSX-Registry-C160EF?logo=eclipseide&logoColor=white"/>
    </a>
    <a href="https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode">
      <img src="https://img.shields.io/badge/VS_Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white"/>
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

AI tools write Markdown fast. They write specs, notes, guides, READMEs, and whole folders of files. No person can read that much Markdown at that speed.

A folder of `.md` files has no order. You cannot click a link between files. You cannot search across them.

**seemore** points at that folder and renders it as a real site. Other docs frameworks need a project first: a scaffold, a config file, a `docs/` layout, and a build step in your repo. seemore needs only a folder that already exists. It does not move your files, and it does not need any code. If you stop using seemore, your files stay where they are.

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/home.png" alt="The seemore site: a terminal typing npx seemore to serve a folder of notes at localhost:4040, with an arrow pointing to the browser preview" width="640"/>
</p>

## Quick start

seemore needs [Node.js](https://nodejs.org) 20 or newer.

```bash
cd my-docs
npx seemore   # renders this folder at http://localhost:4040
```

`npx seemore` runs seemore without adding it to your dependencies. Open the address it prints. Add, rename, retitle, or delete a file, and the site updates at once. Navigation and search update too.

The [seemore website](https://arifszn.github.io/seemore) is a folder of Markdown, rendered by seemore. Your own folder will look the same way.

<details open>
<summary><strong>Or ask an AI agent to set it up</strong></summary>
<br/>

If you do not want to use a terminal, use the [agent skill](https://github.com/arifszn/seemore-skill) instead. It does the setup for you.

### Claude Code (Plugin Marketplace)

```bash
/plugin marketplace add arifszn/seemore-skill
```

```bash
/plugin install seemore
```

### Other agents (Codex, OpenCode, Antigravity, Gemini, Cursor, …)

This skill works in any agent that supports the `SKILL.md` format. See **[INSTALL.md](https://github.com/arifszn/seemore-skill/blob/main/INSTALL.md)** for the skill path and commands for each agent.

Or paste this to your agent:

```
Fetch and follow the install instructions from
https://raw.githubusercontent.com/arifszn/seemore-skill/refs/heads/main/INSTALL.md
```

### Usage

After you install the skill, tell your agent what you want:

```
Turn this folder of notes into a docs site I can read in my browser
```

Or call the skill by name:

```
/seemore
```

</details>

<p align="center">
  <video src="https://github.com/user-attachments/assets/dd8280d2-fc8a-47c9-b2db-b1a1ccde81ce" width="640" controls muted></video>
</p>

## What you get

Point seemore at any Markdown you already have: AI-written notes, project docs, RFCs, API references, specs, or an engineering handbook. You get:

- **Zero config**: no config file, no code, no files to move
- **Live preview**: files appear, disappear and reorder as you edit them
- **Edit in place**: double-click any block in the preview to fix its Markdown
- **Editor integration**: one extension covers VS Code, Cursor, Antigravity and other VS Code-compatible editors, including remote workspaces
- **Documentation framework**: `seemore build` renders the whole site to HTML, ready to deploy on any host
- **Password protection**: protect the built site with one shared password, with no server required
- **Page actions**: copy a page as Markdown, or export it as one self-contained HTML file to drop into Slack, email or an AI chat
- **Search built in**: static full-text search with no server and no account, with shareable highlighted results. [Algolia](https://algolia.com) and [Orama Cloud](https://orama.com) drop in when you want a hosted index
- **Rich Markdown**: GitHub Flavoured Markdown, admonitions, steps, `[[wikilinks]]`, [Mermaid](https://mermaid.js.org) and [D2](https://d2lang.com) diagrams, click-to-zoom images, embedded PDFs
- **Full MDX**: `.mdx` pages take real JSX, your own React components and CSS
- **12 themes**: dark and light follow the system, with a toggle that remembers your choice. Your own CSS always wins

## Edit from the browser

The preview is also an editor. Double-click any paragraph, heading, list item, quote or table cell. A small editor opens with that block's **Markdown source**: `**bold**` stays `**bold**`, links stay links, tables stay tables. Fix the text, press **Save**, and seemore writes the change to the file on disk.

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/inline-editor.png" alt="seemore rendering a folder of Markdown in the browser, with a paragraph's Markdown source open in the inline editor" width="640"/>
</p>

Inline editing works only for local previews.

## View in your code editor

Install **seemore** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode) or [Open VSX](https://open-vsx.org/extension/arifszn/seemore-vscode). You get the same rendered site as a panel beside your editor, with no terminal and no browser tab to manage. The extension bundles the CLI, so nothing downloads and nothing goes on your PATH.

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

The result is a `dist/` folder of plain web files. Drop it on [Netlify](https://netlify.com), [Surge](https://surge.sh), [Cloudflare Pages](https://pages.cloudflare.com) or [GitHub Pages](https://pages.github.com), or hand it to any web host.

> [!TIP]
> Do you publish to GitHub Pages at `username.github.io/my-repo/`, not at the root? Set the subpath once with `base: '/my-repo/'`.

### Password-protect a site

Add `auth: true` to `seemore.config.ts`. Set the password when you build:

```bash
SEEMORE_PASSWORD='a-long-passphrase' npx seemore build
```

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/password-protection.png" alt="The lock screen of a password-protected seemore site: the site's icon and title above a password field and an Unlock button" width="560"/>
</p>

seemore encrypts the site content, so nobody can read a copy of the build without the password. A short password can be guessed offline, so use a long one.

### Share a single page to Slack, email

To share one page instead of a site, use the **Actions** button above the page. It writes one self-contained HTML file that opens offline from a double-click. The CLI does the same without a browser:

```bash
npx seemore export docs/spec.md   # writes spec.html next to the Markdown
```

Read more about all three methods on the [publishing](https://arifszn.github.io/seemore/publishing) page.

## Configuration

Configuration is optional. A folder with no config file builds correctly everywhere. To change settings, create `seemore.config.ts` next to your content:

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
  include: ['.notes'], // dot folders, build/, dist/ and similar are skipped unless listed here
  auth: true,
};
```

`features` is a set of switches for breadcrumbs, prefetching, the table of contents, code-block buttons and more. Name only the flags you want to change. Every other flag keeps its default value. The [configuration](https://arifszn.github.io/seemore/configuration) and [features](https://arifszn.github.io/seemore/features) pages document every key.

### Themes

seemore has twelve built-in colour presets: `neutral` (default), `black`, `catppuccin`, `dusk`, `ocean`, `purple`, `ruby`, `solar`, `aspen`, `emerald`, `vitepress`, `shadcn`. Dark and light modes follow your system setting, with a toggle that remembers your choice. For anything else, put your own CSS in `css`. seemore appends it last, so it wins.

| `neutral` (default) | `black` |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/neutral.png" alt="neutral theme" width="100%"> | <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/themes/black.png" alt="black theme" width="100%"> |

The [themes page](https://arifszn.github.io/seemore/themes) shows all twelve.

## Content

Works with both `.md` and `.mdx`. **[Mermaid](https://mermaid.js.org)** and **[D2](https://d2lang.com)** diagrams render live in the browser, straight from a ` ```mermaid ` or ` ```d2 ` code fence:

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/diagrams.png" alt="A mermaid flowchart reading Markdown, seemore, Static site rendered live on the Diagrams page, with a D2 diagram of the same chain below it" width="640"/>
</p>

Reference a PDF with image syntax, and it opens inline with a download link underneath:

```md
![sample document](./assets/sample.pdf)
```

<p align="center">
  <img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/site/assets/pdf-viewer.png" alt="A sample PDF rendered inline on the page in the browser's native PDF viewer, with a Download sample document link underneath" width="640"/>
</p>

Page order comes from a `meta.json` file, a frontmatter `order` field, or the title, checked in that order. The [content page](https://arifszn.github.io/seemore/content) renders every syntax seemore supports, live.

## CLI

```
seemore [dir]           start the dev server
seemore build [dir]     build a static site into dist/
seemore export <file>   export a page as a standalone HTML file
```

Run `seemore --help` to see the options, or see the [CLI reference](https://arifszn.github.io/seemore/cli-reference) page.

## FAQ

**Does anything leave my machine?** No. The dev server, the build and the export all run locally, with no account and no telemetry. The only network calls are ones you configure yourself, such as a hosted search provider.

**Does seemore move or rewrite my files?** No. seemore reads your folder in place. It writes to a file only when you save an inline edit, or run `build` or `export`.

**Is the password protection real?** Yes. The content is encrypted at build time. There is no per-person access, and no way to revoke one password alone.

## Under the hood

[fumadocs](https://fumadocs.vercel.app) provides the interface presets. [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org), [D2](https://d2lang.com), [Vite](https://vite.dev) and [React Router](https://reactrouter.com) run underneath it. The code editor extension runs the same CLI as a child process it manages.

## Contributing

seemore welcomes bug reports and pull requests. [CONTRIBUTING.md](https://github.com/arifszn/seemore/blob/main/CONTRIBUTING.md) covers how to get the repo running, the checks a pull request must pass, and how releases work.

## Star it

If seemore saved you time, [give it a star](https://github.com/arifszn/seemore). A star helps other people find it.

## Licence

[MIT](LICENSE)
