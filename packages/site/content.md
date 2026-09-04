---
title: Content
description: What seemore renders, and how pages get their addresses.
order: 5
---

# Content

Supports `.md` and `.mdx` both.

- GitHub Flavoured Markdown, admonitions (note / tip / warning boxes), step-by-step lists, and colour-highlighted code blocks
- `[[wikilinks]]`, including `[[Page|label]]` and `[[Page#Heading]]`, the easiest way for you or your AI to link pages without relative paths to get right
- Relative `.md` links are resolved to working links automatically
- **[Mermaid](https://mermaid.js.org)** and **[D2](https://d2lang.com)** diagrams, both rendered live in the browser straight from a ` ```mermaid ` or ` ```d2 ` code fence
- Sibling images inlined as hashed assets with click-to-zoom, sibling PDFs open in the browser's own viewer
- Frontmatter keys are validated

## Code blocks

Code fences are highlighted at build time by [Shiki](https://shiki.style), in the theme's own colours.

Settings go on the code fence line, after the language:

````md
```ts title="server.ts" lineNumbers
const port = 4040;
```
````

| On the code fence | Effect |
| --- | --- |
| `title="server.ts"` | Filename bar above the block |
| `lineNumbers` | Numbers down the side; `lineNumbers=5` starts the count at 5 |
| `noCopy` | No copy button on this one block |

Comments mark individual lines and never reach the page — the block below uses all five:

```ts title="marked.ts"
const marked = 1; // [!code highlight]
const added = 2; // [!code ++]
const removed = 3; // [!code --]
const focused = 4; // [!code focus]
const found = 'needle'; // [!code word:needle]
```

| In the code | Effect |
| --- | --- |
| `[!code highlight]` | Marks the line |
| `[!code ++]`, `[!code --]` | Diff lines: green with a `+`, red with a `-` |
| `[!code focus]` | Blurs every other line until the pointer is over the block |
| `[!code word:needle]` | Marks that word everywhere it appears in the block |

The marker follows the language's own comment syntax, so `# [!code highlight]` in Python and `<!-- [!code highlight] -->` in HTML.

The copy button is on by default. `noCopy` drops it from one block; `!content.code.copy` drops it from every block on the site.

## Components

An `.mdx` file can use these without importing anything:

| Component | What it is |
| --- | --- |
| `<Callout type="warn" title="…">` | The box `:::note` produces. `type` is `info`, `warn`, `error`, `success` or `idea` |
| `<Card>`, `<Cards>` | The link cards the generated index page is built from |
| `<CodeBlockTabs>` | One code block per tab — npm, pnpm, yarn, bun |
| `<Mermaid>`, `<D2>` | What a ` ```mermaid ` or ` ```d2 ` code fence compiles to; usable directly |
| `<Pdf>` | The viewer a linked PDF opens in |

The set is deliberately small: Markdown has no imports, so every component is one **seemore** ships to every site whether it is used or not, and these are the ones that pair with something Markdown already expresses. Anything else — fumadocs' `<Tabs>`, `<Accordions>`, `<Files>` among them — fails the build, naming the file and the component. In a plain `.md` file a tag is not JSX at all: it is dropped and its text kept, so components need the `.mdx` extension.

Code tabs need a `defaultValue`, or the block opens with no tab selected and nothing under it. Leave a blank line around each code fence:

````mdx
<CodeBlockTabs defaultValue="npm">
  <CodeBlockTabsList>
    <CodeBlockTabsTrigger value="npm">npm</CodeBlockTabsTrigger>
    <CodeBlockTabsTrigger value="pnpm">pnpm</CodeBlockTabsTrigger>
  </CodeBlockTabsList>
  <CodeBlockTab value="npm">

```bash
npm i seemore
```

  </CodeBlockTab>
  <CodeBlockTab value="pnpm">

```bash
pnpm add seemore
```

  </CodeBlockTab>
</CodeBlockTabs>
````

## Steps

Numbered headings become a numbered sequence, with the rule and the marker drawn for you:

```md
## 1. Install it

## 2. Point it at a folder
```

## Page addresses

| File | Address |
| --- | --- |
| `index.md` | `/` |
| `README.md` (root) | `/` |
| `getting-started.md` | `/getting-started` |
| `guide/index.md` | `/guide` |
| `guide/Deep Dive.md` | `/guide/deep-dive` |

Both `/guide` and `/guide/` work on every host. If nothing claims `/` — no root `index.md`, no root `README.md` — the home page is generated for you: a card grid of every page in the site. In any one directory `index.md` wins over `README.md`, with a warning naming the file it ignored; two different files slugifying to the same address is a build error naming both.

## Ordering

Pages are ordered by:

1. `meta.json` in the directory — an explicit list, with `...` standing in for anything you didn't name:

   ```json
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
